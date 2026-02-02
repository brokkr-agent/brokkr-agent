// worker.js
/**
 * Standalone Worker Process
 *
 * Single-instance job processor that handles tasks from all channels:
 * - iMessage (via imessage-poller.js)
 * - WhatsApp (via whatsapp-poller.js)
 * - Webhooks (via webhook-server.js)
 *
 * Features:
 * - Single-instance lock (worker.lock) - only one worker can run at a time
 * - Routes messages back to appropriate channel based on job.source
 * - Graceful shutdown handling
 * - Session management and expiration
 */

import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

// Import worker functions
import { processNextJob, setSendMessageCallback, setDryRunMode, isProcessing } from './lib/worker.js';
import { expireSessions } from './lib/sessions.js';
import { startupCleanup } from './lib/resources.js';

// Import channel-specific senders
import { safeSendMessage as imessageSend, safeSendGroupMessage as imessageGroupSend } from './lib/imessage-sender.js';

// Configuration
const WORKSPACE = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const LOCK_FILE = join(WORKSPACE, 'worker.lock');

// Queue processing interval: 1 second
const QUEUE_PROCESS_INTERVAL_MS = 1000;
// Session expiration interval: 1 hour
const SESSION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
// Session max age: 24 hours
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// WhatsApp client reference (set by initWhatsApp)
let whatsappClient = null;

// ============================================
// Lock file management (single instance)
// ============================================

/**
 * Acquire the worker lock file to ensure single instance
 * @returns {boolean} True if lock acquired, false if already running
 */
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Check if process is still running
      try {
        process.kill(lockData.pid, 0);
        // Process is running
        console.error(`Worker already running (PID: ${lockData.pid})`);
        return false;
      } catch {
        // Process not running, stale lock
        console.log('Removing stale lock file...');
        unlinkSync(LOCK_FILE);
      }
    } catch {
      // Invalid lock file, remove it
      unlinkSync(LOCK_FILE);
    }
  }

  // Create lock file
  writeFileSync(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString()
  }));

  return true;
}

/**
 * Release the worker lock file
 */
function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
      console.log('Lock released');
    }
  } catch (err) {
    console.error('Failed to release lock:', err.message);
  }
}

// ============================================
// Message Routing
// ============================================

/**
 * Check if a chat ID is a group chat GUID
 * @param {string} chatId - Chat ID to check
 * @returns {boolean} True if this is a group chat GUID
 */
function isGroupChatId(chatId) {
  return chatId && (chatId.includes('chat') || chatId.includes(';+;'));
}

/**
 * Route message to appropriate channel based on job metadata
 * This is the callback used by lib/worker.js
 * @param {string} chatId - Chat ID or phone number to send to
 * @param {string} message - Message to send
 * @param {Object} jobMeta - Optional job metadata for routing
 */
async function routeMessage(chatId, message, jobMeta = {}) {
  const source = jobMeta.source || detectSource(chatId);
  const finalMessage = DRY_RUN ? `[DRY-RUN] ${message}` : message;

  if (DEBUG) {
    console.log(`[Worker] Routing message to ${source}: chatId=${chatId}`);
  }

  try {
    switch (source) {
      case 'imessage':
        if (isGroupChatId(chatId)) {
          await imessageGroupSend(chatId, finalMessage, { dryRun: DRY_RUN });
        } else {
          await imessageSend(chatId, finalMessage, { dryRun: DRY_RUN });
        }
        break;

      case 'whatsapp':
        if (whatsappClient) {
          await sendWhatsAppMessage(chatId, finalMessage);
        } else {
          console.error('[Worker] WhatsApp client not initialized, cannot send message');
        }
        break;

      case 'webhook':
        // Webhooks don't need message responses - they use callbacks
        if (DEBUG) {
          console.log(`[Worker] Webhook job - response via callback only`);
        }
        break;

      default:
        console.error(`[Worker] Unknown source: ${source}, attempting iMessage`);
        await imessageSend(chatId, finalMessage, { dryRun: DRY_RUN });
    }
  } catch (err) {
    console.error(`[Worker] Failed to send message via ${source}:`, err.message);
  }
}

/**
 * Detect message source from chatId format
 * @param {string} chatId - Chat ID to analyze
 * @returns {string} Detected source: 'imessage', 'whatsapp', or 'unknown'
 */
function detectSource(chatId) {
  if (!chatId) return 'unknown';

  // iMessage: phone numbers start with + or contain @
  // Group chats contain 'iMessage;' or 'chat'
  if (chatId.startsWith('+') || chatId.includes('@') ||
      chatId.includes('iMessage;') || chatId.includes('chat')) {
    return 'imessage';
  }

  // WhatsApp: format is typically number@c.us or number@g.us
  if (chatId.includes('@c.us') || chatId.includes('@g.us')) {
    return 'whatsapp';
  }

  return 'unknown';
}

/**
 * Send message via WhatsApp
 * @param {string} chatId - WhatsApp chat ID
 * @param {string} message - Message to send
 */
async function sendWhatsAppMessage(chatId, message, retries = 3) {
  if (!whatsappClient) {
    throw new Error('WhatsApp client not initialized');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await whatsappClient.sendMessage(chatId, message);
      return;
    } catch (err) {
      console.error(`[Worker] WhatsApp send attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Initialize WhatsApp client connection
 * Note: WhatsApp initialization is complex and may need to be moved to a separate module
 */
async function initWhatsApp() {
  // For now, WhatsApp support is optional
  // The whatsapp-poller.js will handle its own client
  // This worker just needs to know how to send via the client if available
  console.log('[Worker] WhatsApp support: disabled (poller handles its own sends)');
  return false;
}

// ============================================
// Queue Processing
// ============================================

/**
 * Process next job from queue if not busy
 */
async function processQueue() {
  if (!isProcessing()) {
    await processNextJob();
  }
}

// ============================================
// Startup and Shutdown
// ============================================

let queueInterval = null;
let sessionExpiryInterval = null;

/**
 * Start the worker process
 */
async function startWorker() {
  console.log('========================================');
  console.log('  Brokkr Worker Process');
  console.log('========================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Debug: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log('----------------------------------------');

  // Acquire lock
  if (!acquireLock()) {
    console.error('Failed to acquire lock. Is another worker running?');
    process.exit(1);
  }

  console.log(`Worker started (PID: ${process.pid})`);

  // Startup cleanup
  startupCleanup();

  // Register the message routing callback with the worker
  setSendMessageCallback(routeMessage);

  // Set dry-run mode if enabled
  if (DRY_RUN) {
    setDryRunMode(true);
  }

  // Start queue processing interval
  queueInterval = setInterval(processQueue, QUEUE_PROCESS_INTERVAL_MS);
  console.log('Queue processing started');

  // Start session expiry interval
  sessionExpiryInterval = setInterval(() => {
    const expired = expireSessions(SESSION_MAX_AGE_MS);
    if (expired > 0) {
      console.log(`[Worker] Expired ${expired} old sessions`);
    }
  }, SESSION_EXPIRY_INTERVAL_MS);

  console.log('Worker ready to process jobs');
  console.log('========================================\n');
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('\nShutting down worker...');

  // Clear intervals
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
  }
  if (sessionExpiryInterval) {
    clearInterval(sessionExpiryInterval);
    sessionExpiryInterval = null;
  }

  // Release lock
  releaseLock();

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  releaseLock();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// ============================================
// Main
// ============================================

startWorker().catch((err) => {
  console.error('Failed to start worker:', err);
  releaseLock();
  process.exit(1);
});
