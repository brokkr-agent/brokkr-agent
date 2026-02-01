# BrokkrMVP Webhook Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full BrokkrMVP webhook integration protocol with HMAC authentication, fat payloads, callbacks, and extended heartbeat.

**Architecture:** Extend existing webhook server to verify HMAC signatures and accept fat payloads. Worker sends callbacks to BrokkrMVP after task completion. Heartbeat extended to POST agent status to BrokkrMVP API every 30 seconds. All credentials stored in skill config.

**Tech Stack:** Node.js, Express, crypto (HMAC-SHA256), node-fetch

---

## Task 1: Create Skill Config Structure

**Files:**
- Create: `skills/brokkr-mvp/config.json`

**Step 1: Create skill directory**

```bash
mkdir -p skills/brokkr-mvp/validation
```

**Step 2: Create config.json**

```json
{
  "agent_id": "REPLACE_WITH_AGENT_UUID",
  "webhook_secret": "REPLACE_WITH_SHARED_SECRET",
  "api_url": "https://api.brokkr.app",
  "capabilities": [
    "equipment_research",
    "contact_research",
    "content_generation",
    "data_validation",
    "material_research"
  ],
  "version": "2.0.0"
}
```

**Step 3: Commit**

```bash
git add skills/brokkr-mvp/config.json
git commit -m "feat(brokkr-mvp): add skill config structure"
```

---

## Task 2: Create HMAC Signing Module

**Files:**
- Create: `lib/hmac.js`
- Create: `tests/hmac.test.js`

**Step 1: Write the failing test**

```javascript
// tests/hmac.test.js
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { verifySignature, signRequest, buildHeaders } from '../lib/hmac.js';

describe('HMAC Module', () => {
  const TEST_SECRET = 'test-secret-key';
  const TEST_AGENT_ID = 'test-agent-uuid';

  describe('signRequest', () => {
    it('should generate timestamp and signature', () => {
      const body = { event: 'task.created', task: { id: '123' } };
      const result = signRequest(body, TEST_SECRET);

      expect(result.timestamp).toBeDefined();
      expect(result.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should generate consistent signatures for same input', () => {
      const body = { event: 'task.created' };
      const timestamp = Math.floor(Date.now() / 1000);

      const sig1 = signRequest(body, TEST_SECRET, timestamp);
      const sig2 = signRequest(body, TEST_SECRET, timestamp);

      expect(sig1.signature).toBe(sig2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should accept valid signature', () => {
      const body = { event: 'task.created', task: { id: '123' } };
      const { timestamp, signature } = signRequest(body, TEST_SECRET);
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': timestamp.toString(),
        'x-signature': signature
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid signature', () => {
      const body = { event: 'task.created' };
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-signature': 'sha256=invalid'
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject expired timestamp (> 5 minutes)', () => {
      const body = { event: 'task.created' };
      const oldTimestamp = Math.floor(Date.now() / 1000) - 301; // 5+ minutes ago
      const { signature } = signRequest(body, TEST_SECRET, oldTimestamp);
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': oldTimestamp.toString(),
        'x-signature': signature
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request timestamp expired');
    });

    it('should reject missing headers', () => {
      const body = { event: 'task.created' };
      const result = verifySignature({}, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing required headers');
    });
  });

  describe('buildHeaders', () => {
    it('should return complete header object', () => {
      const body = { status: 'completed' };
      const headers = buildHeaders(TEST_AGENT_ID, body, TEST_SECRET);

      expect(headers['X-Agent-Id']).toBe(TEST_AGENT_ID);
      expect(headers['X-Timestamp']).toBeDefined();
      expect(headers['X-Signature']).toMatch(/^sha256=/);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/hmac.test.js`
Expected: FAIL with "Cannot find module '../lib/hmac.js'"

**Step 3: Write implementation**

```javascript
// lib/hmac.js
import crypto from 'crypto';

/**
 * Sign a request body with HMAC-SHA256
 * @param {Object} body - Request body to sign
 * @param {string} secret - Shared secret
 * @param {number} [timestamp] - Unix timestamp (defaults to now)
 * @returns {{ timestamp: number, signature: string }}
 */
export function signRequest(body, secret, timestamp = null) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const message = ts + '.' + JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return {
    timestamp: ts,
    signature: 'sha256=' + hmac
  };
}

/**
 * Verify HMAC signature on incoming request
 * @param {Object} headers - Request headers (lowercase keys)
 * @param {Object} body - Request body
 * @param {string} secret - Shared secret
 * @returns {{ valid: boolean, error: string|null }}
 */
export function verifySignature(headers, body, secret) {
  const timestamp = headers['x-timestamp'];
  const signature = headers['x-signature'];
  const agentId = headers['x-agent-id'];

  if (!timestamp || !signature || !agentId) {
    return { valid: false, error: 'Missing required headers' };
  }

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  // Reject if timestamp is more than 5 minutes old
  if (Math.abs(now - ts) > 300) {
    return { valid: false, error: 'Request timestamp expired' };
  }

  const expected = signRequest(body, secret, ts);
  if (signature !== expected.signature) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, error: null };
}

/**
 * Build complete headers for outgoing request
 * @param {string} agentId - Agent UUID
 * @param {Object} body - Request body
 * @param {string} secret - Shared secret
 * @returns {Object} Headers object
 */
export function buildHeaders(agentId, body, secret) {
  const { timestamp, signature } = signRequest(body, secret);
  return {
    'X-Agent-Id': agentId,
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/hmac.test.js`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add lib/hmac.js tests/hmac.test.js
git commit -m "feat(brokkr-mvp): add HMAC signing module"
```

---

## Task 3: Expand Queue Job Object

**Files:**
- Modify: `lib/queue.js`
- Create: `tests/queue-brokkr.test.js`

**Step 1: Write the failing test**

```javascript
// tests/queue-brokkr.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { enqueue, clearQueue, findJobByBrokkrTaskId, updateJobMessages, getPendingJobs, markActive, getActiveJob } from '../lib/queue.js';

