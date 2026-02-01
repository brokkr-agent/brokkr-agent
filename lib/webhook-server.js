// lib/webhook-server.js
import express from 'express';
import { readFileSync } from 'fs';
import { enqueue, PRIORITY, getQueueDepth, findJobByBrokkrTaskId, updateJobMessages } from './queue.js';
import { createSession, getSessionByCode, updateSessionActivity } from './sessions.js';
import { isProcessing, getCurrentTask, cancelJob } from './worker.js';
import { verifySignature } from './hmac.js';

// Load BrokkrMVP config - use try/catch for graceful fallback
let brokkrConfig = { webhook_secret: process.env.BROKKR_WEBHOOK_SECRET || 'test-webhook-secret' };
try {
  const configPath = new URL('../skills/brokkr-mvp/config.json', import.meta.url);
  const loadedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  // Only use loaded config if it has a real secret (not a placeholder)
  if (loadedConfig.webhook_secret && !loadedConfig.webhook_secret.startsWith('REPLACE_')) {
    brokkrConfig = loadedConfig;
  }
} catch {
  console.log('[WebhookServer] No BrokkrMVP config found, using defaults');
}

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

// New POST /webhook handler with BrokkrMVP protocol support
app.post('/webhook', (req, res) => {
  // Check if this is a BrokkrMVP request (has x-signature header)
  if (req.headers['x-signature']) {
    // Verify HMAC signature
    const verification = verifySignature(req.headers, req.body, brokkrConfig.webhook_secret);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    const { event } = req.body;

    // Support both nested and flat formats:
    // Nested: { event, task: { id, task_type, ... } }
    // Flat: { event, task_id, task_type, ... }
    let task = req.body.task;
    if (!task && req.body.task_id) {
      // Convert flat format to nested task object
      task = {
        id: req.body.task_id,
        task_type: req.body.task_type,
        priority: req.body.priority,
        input_data: req.body.input_data,
        messages: req.body.messages,
        session_code: req.body.session_code,
        response_schema: req.body.response_schema,
        callback_url: req.body.callback_url
      };
    }

    // Also capture callback_url from nested format
    if (task && !task.callback_url && req.body.callback_url) {
      task.callback_url = req.body.callback_url;
    }

    if (!event || !task) {
      return res.status(400).json({ error: 'event and task/task_id are required' });
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
  }

  // Handle legacy format (no signature) - backward compatibility
  return handleLegacyWebhook(req, res);
});

function handleLegacyWebhook(req, res) {
  // Original simple webhook logic for backward compatibility
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
  }, task.session_code);

  // Log incoming task details for debugging
  console.log(`[BrokkrMVP] Task created: ${task.id}`);
  console.log(`[BrokkrMVP] Task type: ${task.task_type}`);
  console.log(`[BrokkrMVP] Callback URL: ${task.callback_url || 'not provided'}`);
  console.log(`[BrokkrMVP] Input data: ${JSON.stringify(task.input_data)}`);

  // Enqueue with full BrokkrMVP payload
  enqueue({
    task: task.input_data?.user_context || `${task.task_type}: ${JSON.stringify(task.input_data)}`,
    sessionCode: session.code,
    source: 'webhook',
    priority: task.priority || PRIORITY.HIGH,
    brokkrTaskId: task.id,
    taskType: task.task_type,
    inputData: task.input_data,
    responseSchema: req.body.response_schema,
    messages: task.messages || [],
    callbackUrl: task.callback_url
  });

  res.json({
    status: 'accepted',
    queue_position: getQueueDepth()
  });
}

function handleTaskClarification(req, res, task) {
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
