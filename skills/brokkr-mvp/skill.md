# BrokkrMVP Webhook Protocol Skill

## CRITICAL: Follow This Protocol Exactly

This skill documents the BrokkrMVP webhook integration protocol. **Follow every step exactly. No deviations.**

If something fails, **build a validation script** to diagnose the issue before attempting fixes.

---

## Protocol Overview

```
BrokkrMVP                                    Brokkr Agent
    │                                              │
    │──── GET /health ────────────────────────────►│
    │◄─── { status, queueDepth } ─────────────────│
    │                                              │
    │──── POST /webhook (fat payload) ────────────►│
    │     X-Agent-Id, X-Timestamp, X-Signature     │
    │◄─── { status: accepted, queue_position } ───│
    │                                              │
    │                                    [Process] │
    │                                              │
    │◄─── POST /api/agent/callback/{task_id} ─────│
    │     { status: completed, output_data }       │
    │                                              │
    │◄─── POST /api/agent/heartbeat ──────────────│
    │     (every 30 seconds)                       │
```

---

## Configuration

**File:** `skills/brokkr-mvp/config.json`

```json
{
  "agent_id": "YOUR_AGENT_UUID",
  "webhook_secret": "YOUR_SHARED_SECRET",
  "api_url": "https://api.brokkr.app",
  "capabilities": ["equipment_research", "contact_research", "content_generation"],
  "version": "2.0.0"
}
```

**REQUIRED:** Replace placeholder values before deployment.

---

## Incoming Webhook Events

### 1. task.created

New task assigned to agent. **Begin processing immediately.**

```json
{
  "event": "task.created",
  "task": {
    "id": "uuid",
    "task_type": "equipment_research",
    "priority": 75,
    "input_data": { ... },
    "messages": [],
    "session_code": "xyz"
  },
  "response_schema": { ... }
}
```

### 2. task.clarification

User responded to clarification request. **Continue processing.**

```json
{
  "event": "task.clarification",
  "task": {
    "id": "uuid",
    "messages": [
      { "role": "agent", "content": "What size?" },
      { "role": "user", "content": "3mm" }
    ]
  }
}
```

### 3. task.cancelled

User cancelled task. **Stop processing immediately.**

```json
{
  "event": "task.cancelled",
  "task": { "id": "uuid", "session_code": "xyz" }
}
```

---

## Outgoing Callbacks

### Callback URL

```
POST https://api.brokkr.app/api/agent/callback/{task_id}
```

### Required Headers

```
X-Agent-Id: {agent_uuid}
X-Timestamp: {unix_timestamp}
X-Signature: sha256={hmac_signature}
Content-Type: application/json
```

### Status Values

| Status | When to Use | Required Fields |
|--------|-------------|-----------------|
| `processing` | Task running > 30 seconds | `messages` |
| `needs_input` | Clarification needed | `messages` (with question) |
| `completed` | Task finished successfully | `output_data`, `messages`, `usage` |
| `failed` | Task could not complete | `error_message` |

### Callback Payload Example (completed)

```json
{
  "status": "completed",
  "output_data": {
    "equipment_matches": [...],
    "recommendation": "..."
  },
  "messages": [
    { "role": "agent", "content": "Found 2 matches", "timestamp": "..." }
  ],
  "usage": {
    "model_id": "claude-sonnet-4-20250514",
    "input_tokens": 1250,
    "output_tokens": 450,
    "total_tokens": 1700,
    "duration_ms": 3500,
    "api_calls": 1
  },
  "session_code": "xyz"
}
```

---

## Heartbeat

**Endpoint:** `POST https://api.brokkr.app/api/agent/heartbeat`

**Frequency:** Every 30 seconds

**Payload:**

```json
{
  "queue_depth": 3,
  "status": "healthy",
  "processing_task_ids": ["uuid1", "uuid2"],
  "version": "2.0.0",
  "capabilities": ["equipment_research", ...]
}
```

**Status Values:**
- `healthy` - Normal operation
- `degraded` - Experiencing issues (3+ consecutive callback failures)
- `draining` - Not accepting new tasks

---

## HMAC Signature Calculation

```javascript
const crypto = require('crypto');

function calculateSignature(timestamp, body, secret) {
  const message = timestamp + '.' + JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return 'sha256=' + hmac;
}
```

**Verification:**
1. Extract `X-Timestamp` header
2. Reject if timestamp > 300 seconds old
3. Calculate expected signature
4. Compare with `X-Signature` header

---

## Error Handling

### Callback Failures

1. Retry 3 times with exponential backoff (1s, 2s, 4s)
2. Include `retry_count` in payload on retries
3. Log failure after 3 attempts
4. Status becomes `degraded` after 3 consecutive failures

### Webhook Rejections

| Response | Meaning |
|----------|---------|
| `401 Invalid signature` | HMAC verification failed |
| `401 Request timestamp expired` | Timestamp > 5 minutes old |
| `400 Unknown event type` | Unsupported event in payload |
| `404 Task not found` | Clarification for unknown task |

---

## Validation Scripts

### Test HMAC Signing

```bash
node skills/brokkr-mvp/validation/test-hmac.js
```

### Test Callback

```bash
node skills/brokkr-mvp/validation/test-callback.js
```

---

## Debugging Checklist

If webhooks fail:

1. [ ] Check `skills/brokkr-mvp/config.json` has correct credentials
2. [ ] Run `node skills/brokkr-mvp/validation/test-hmac.js`
3. [ ] Check server logs for signature errors
4. [ ] Verify timestamp is within 5 minutes

If callbacks fail:

1. [ ] Check network connectivity to `api.brokkr.app`
2. [ ] Run `node skills/brokkr-mvp/validation/test-callback.js`
3. [ ] Check for 3+ consecutive failures (status: degraded)
4. [ ] Verify agent_id matches BrokkrMVP registration

If heartbeat fails:

1. [ ] Check console for `[Heartbeat] API POST error` messages
2. [ ] Verify `api_url` in config is correct
3. [ ] Check if agent shows as offline in BrokkrMVP dashboard