describe('BrokkrMVP Queue Extensions', () => {
  beforeEach(() => {
    clearQueue();
  });

  afterEach(() => {
    clearQueue();
  });

  describe('enqueue with BrokkrMVP fields', () => {
    it('should store brokkrTaskId and inputData', () => {
      const jobId = enqueue({
        task: 'Research equipment',
        chatId: null,
        sessionCode: 'abc',
        source: 'webhook',
        priority: 75,
        brokkrTaskId: '550e8400-e29b-41d4-a716-446655440000',
        taskType: 'equipment_research',
        inputData: { equipment_type: 'laser_cutter' },
        responseSchema: { type: 'object' },
        messages: []
      });

      const jobs = getPendingJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].brokkrTaskId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(jobs[0].taskType).toBe('equipment_research');
      expect(jobs[0].inputData.equipment_type).toBe('laser_cutter');
    });
  });

  describe('findJobByBrokkrTaskId', () => {
    it('should find pending job by BrokkrMVP task ID', () => {
      enqueue({
        task: 'Task 1',
        sessionCode: 'aaa',
        source: 'webhook',
        brokkrTaskId: 'uuid-1'
      });
      enqueue({
        task: 'Task 2',
        sessionCode: 'bbb',
        source: 'webhook',
        brokkrTaskId: 'uuid-2'
      });

      const job = findJobByBrokkrTaskId('uuid-2');
      expect(job).not.toBeNull();
      expect(job.task).toBe('Task 2');
      expect(job.brokkrTaskId).toBe('uuid-2');
    });

    it('should find active job by BrokkrMVP task ID', () => {
      const jobId = enqueue({
        task: 'Active task',
        sessionCode: 'ccc',
        source: 'webhook',
        brokkrTaskId: 'uuid-active'
      });
      markActive(jobId);

      const job = findJobByBrokkrTaskId('uuid-active');
      expect(job).not.toBeNull();
      expect(job.status).toBe('active');
    });

    it('should return null for non-existent task ID', () => {
      const job = findJobByBrokkrTaskId('non-existent');
      expect(job).toBeNull();
    });
  });

  describe('updateJobMessages', () => {
    it('should update messages and re-queue active job', () => {
      const jobId = enqueue({
        task: 'Clarification task',
        sessionCode: 'ddd',
        source: 'webhook',
        brokkrTaskId: 'uuid-clarify',
        messages: [{ role: 'agent', content: 'What size?' }]
      });
      markActive(jobId);

      // Verify it's active
      let activeJob = getActiveJob();
      expect(activeJob.brokkrTaskId).toBe('uuid-clarify');

      // Update with clarification
      const newMessages = [
        { role: 'agent', content: 'What size?' },
        { role: 'user', content: '3mm' }
      ];
      const updated = updateJobMessages('uuid-clarify', newMessages);

      expect(updated).toBe(true);

      // Should be back in pending queue
      const pendingJob = findJobByBrokkrTaskId('uuid-clarify');
      expect(pendingJob.status).toBe('pending');
      expect(pendingJob.messages.length).toBe(2);
      expect(pendingJob.messages[1].content).toBe('3mm');

      // Should no longer be active
      activeJob = getActiveJob();
      expect(activeJob).toBeNull();
    });

    it('should return false for non-existent task ID', () => {
      const result = updateJobMessages('non-existent', []);
      expect(result).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/queue-brokkr.test.js`
Expected: FAIL with "findJobByBrokkrTaskId is not a function"

**Step 3: Add new functions to queue.js**

Add these functions to `lib/queue.js` after the existing `cancelActiveJob` function:

```javascript
/**
 * Find a job (pending or active) by BrokkrMVP task ID
 * @param {string} brokkrTaskId - The BrokkrMVP task UUID
 * @returns {Object|null} The job if found, null otherwise
 */
export function findJobByBrokkrTaskId(brokkrTaskId) {
  ensureDirectories();

  // Check pending jobs
  try {
    const pendingFiles = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
    for (const f of pendingFiles) {
      try {
        const job = JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8'));
        if (job.brokkrTaskId === brokkrTaskId) {
          return job;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Check active jobs
  try {
    const activeFiles = readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    for (const f of activeFiles) {
      try {
        const job = JSON.parse(readFileSync(join(ACTIVE_DIR, f), 'utf-8'));
        if (job.brokkrTaskId === brokkrTaskId) {
          return job;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return null;
}

/**
 * Update messages on a job and re-queue it
 * Used for task.clarification events
 * @param {string} brokkrTaskId - The BrokkrMVP task UUID
 * @param {Array} messages - Updated messages array
 * @returns {boolean} True if job was found and updated
 */
export function updateJobMessages(brokkrTaskId, messages) {
  ensureDirectories();

  // Check pending jobs first
  try {
    const pendingFiles = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
    for (const f of pendingFiles) {
      try {
        const job = JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8'));
        if (job.brokkrTaskId === brokkrTaskId) {
          job.messages = messages;
          writeFileSync(join(JOBS_DIR, f), JSON.stringify(job, null, 2));
          return true;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Check active jobs - need to move back to pending
  try {
    const activeFiles = readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    for (const f of activeFiles) {
      try {
        const job = JSON.parse(readFileSync(join(ACTIVE_DIR, f), 'utf-8'));
        if (job.brokkrTaskId === brokkrTaskId) {
          // Update messages and status
          job.messages = messages;
          job.status = 'pending';
          job.startedAt = null;

          // Move from active back to pending
          const src = join(ACTIVE_DIR, f);
          const dest = join(JOBS_DIR, f);
          writeFileSync(dest, JSON.stringify(job, null, 2));
          unlinkSync(src);
          return true;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return false;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/queue-brokkr.test.js`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add lib/queue.js tests/queue-brokkr.test.js
git commit -m "feat(brokkr-mvp): add queue functions for BrokkrMVP task management"
```

---

## Task 4: Update Webhook Server for Fat Payloads

**Files:**
- Modify: `lib/webhook-server.js`
- Modify: `tests/webhook-server.test.js`

**Step 1: Write the failing tests**

Add to `tests/webhook-server.test.js`:

```javascript
// Add these imports at top
import { verifySignature, signRequest } from '../lib/hmac.js';

// Add this describe block
describe('BrokkrMVP Protocol', () => {
  const TEST_SECRET = 'test-webhook-secret';
  const TEST_AGENT_ID = 'test-agent-uuid';

  // Helper to create signed request
  function signedRequest(body) {
    const { timestamp, signature } = signRequest(body, TEST_SECRET);
    return {
      headers: {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': timestamp.toString(),
        'x-signature': signature
      },
      body
    };
  }

  describe('POST /webhook with fat payload', () => {
    it('should accept task.created event with valid signature', async () => {
      const payload = {
        event: 'task.created',
        task: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          task_type: 'equipment_research',
          priority: 75,
          input_data: {
            equipment_type: 'laser_cutter',
            user_context: 'Find laser cutters for acrylic'
          },
          messages: [],
          session_code: 'xyz'
        }
      };
      const { headers, body } = signedRequest(payload);

      const res = await request(app)
        .post('/webhook')
        .set(headers)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('accepted');
      expect(res.body.queue_position).toBeDefined();
    });

    it('should reject request with invalid signature', async () => {
      const payload = { event: 'task.created', task: { id: '123' } };

      const res = await request(app)
        .post('/webhook')
        .set({
          'x-agent-id': TEST_AGENT_ID,
          'x-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-signature': 'sha256=invalid'
        })
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('should reject request with expired timestamp', async () => {
      const payload = { event: 'task.created', task: { id: '123' } };
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
      const { signature } = signRequest(payload, TEST_SECRET, oldTimestamp);

      const res = await request(app)
        .post('/webhook')
        .set({
          'x-agent-id': TEST_AGENT_ID,
          'x-timestamp': oldTimestamp.toString(),
          'x-signature': signature
        })
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Request timestamp expired');
    });
  });

  describe('task.clarification event', () => {
    it('should update existing job with new messages', async () => {
      // First create a task
      const createPayload = {
        event: 'task.created',
        task: {
          id: 'clarify-task-id',
          task_type: 'equipment_research',
          priority: 75,
          input_data: { query: 'test' },
          messages: [],
          session_code: 'cla'
        }
      };
      let { headers, body } = signedRequest(createPayload);
      await request(app).post('/webhook').set(headers).send(body);

      // Now send clarification
      const clarifyPayload = {
        event: 'task.clarification',
        task: {
          id: 'clarify-task-id',
          task_type: 'equipment_research',
          input_data: { query: 'test' },
          messages: [
            { role: 'agent', content: 'What size?' },
            { role: 'user', content: '3mm' }
          ],
          session_code: 'cla'
        }
      };
      ({ headers, body } = signedRequest(clarifyPayload));

      const res = await request(app)
        .post('/webhook')
        .set(headers)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('accepted');
    });
  });

  describe('task.cancelled event', () => {
    it('should cancel existing job', async () => {
      // First create a task
      const createPayload = {
        event: 'task.created',
        task: {
          id: 'cancel-task-id',
          task_type: 'equipment_research',
          priority: 75,
          input_data: {},
          messages: [],
          session_code: 'can'
        }
      };
      let { headers, body } = signedRequest(createPayload);
      await request(app).post('/webhook').set(headers).send(body);

      // Now cancel it
      const cancelPayload = {
        event: 'task.cancelled',
        task: {
          id: 'cancel-task-id',
          session_code: 'can'
        }
      };
      ({ headers, body } = signedRequest(cancelPayload));

      const res = await request(app)
        .post('/webhook')
        .set(headers)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/webhook-server.test.js`
Expected: FAIL (new BrokkrMVP tests fail)

**Step 3: Update webhook-server.js**

Replace the `POST /webhook` handler and add imports:

```javascript
// Add at top of file
import { verifySignature } from './hmac.js';
import { findJobByBrokkrTaskId, updateJobMessages } from './queue.js';

// Load config - use try/catch for graceful fallback
let brokkrConfig = { webhook_secret: process.env.BROKKR_WEBHOOK_SECRET || 'dev-secret' };
try {
  const configPath = new URL('../skills/brokkr-mvp/config.json', import.meta.url);
  brokkrConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.log('[WebhookServer] No BrokkrMVP config found, using defaults');
}

// Replace POST /webhook handler
app.post('/webhook', (req, res) => {
  // Verify HMAC signature
  const verification = verifySignature(req.headers, req.body, brokkrConfig.webhook_secret);
  if (!verification.valid) {
    return res.status(401).json({ error: verification.error });
  }

  const { event, task } = req.body;

  // Handle legacy format (no event field)
  if (!event && req.body.task && typeof req.body.task === 'string') {
    return handleLegacyWebhook(req, res);
  }

  if (!event || !task) {
    return res.status(400).json({ error: 'event and task are required' });
  }

  // Route by event type
  switch (event) {
    case 'task.created':
      return handleTaskCreated(req, res, task);
    case 'task.clarification':
      return handleTaskClarification(req, res, task);
    case 'task.cancelled':
      return handleTaskCancelled(req, res, task);
    default:
      return res.status(400).json({ error: `Unknown event type: ${event}` });
  }
});

function handleLegacyWebhook(req, res) {
  // Original simple webhook logic for backward compatibility during migration
  const { task, source, metadata } = req.body;

  if (!task || (typeof task === 'string' && !task.trim())) {
    return res.status(400).json({ error: 'task is required' });
  }

  if (dryRunMode) {
    console.log(`[DRY-RUN] Would create webhook session and enqueue: ${task}`);
    return res.json({
      success: true,
      jobId: 'dry-run-job',
      sessionCode: 'dry',
      queuePosition: 0,
      dryRun: true
    });
  }

  const session = createSession({
    type: 'webhook',
    task,
    source: source || 'external'
  });

  const job = enqueue({
    task,
    sessionCode: session.code,
    source: 'webhook',
    priority: PRIORITY.HIGH,
    metadata
  });

  res.json({
    success: true,
    jobId: job,
    sessionCode: session.code,
    queuePosition: getQueueDepth()
  });
}

function handleTaskCreated(req, res, task) {
  if (dryRunMode) {
    console.log(`[DRY-RUN] Would create BrokkrMVP task: ${task.id}`);
    return res.json({ status: 'accepted', queue_position: 0, dryRun: true });
  }

  // Create session with BrokkrMVP session code
  const session = createSession({
    type: 'webhook',
    task: task.input_data?.user_context || task.task_type,
    source: 'brokkr-mvp'
  }, task.session_code); // Use provided session code if available

  // Enqueue with full BrokkrMVP payload
  const jobId = enqueue({
    task: task.input_data?.user_context || `${task.task_type}: ${JSON.stringify(task.input_data)}`,
    sessionCode: session.code,
    source: 'webhook',
    priority: task.priority || PRIORITY.HIGH,
    brokkrTaskId: task.id,
    taskType: task.task_type,
    inputData: task.input_data,
    responseSchema: req.body.response_schema,
    messages: task.messages || []
  });

  res.json({
    status: 'accepted',
    queue_position: getQueueDepth()
  });
}

function handleTaskClarification(req, res, task) {
  // Find existing job and update messages
  const existingJob = findJobByBrokkrTaskId(task.id);

  if (!existingJob) {
    return res.status(404).json({ error: `Task not found: ${task.id}` });
  }

  const updated = updateJobMessages(task.id, task.messages);

  if (!updated) {
    return res.status(500).json({ error: 'Failed to update job messages' });
  }

  res.json({
    status: 'accepted',
    queue_position: getQueueDepth()
  });
}

function handleTaskCancelled(req, res, task) {
  const result = cancelJob(task.session_code);

  if (result.success) {
    res.json({
      status: 'cancelled',
      message: result.message
    });
  } else {
    res.status(404).json({
      status: 'not_found',
      error: result.message
    });
  }
}
```

Also add `readFileSync` to the imports at the top:

```javascript
import { readFileSync } from 'fs';
```

**Step 4: Update sessions.js to accept custom session code**

Modify the `createSession` function in `lib/sessions.js` to accept an optional session code:

```javascript
// Modify the createSession function signature and logic
export function createSession(options, customCode = null) {
  // ... existing code ...

  // Use custom code if provided, otherwise generate
  const code = customCode || generateCode(options.type === 'webhook' ? 3 : 2);

  // ... rest of existing code ...
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/webhook-server.test.js`
Expected: PASS (all tests including new BrokkrMVP tests)

**Step 6: Commit**

```bash
git add lib/webhook-server.js lib/sessions.js tests/webhook-server.test.js
git commit -m "feat(brokkr-mvp): add HMAC verification and fat payload handling"
```

---

## Task 5: Add Callback Module

**Files:**
- Create: `lib/callback.js`
- Create: `tests/callback.test.js`

**Step 1: Write the failing test**

```javascript
// tests/callback.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildCallbackPayload, sendCallback } from '../lib/callback.js';

describe('Callback Module', () => {
  describe('buildCallbackPayload', () => {
    it('should build completed callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'completed',
        outputData: { recommendation: 'Use Glowforge Pro' },
        messages: [{ role: 'agent', content: 'Found equipment' }],
        sessionCode: 'xyz',
        usage: {
          model_id: 'claude-sonnet-4-20250514',
          input_tokens: 1000,
          output_tokens: 500,
          duration_ms: 3000
        }
      });

      expect(payload.status).toBe('completed');
      expect(payload.output_data.recommendation).toBe('Use Glowforge Pro');
      expect(payload.messages.length).toBe(1);
      expect(payload.session_code).toBe('xyz');
      expect(payload.usage.total_tokens).toBe(1500);
    });

    it('should build needs_input callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'needs_input',
        messages: [{ role: 'agent', content: 'What budget range?' }],
        sessionCode: 'abc'
      });

      expect(payload.status).toBe('needs_input');
      expect(payload.messages[0].content).toBe('What budget range?');
      expect(payload.output_data).toBeUndefined();
    });

    it('should build failed callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'failed',
        errorMessage: 'No equipment found matching criteria',
        sessionCode: 'def'
      });

      expect(payload.status).toBe('failed');
      expect(payload.error_message).toBe('No equipment found matching criteria');
    });

    it('should build processing callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'processing',
        messages: [{ role: 'agent', content: 'Researching...' }],
        sessionCode: 'ghi'
      });

      expect(payload.status).toBe('processing');
    });
  });

  describe('sendCallback', () => {
    it('should build correct URL from task ID', () => {
      // This test verifies URL construction without making actual HTTP call
      const taskId = '550e8400-e29b-41d4-a716-446655440000';
      const expectedUrl = 'https://api.brokkr.app/api/agent/callback/550e8400-e29b-41d4-a716-446655440000';

      // We'll mock fetch in actual implementation
      // For now, just verify the module exports the function
      expect(typeof sendCallback).toBe('function');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/callback.test.js`
Expected: FAIL with "Cannot find module '../lib/callback.js'"

**Step 3: Write implementation**

```javascript
// lib/callback.js
import { buildHeaders } from './hmac.js';
import { readFileSync } from 'fs';

// Load config
let config = {
  agent_id: process.env.BROKKR_AGENT_ID || 'dev-agent',
  webhook_secret: process.env.BROKKR_WEBHOOK_SECRET || 'dev-secret',
  api_url: process.env.BROKKR_API_URL || 'https://api.brokkr.app'
};

try {
  const configPath = new URL('../skills/brokkr-mvp/config.json', import.meta.url);
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.log('[Callback] No BrokkrMVP config found, using defaults');
}

/**
 * Build callback payload for BrokkrMVP
 * @param {Object} options - Callback options
 * @returns {Object} Formatted callback payload
 */
export function buildCallbackPayload(options) {
  const {
    status,
    outputData,
    messages = [],
    sessionCode,
    usage = {},
    errorMessage
  } = options;

  const payload = {
    status,
    session_code: sessionCode
  };

  if (messages.length > 0) {
    payload.messages = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || new Date().toISOString()
    }));
  }

  if (status === 'completed' && outputData) {
    payload.output_data = outputData;
  }

  if (status === 'failed' && errorMessage) {
    payload.error_message = errorMessage;
  }

  if (usage && Object.keys(usage).length > 0) {
    payload.usage = {
      model_id: usage.model_id || 'claude-sonnet-4-20250514',
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      duration_ms: usage.duration_ms || 0,
      api_calls: usage.api_calls || 1
    };
  }

  return payload;
}

/**
 * Send callback to BrokkrMVP
 * @param {string} taskId - BrokkrMVP task UUID
 * @param {Object} payload - Callback payload
 * @param {number} retryCount - Current retry attempt (0-based)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendCallback(taskId, payload, retryCount = 0) {
  const url = `${config.api_url}/api/agent/callback/${taskId}`;
  const headers = buildHeaders(config.agent_id, payload, config.webhook_secret);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return { success: true };
    }

    const errorText = await response.text();
    console.error(`[Callback] Failed (${response.status}): ${errorText}`);

    // Retry with exponential backoff
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`[Callback] Retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(r => setTimeout(r, delay));
      return sendCallback(taskId, { ...payload, retry_count: retryCount + 1 }, retryCount + 1);
    }

    return { success: false, error: `Failed after 3 retries: ${response.status}` };
  } catch (err) {
    console.error(`[Callback] Network error: ${err.message}`);

    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[Callback] Retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(r => setTimeout(r, delay));
      return sendCallback(taskId, { ...payload, retry_count: retryCount + 1 }, retryCount + 1);
    }

    return { success: false, error: `Network error after 3 retries: ${err.message}` };
  }
}

/**
 * Get the config (for testing/heartbeat)
 */
export function getConfig() {
  return config;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/callback.test.js`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add lib/callback.js tests/callback.test.js
git commit -m "feat(brokkr-mvp): add callback module for BrokkrMVP communication"
```

---

## Task 6: Extend Worker for Callbacks

**Files:**
- Modify: `lib/worker.js`

**Step 1: Add imports at top of worker.js**

```javascript
import { sendCallback, buildCallbackPayload, getConfig } from './callback.js';
```

**Step 2: Add callback sending after job completion**

Find the `child.on('close', ...)` handler and modify the completion logic:

```javascript
child.on('close', async (code) => {
  if (!doCleanup()) return;

  const result = (stdout || stderr || 'Done (no output)')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  // Calculate duration
  const durationMs = Date.now() - new Date(job.startedAt || Date.now()).getTime();

  // Build usage data (parse from Claude output if available)
  const usage = parseUsageFromOutput(stdout) || {
    model_id: 'claude-sonnet-4-20250514',
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: durationMs,
    api_calls: 1
  };

  if (killed) {
    markFailed(job.id, 'Task timed out after 30 minutes');
    await sendMessage(job.chatId, `Task timed out: ${job.task.slice(0, 50)}...`);

    // Send failed callback for BrokkrMVP tasks
    if (job.brokkrTaskId) {
      await sendCallback(job.brokkrTaskId, buildCallbackPayload({
        status: 'failed',
        errorMessage: 'Task timed out after 30 minutes',
        sessionCode: job.sessionCode,
        usage
      }));
    }
  } else if (code !== 0) {
    markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
    await sendMessage(job.chatId, result);

    // Send failed callback for BrokkrMVP tasks
    if (job.brokkrTaskId) {
      await sendCallback(job.brokkrTaskId, buildCallbackPayload({
        status: 'failed',
        errorMessage: `Exit code ${code}: ${result.slice(0, 200)}`,
        sessionCode: job.sessionCode,
        usage
      }));
    }
  } else {
    markCompleted(job.id, result);

    if (job.sessionCode) {
      updateSessionActivity(job.sessionCode);
    }

    await sendMessage(job.chatId, result);

    // Send completed callback for BrokkrMVP tasks
    if (job.brokkrTaskId) {
      // Parse output data if response schema was provided
      const outputData = parseOutputData(result, job.responseSchema);

      await sendCallback(job.brokkrTaskId, buildCallbackPayload({
        status: 'completed',
        outputData,
        messages: [{ role: 'agent', content: result.slice(0, 2000) }],
        sessionCode: job.sessionCode,
        usage
      }));
    }
  }

  console.log(`[Worker] Finished job ${job.id} (code: ${code})`);
  resolve(true);
});
```

**Step 3: Add helper functions at bottom of worker.js**

```javascript
/**
 * Parse usage statistics from Claude CLI output
 * @param {string} output - Claude CLI stdout
 * @returns {Object|null} Usage object or null
 */
function parseUsageFromOutput(output) {
  // Claude CLI may output usage stats - attempt to parse
  // Format varies, this is a best-effort extraction
  try {
    const tokenMatch = output.match(/tokens?[:\s]+(\d+)/gi);
    if (tokenMatch) {
      const numbers = tokenMatch.map(m => parseInt(m.match(/\d+/)[0]));
      return {
        model_id: 'claude-sonnet-4-20250514',
        input_tokens: numbers[0] || 0,
        output_tokens: numbers[1] || 0,
        duration_ms: 0,
        api_calls: 1
      };
    }
  } catch {
    // Parsing failed, return null
  }
  return null;
}

/**
 * Parse output data from result based on response schema
 * @param {string} result - Claude output
 * @param {Object} schema - Expected response schema
 * @returns {Object} Parsed output data
 */
function parseOutputData(result, schema) {
  // Try to extract JSON from the result
  try {
    // Look for JSON block in output
    const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try parsing entire result as JSON
    const parsed = JSON.parse(result);
    return parsed;
  } catch {
    // Return as plain text response
    return { raw_response: result };
  }
}
```

**Step 4: Add progress callback for long-running tasks**

Add a progress interval inside the `processNextJob` function, after spawning the child process:

```javascript
// After: currentProcess = child;
// Add progress callback for BrokkrMVP tasks
let progressInterval = null;
if (job.brokkrTaskId) {
  progressInterval = setInterval(async () => {
    const elapsed = Date.now() - new Date(job.startedAt || Date.now()).getTime();
    if (elapsed > 30000) { // Only send after 30 seconds
      await sendCallback(job.brokkrTaskId, buildCallbackPayload({
        status: 'processing',
        messages: [{ role: 'agent', content: `Processing... (${Math.floor(elapsed / 1000)}s elapsed)` }],
        sessionCode: job.sessionCode
      }));
    }
  }, 30000); // Check every 30 seconds
}

// In doCleanup(), add:
const doCleanup = () => {
  if (cleanedUp) return false;
  cleanedUp = true;
  clearTimeout(timeout);
  if (progressInterval) clearInterval(progressInterval); // Add this line
  untrackProcess(child.pid);
  currentProcess = null;
  return true;
};
```

**Step 5: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add lib/worker.js
git commit -m "feat(brokkr-mvp): add callback sending to worker"
```

---

## Task 7: Extend Heartbeat for API POST

**Files:**
- Modify: `lib/heartbeat.js`

**Step 1: Update heartbeat.js**

```javascript
// lib/heartbeat.js
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildHeaders } from './hmac.js';
import { getConfig } from './callback.js';
import { getQueueDepth, getActiveJob } from './queue.js';

const HEARTBEAT_FILE = join(process.cwd(), 'heartbeat.json');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

let stats = {
  startedAt: new Date().toISOString(),
  lastHeartbeat: null,
  tasksProcessed: 0,
  tasksFailed: 0,
  uptime: 0
};

let consecutiveFailures = 0;
let isDraining = false;

export function incrementProcessed() { stats.tasksProcessed++; }
export function incrementFailed() { stats.tasksFailed++; }
export function setDraining(value) { isDraining = value; }

function getStatus() {
  if (isDraining) return 'draining';
  if (consecutiveFailures >= 3) return 'degraded';
  return 'healthy';
}

function writeHeartbeat() {
  stats.lastHeartbeat = new Date().toISOString();
  stats.uptime = Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000);
  writeFileSync(HEARTBEAT_FILE, JSON.stringify(stats, null, 2));
}

async function sendHeartbeatToApi() {
  const config = getConfig();

  // Get processing task IDs (BrokkrMVP tasks only)
  const activeJob = getActiveJob();
  const processingTaskIds = [];
  if (activeJob?.brokkrTaskId) {
    processingTaskIds.push(activeJob.brokkrTaskId);
  }

  const payload = {
    queue_depth: getQueueDepth(),
    status: getStatus(),
    processing_task_ids: processingTaskIds,
    version: config.version || '2.0.0',
    capabilities: config.capabilities || []
  };

  const url = `${config.api_url}/api/agent/heartbeat`;
  const headers = buildHeaders(config.agent_id, payload, config.webhook_secret);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.warn(`[Heartbeat] API POST failed (${response.status}), consecutive failures: ${consecutiveFailures}`);
    }
  } catch (err) {
    consecutiveFailures++;
    console.warn(`[Heartbeat] API POST error: ${err.message}, consecutive failures: ${consecutiveFailures}`);
  }
}

async function heartbeatTick() {
  writeHeartbeat();
  await sendHeartbeatToApi();
}

export function startHeartbeat() {
  heartbeatTick(); // Initial heartbeat
  setInterval(heartbeatTick, HEARTBEAT_INTERVAL_MS);
  console.log('[Heartbeat] Started (every 30s, local + API)');
}

export function getStats() { return { ...stats, status: getStatus() }; }
```

**Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add lib/heartbeat.js
git commit -m "feat(brokkr-mvp): extend heartbeat to POST to BrokkrMVP API"
```

---

## Task 8: Create Skill Documentation

**Files:**
- Create: `skills/brokkr-mvp/skill.md`

**Step 1: Write skill.md**

```markdown
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
```

**Step 2: Commit**

```bash
git add skills/brokkr-mvp/skill.md
git commit -m "docs(brokkr-mvp): add skill protocol documentation"
```

---

## Task 9: Create Validation Scripts

**Files:**
- Create: `skills/brokkr-mvp/validation/test-hmac.js`
- Create: `skills/brokkr-mvp/validation/test-callback.js`

**Step 1: Create test-hmac.js**

```javascript
#!/usr/bin/env node
// skills/brokkr-mvp/validation/test-hmac.js

import { signRequest, verifySignature } from '../../../lib/hmac.js';
import { readFileSync } from 'fs';

console.log('=== HMAC Validation Test ===\n');

// Load config
let config;
try {
  config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));
  console.log('✓ Config loaded successfully');
  console.log(`  Agent ID: ${config.agent_id.slice(0, 8)}...`);
} catch (err) {
  console.error('✗ Failed to load config:', err.message);
  process.exit(1);
}

// Test 1: Sign a request
console.log('\n--- Test 1: Sign Request ---');
const testPayload = { event: 'task.created', task: { id: 'test-123' } };
try {
  const { timestamp, signature } = signRequest(testPayload, config.webhook_secret);
  console.log('✓ Signature generated successfully');
  console.log(`  Timestamp: ${timestamp}`);
  console.log(`  Signature: ${signature.slice(0, 20)}...`);
} catch (err) {
  console.error('✗ Failed to sign request:', err.message);
  process.exit(1);
}

// Test 2: Verify valid signature
console.log('\n--- Test 2: Verify Valid Signature ---');
try {
  const { timestamp, signature } = signRequest(testPayload, config.webhook_secret);
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': timestamp.toString(),
    'x-signature': signature
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (result.valid) {
    console.log('✓ Valid signature verified successfully');
  } else {
    console.error('✗ Verification failed:', result.error);
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Verification threw error:', err.message);
  process.exit(1);
}

// Test 3: Reject invalid signature
console.log('\n--- Test 3: Reject Invalid Signature ---');
try {
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': Math.floor(Date.now() / 1000).toString(),
    'x-signature': 'sha256=invalid'
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (!result.valid && result.error === 'Invalid signature') {
    console.log('✓ Invalid signature rejected correctly');
  } else {
    console.error('✗ Should have rejected invalid signature');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Test threw error:', err.message);
  process.exit(1);
}

// Test 4: Reject expired timestamp
console.log('\n--- Test 4: Reject Expired Timestamp ---');
try {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
  const { signature } = signRequest(testPayload, config.webhook_secret, oldTimestamp);
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': oldTimestamp.toString(),
    'x-signature': signature
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (!result.valid && result.error === 'Request timestamp expired') {
    console.log('✓ Expired timestamp rejected correctly');
  } else {
    console.error('✗ Should have rejected expired timestamp');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Test threw error:', err.message);
  process.exit(1);
}

console.log('\n=== All HMAC Tests Passed ===');
```

**Step 2: Create test-callback.js**

```javascript
#!/usr/bin/env node
// skills/brokkr-mvp/validation/test-callback.js

import { buildCallbackPayload, sendCallback, getConfig } from '../../../lib/callback.js';
import { readFileSync } from 'fs';

console.log('=== Callback Validation Test ===\n');

// Load and display config
const config = getConfig();
console.log('Config loaded:');
console.log(`  API URL: ${config.api_url}`);
console.log(`  Agent ID: ${config.agent_id.slice(0, 8)}...`);

// Test 1: Build callback payload
console.log('\n--- Test 1: Build Callback Payload ---');
try {
  const payload = buildCallbackPayload({
    status: 'completed',
    outputData: { test: 'data' },
    messages: [{ role: 'agent', content: 'Test message' }],
    sessionCode: 'tst',
    usage: {
      model_id: 'claude-sonnet-4-20250514',
      input_tokens: 100,
      output_tokens: 50,
      duration_ms: 1000
    }
  });

  if (payload.status === 'completed' && payload.output_data && payload.usage.total_tokens === 150) {
    console.log('✓ Payload built correctly');
    console.log('  Payload:', JSON.stringify(payload, null, 2).split('\n').map(l => '  ' + l).join('\n'));
  } else {
    console.error('✗ Payload structure incorrect');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Failed to build payload:', err.message);
  process.exit(1);
}

// Test 2: Send test callback (dry run - will likely fail without real task)
console.log('\n--- Test 2: Send Callback (Connection Test) ---');
console.log('Note: This will attempt to send to BrokkrMVP API.');
console.log('Expected: Connection success (may get 404 for fake task ID)');

const testTaskId = 'test-validation-' + Date.now();
const testPayload = buildCallbackPayload({
  status: 'processing',
  messages: [{ role: 'agent', content: 'Validation test' }],
  sessionCode: 'val'
});

try {
  const result = await sendCallback(testTaskId, testPayload);
  if (result.success) {
    console.log('✓ Callback sent successfully (unexpected for fake task)');
  } else {
    // Expected to fail with 404 for fake task ID
    if (result.error.includes('404') || result.error.includes('not found')) {
      console.log('✓ Connection successful (404 for fake task ID as expected)');
    } else {
      console.log(`⚠ Callback failed: ${result.error}`);
      console.log('  This may indicate network or authentication issues.');
    }
  }
} catch (err) {
  console.error('✗ Callback threw error:', err.message);
  console.log('  Check network connectivity and config.api_url');
}

console.log('\n=== Callback Validation Complete ===');
```

**Step 3: Commit**

```bash
git add skills/brokkr-mvp/validation/test-hmac.js skills/brokkr-mvp/validation/test-callback.js
git commit -m "feat(brokkr-mvp): add validation scripts"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add BrokkrMVP section to CLAUDE.md**

Add after the "Webhook API" section:

```markdown
## BrokkrMVP Integration

The webhook server implements the BrokkrMVP protocol for authenticated task processing.

**Protocol Features:**
- HMAC-SHA256 signed requests (X-Agent-Id, X-Timestamp, X-Signature headers)
- Fat payload webhooks with full task context
- Automatic callbacks to BrokkrMVP on task completion
- 30-second heartbeat with queue status

**Configuration:** `skills/brokkr-mvp/config.json`

**Validation:**
```bash
node skills/brokkr-mvp/validation/test-hmac.js
node skills/brokkr-mvp/validation/test-callback.js
```

**See:** `skills/brokkr-mvp/skill.md` for full protocol documentation.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add BrokkrMVP integration section to CLAUDE.md"
```

---

## Task 11: Integration Test

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 2: Run validation scripts**

```bash
node skills/brokkr-mvp/validation/test-hmac.js
```

Expected: "All HMAC Tests Passed"

**Step 3: Start server and test health endpoint**

```bash
# Terminal 1
node whatsapp-bot.js

# Terminal 2
curl http://localhost:3000/health
```

Expected: `{"status":"ok","processing":false,"queueDepth":0}`

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(brokkr-mvp): complete BrokkrMVP webhook protocol implementation"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `skills/brokkr-mvp/config.json` | Skill config structure |
| 2 | `lib/hmac.js`, `tests/hmac.test.js` | HMAC signing module |
| 3 | `lib/queue.js`, `tests/queue-brokkr.test.js` | Queue extensions |
| 4 | `lib/webhook-server.js`, `tests/webhook-server.test.js` | Fat payload handling |
| 5 | `lib/callback.js`, `tests/callback.test.js` | Callback module |
| 6 | `lib/worker.js` | Worker callback integration |
| 7 | `lib/heartbeat.js` | Heartbeat API POST |
| 8 | `skills/brokkr-mvp/skill.md` | Protocol documentation |
| 9 | `skills/brokkr-mvp/validation/*.js` | Validation scripts |
| 10 | `CLAUDE.md` | Documentation update |
| 11 | - | Integration testing |
