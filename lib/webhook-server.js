// lib/webhook-server.js
import express from 'express';
import { enqueue, PRIORITY, getQueueDepth } from './queue.js';
import { createSession, getSessionByCode, updateSessionActivity } from './sessions.js';
import { isProcessing, getCurrentTask } from './worker.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;

// GET /health - Check agent availability
app.get('/health', (req, res) => {
  res.json({ status: 'ok', processing: isProcessing(), queueDepth: getQueueDepth() });
});

// POST /webhook - Submit new task
app.post('/webhook', (req, res) => {
  const { task, source, metadata } = req.body;

  if (!task || (typeof task === 'string' && !task.trim())) {
    return res.status(400).json({ error: 'task is required' });
  }

  // Create 3-char webhook session
  const session = createSession({
    type: 'webhook',
    task,
    source: source || 'external'
  });

  // Enqueue with HIGH priority
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
});

// POST /webhook/:sessionCode - Continue webhook session
app.post('/webhook/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;
  const { message } = req.body;

  const session = getSessionByCode(sessionCode);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (session.type !== 'webhook') {
    return res.status(400).json({ error: 'Not a webhook session' });
  }

  const task = message || 'continue';

  const job = enqueue({
    task,
    sessionCode,
    source: 'webhook',
    priority: PRIORITY.HIGH
  });

  updateSessionActivity(sessionCode);

  res.json({
    success: true,
    jobId: job,
    sessionCode,
    queuePosition: getQueueDepth()
  });
});

// GET /webhook/:sessionCode - Get session status
app.get('/webhook/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;
  const session = getSessionByCode(sessionCode);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  res.json({
    sessionCode: session.code,
    type: session.type,
    task: session.task,
    status: session.status,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  });
});

export function startWebhookServer() {
  return new Promise((resolve) => {
    const server = app.listen(WEBHOOK_PORT, () => {
      console.log(`Webhook server listening on port ${WEBHOOK_PORT}`);
      resolve(server);
    });
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[WebhookServer] Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export { app };
