# Cancel Job Skill

Cancel pending or running jobs by session code.

## Usage

### WhatsApp / iMessage
```
/<session-code> -cancel
```

Examples:
- `/k7 -cancel` - Cancel WhatsApp session k7
- `/abc -cancel` - Cancel webhook session abc

### Webhook API
```bash
# Cancel by session code
curl -X DELETE http://localhost:3000/webhook/<session-code>
```

## Behavior

| Job State | Action |
|-----------|--------|
| **Pending** | Removed from queue, moved to failed with status "cancelled" |
| **Active** | Process killed (SIGTERM → SIGKILL), marked as cancelled |
| **Not Found** | Returns error message |

## Response

### WhatsApp/iMessage
```
Cancelled /k7: Removed from queue: search for files...
```
or
```
Cancelled /k7: Cancelled active job: research AI agents...
```
or
```
No pending or active job found for session /k7
```

### Webhook API
Success (200):
```json
{
  "success": true,
  "status": "pending_cancelled",
  "message": "Removed from queue: ...",
  "sessionCode": "abc"
}
```

Not Found (404):
```json
{
  "success": false,
  "error": "No pending or active job found for session /abc",
  "sessionCode": "abc"
}
```

## Implementation

- `lib/queue.js`: `cancelPendingJob()`, `cancelActiveJob()`, `findPendingJobBySessionCode()`
- `lib/worker.js`: `cancelJob()` - orchestrates cancel logic
- `whatsapp-bot.js`: `handleCancelJob()` - handles `-cancel` flag
- `lib/webhook-server.js`: `DELETE /webhook/:sessionCode` endpoint
