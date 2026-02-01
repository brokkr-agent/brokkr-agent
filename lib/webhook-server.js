// lib/webhook-server.js
import express from 'express';
import { enqueue, PRIORITY, getQueueDepth } from './queue.js';
import { createSession, getSessionByCode, updateSessionActivity } from './sessions.js';
import { isProcessing, getCurrentTask, cancelJob } from './worker.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;

// Mode flags
let dryRunMode = false;
let debugMode = false;

/**
 * Enable or disable dry-run mode
 * @param {boolean} enabled - Whether dry-run mode should be enabled
 */
export function setDryRunMode(enabled) {
  dryRunMode = enabled;
  if (enabled) {
    console.log('[WebhookServer] Dry-run mode enabled');
  }
}

/**
 * Enable or disable debug mode
 * @param {boolean} enabled - Whether debug mode should be enabled
 */
export function setDebugMode(enabled) {
  debugMode = enabled;
  if (enabled) {
    console.log('[WebhookServer] Debug mode enabled');
  }
}

/**
 * Get current dry-run mode status
 * @returns {boolean} Whether dry-run mode is enabled
 */
export function isDryRunMode() {
  return dryRunMode;
}

/**
 * Get current debug mode status
 * @returns {boolean} Whether debug mode is enabled
 */
export function isDebugMode() {
  return debugMode;
}

// Debug middleware - logs incoming requests
app.use((req, res, next) => {
  if (debugMode) {
    const body = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    console.log(`[DEBUG] --> ${req.method} ${req.path} ${body}`);

    // Capture response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      console.log(`[DEBUG] <-- ${res.statusCode} ${JSON.stringify(data)}`);
      return originalJson(data);
    };
  }
  next();
});

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

  // Dry-run mode: return mock response without creating real session/job
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

  // Dry-run mode: handle "dry" session code specially
  if (dryRunMode && sessionCode === 'dry') {
    const task = message || 'continue';
    console.log(`[DRY-RUN] Would continue session dry: ${task}`);
    return res.json({
      success: true,
      jobId: 'dry-run-job',
      sessionCode: 'dry',
      queuePosition: 0,
      dryRun: true
    });
  }

  const session = getSessionByCode(sessionCode);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (session.type !== 'webhook') {
    return res.status(400).json({ error: 'Not a webhook session' });
  }

  const task = message || 'continue';

  // Dry-run mode: log but don't actually enqueue
  if (dryRunMode) {
    console.log(`[DRY-RUN] Would continue session ${sessionCode}: ${task}`);
    return res.json({
      success: true,
      jobId: 'dry-run-job',
      sessionCode,
      queuePosition: 0,
      dryRun: true
    });
  }

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

  // Dry-run mode: handle "dry" session code specially
  if (dryRunMode && sessionCode === 'dry') {
    return res.json({
      sessionCode: 'dry',
      type: 'webhook',
      task: 'dry-run test task',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      dryRun: true
    });
  }

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

// DELETE /webhook/:sessionCode - Cancel a job
app.delete('/webhook/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;

  // Dry-run mode: handle "dry" session code specially
  if (dryRunMode && sessionCode === 'dry') {
    console.log(`[DRY-RUN] Would cancel session dry`);
    return res.json({
      success: true,
      status: 'cancelled',
      message: 'Would cancel dry-run session',
      dryRun: true
    });
  }

  const result = cancelJob(sessionCode);

  if (result.success) {
    res.json({
      success: true,
      status: result.status,
      message: result.message,
      sessionCode
    });
  } else {
    res.status(404).json({
      success: false,
      error: result.message,
      sessionCode
    });
  }
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
