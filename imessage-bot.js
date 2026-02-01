// imessage-bot.js
/**
 * iMessage Bot Main Process
 *
 * Polls the macOS Messages database (chat.db) for new messages from Tommy (+12069090025)
 * and processes commands similar to the WhatsApp bot.
 *
 * Features:
 * - Polls chat.db every 2 seconds for new messages
 * - Uses existing infrastructure: queue.js, sessions.js, worker.js, message-parser.js
 * - Lock file management (single instance) - imessage-bot.lock
 * - Processes commands starting with /
 * - Skips bot's own messages (anti-loop)
 * - Creates sessions with type 'imessage' (2-char codes)
 * - Handles /status, /help, /sessions, /claude, session resume
 * - Startup cleanup, graceful shutdown
 */

import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

// Import library modules
import { getRecentMessages } from './lib/imessage-reader.js';
import { safeSendMessage } from './lib/imessage-sender.js';
import { parseMessage, getHelpText } from './lib/message-parser.js';
import { enqueue, PRIORITY, getQueueDepth } from './lib/queue.js';
import { createSession, getSessionByCode, listSessions, expireSessions } from './lib/sessions.js';
import { processNextJob, setSendMessageCallback, setDryRunMode, isProcessing, getCurrentSessionCode } from './lib/worker.js';
import { startupCleanup } from './lib/resources.js';
import { getBusyMessage, getStatusMessage } from './lib/busy-handler.js';
import { shouldConsultTommy, sendConsultation } from './lib/imessage-consultation.js';
import { getPendingByCode, resolvePending, getPendingQuestions } from './lib/imessage-pending.js';
import { getContact } from './lib/imessage-permissions.js';

// Configuration constants
export const TOMMY_PHONE = '+12069090025';
export const POLLING_INTERVAL_MS = 2000;

/**
 * Check if a phone number is Tommy's
 * @param {string} phoneNumber - Phone number to check
 * @returns {boolean} True if this is Tommy's number
 */
export function isTommyMessage(phoneNumber) {
  const normalized = phoneNumber.replace(/^\+/, '');
  const tommyNormalized = TOMMY_PHONE.replace(/^\+/, '');
  return normalized === tommyNormalized;
}
const WORKSPACE = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const LOCK_FILE = join(WORKSPACE, 'imessage-bot.lock');

// Session expiration interval: 1 hour (in ms)
const SESSION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
// Session max age: 24 hours (in ms)
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Queue processing interval: 1 second
const QUEUE_PROCESS_INTERVAL_MS = 1000;

// Track last processed message ID to avoid reprocessing
let lastProcessedId = 0;

// Message deduplication: keep track of recently processed message IDs
const processedMessageIds = new Set();
const MAX_PROCESSED_IDS = 100;

// Bot response prefixes to skip (anti-loop)
const BOT_RESPONSE_PREFIXES = [
  '[DRY-RUN]',
  'Bot online',
  'Starting',
  'Unknown command:',
  'Working on:',
  'Bot Status:',
  'Session not found',
  'Resuming session',
  'Active Sessions:',
  'No active sessions',
];

// ============================================
// Lock file management (single instance)
// ============================================

/**
 * Acquire the bot lock file to ensure single instance
 * @param {string} lockPath - Path to the lock file
 * @returns {boolean} True if lock acquired, false if already running
 */
export function acquireLock(lockPath = LOCK_FILE) {
  if (existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      // Check if process is still running
      try {
        process.kill(lockData.pid, 0); // Signal 0 just checks if process exists
        console.error(`iMessage bot already running (PID: ${lockData.pid})`);
        return false;
      } catch (err) {
        // Process not running, stale lock file
        console.log(`Removing stale lock file (PID ${lockData.pid} not running)`);
        unlinkSync(lockPath);
      }
    } catch (err) {
      // Invalid lock file, remove it
      console.log('Removing invalid lock file');
      try { unlinkSync(lockPath); } catch {}
    }
  }

  // Write new lock file
  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString()
  };
  writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
  console.log(`Lock acquired (PID: ${process.pid})`);
  return true;
}

/**
 * Release the bot lock file
 * @param {string} lockPath - Path to the lock file
 */
export function releaseLock(lockPath = LOCK_FILE) {
  try {
    if (existsSync(lockPath)) {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      // Only remove if we own the lock
      if (lockData.pid === process.pid) {
        unlinkSync(lockPath);
        console.log('Lock released');
      }
    }
  } catch (err) {
    // Ignore errors during cleanup
  }
}

// ============================================
// Message Filtering
// ============================================

/**
 * Check if a message text is a bot response (to skip anti-loop)
 * @param {string} text - Message text
 * @returns {boolean} True if this is a bot response
 */
function isBotResponse(text) {
  if (!text) return false;

  // Check for known bot response prefixes
  if (BOT_RESPONSE_PREFIXES.some(prefix => text.startsWith(prefix))) {
    return true;
  }

  // Check for help text output (contains command list)
  if (text.includes('/claude <task>') && text.includes('/help')) {
    return true;
  }

  return false;
}

/**
 * Filter new messages that should be processed
 * @param {Array} messages - Array of message objects from imessage-reader
 * @param {Set} processedIds - Set of already processed message IDs
 * @param {Object} options - Filtering options
 * @param {boolean} options.universalAccess - When true, accept all messages not just commands (default: false)
 * @returns {Array} Filtered messages ready for processing
 */
export function filterNewMessages(messages, processedIds = processedMessageIds, options = {}) {
  if (!messages || messages.length === 0) {
    return [];
  }

  const { universalAccess = false } = options;

  return messages.filter(msg => {
    // Skip if already processed
    if (processedIds.has(msg.id)) {
      return false;
    }

    // Skip own messages (anti-loop)
    if (msg.sender === 'me') {
      return false;
    }

    // Skip null/undefined/empty text
    const text = (msg.text ?? '').trim();
    if (!text) {
      return false;
    }

    // Skip bot responses (anti-loop)
    if (isBotResponse(text)) {
      return false;
    }

    // In universal access mode, accept all non-filtered messages
    // In default mode, only process commands (starting with /)
    if (!universalAccess && !text.startsWith('/')) {
      return false;
    }

    return true;
  });
}

// ============================================
// Command Processing
// ============================================

/**
 * Get human-readable age of a session
 * @param {string} createdAt - ISO date string
 * @returns {string} Human-readable age
 */
function getSessionAge(createdAt) {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const diffMs = now - created;

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours >= 1) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

/**
 * Process a command message
 * @param {Object} options - Processing options
 * @param {string} options.text - Command text (e.g., "/claude hello")
 * @param {string} options.phoneNumber - Phone number to send response to
 * @param {Function} options.sendMessage - Function to send messages (for testing)
 * @param {Object} options.contact - Optional contact object for permission checking
 * @param {boolean} options.treatAsNatural - If true, treat non-command as natural message (enables consultation)
 * @returns {Promise<Object>} Result object with type and details
 */
export async function processCommand(options) {
  const { text, phoneNumber, sendMessage = (phone, msg) => safeSendMessage(phone, msg, { dryRun: DRY_RUN }), contact = null, treatAsNatural = false } = options;

  // Check if sender is Tommy - only Tommy gets session codes
  const isTommy = isTommyMessage(phoneNumber);

  // Consultation check for natural messages from untrusted contacts
  // Only applies when treatAsNatural is true and message doesn't start with /
  if (treatAsNatural && !text.startsWith('/') && !isTommy && contact) {
    if (shouldConsultTommy(contact, text)) {
      // Build display name for the consultation message
      const contactName = contact.display_name || phoneNumber;

      // Send consultation to Tommy with formatted message
      await sendMessage(TOMMY_PHONE, `${contactName} asked:\n\n"${text}"`);

      return { type: 'consultation_pending', phoneNumber };
    }
  }

  const parsed = parseMessage(text);
  console.log(`Parsed type: ${parsed.type}`);

  // Handle different parsed types
  switch (parsed.type) {
    case 'not_command':
      // Shouldn't happen since we filter for / above
      return { type: 'not_command' };

    case 'unknown_command':
      await sendMessage(phoneNumber, `Unknown command: /${parsed.commandName}\n\nUse /help to see available commands.`);
      return { type: 'unknown' };

    case 'session_resume':
      return await handleSessionResume(parsed, phoneNumber, sendMessage, isTommy);

    case 'command':
      return await handleParsedCommand(parsed, phoneNumber, sendMessage, isTommy);

    default:
      console.log(`Unknown parsed type: ${parsed.type}`);
      return { type: 'unknown' };
  }
}

/**
 * Handle session resume command (/<xx> [message])
 * @param {Object} parsed - Parsed message with sessionCode and optional message
 * @param {string} phoneNumber - Phone number to respond to
 * @param {Function} sendMessage - Function to send messages
 * @param {boolean} isTommy - Whether sender is Tommy (includes session codes if true)
 * @returns {Promise<Object>} Result object
 */
async function handleSessionResume(parsed, phoneNumber, sendMessage, isTommy = true) {
  const { sessionCode, message } = parsed;

  // Check for allow/deny commands BEFORE normal session resume
  const normalizedMessage = (message || '').trim().toLowerCase();
  if (normalizedMessage === 'allow' || normalizedMessage === 'deny') {
    // Check if there's a pending question for this session code
    const pending = getPendingByCode(sessionCode);
    if (pending && pending.status === 'pending') {
      // Resolve the pending question
      const action = normalizedMessage;
      resolvePending(sessionCode, action);

      // Send confirmation to Tommy
      if (action === 'allow') {
        await sendMessage(phoneNumber, `Request approved for /${sessionCode}`);
      } else {
        await sendMessage(phoneNumber, `Request denied for /${sessionCode}`);
      }

      return { type: 'consultation_resolved', sessionCode, action };
    }
    // If no pending question or already resolved, fall through to normal session resume
  }

  // Look up the session
  const session = getSessionByCode(sessionCode);

  if (!session) {
    await sendMessage(phoneNumber, `Session not found: /${sessionCode}\n\nUse /sessions to see active sessions.`);
    return { type: 'session_not_found', sessionCode };
  }

  // Build task text
  const task = message || 'continue';

  // Check queue position and enqueue
  const queuePos = getQueueDepth() + 1;

  // Enqueue the job
  enqueue({
    task,
    chatId: phoneNumber,
    source: 'imessage',
    sessionCode: session.code,
    priority: PRIORITY.CRITICAL
  });

  // Respond based on current processing state
  if (isProcessing()) {
    // Busy with different session
    const currentCode = getCurrentSessionCode();
    if (currentCode !== sessionCode) {
      // Include session code only for Tommy
      if (isTommy) {
        await sendMessage(phoneNumber, `${getBusyMessage(queuePos)}\nSession: /${sessionCode}`);
      } else {
        await sendMessage(phoneNumber, getBusyMessage(queuePos));
      }
    } else {
      // Same session - still queued
      if (isTommy) {
        await sendMessage(phoneNumber, `Queued follow-up for session /${sessionCode}`);
      } else {
        await sendMessage(phoneNumber, 'Follow-up queued');
      }
    }
  } else {
    if (isTommy) {
      await sendMessage(phoneNumber, `Resuming session /${sessionCode}...`);
    } else {
      await sendMessage(phoneNumber, 'Resuming your task...');
    }
  }

  return { type: 'session_resume', sessionCode, message };
}

/**
 * Handle a parsed command
 * @param {Object} parsed - Parsed command object
 * @param {string} phoneNumber - Phone number to respond to
 * @param {Function} sendMessage - Function to send messages
 * @param {boolean} isTommy - Whether sender is Tommy (includes session codes if true)
 * @returns {Promise<Object>} Result object
 */
async function handleParsedCommand(parsed, phoneNumber, sendMessage, isTommy = true) {
  const { handler, commandName, argString } = parsed;

  // Handle internal commands immediately
  if (handler.type === 'internal') {
    if (handler.function === 'handleHelp') {
      // Check for specific command help
      const helpArg = argString?.trim();
      await sendMessage(phoneNumber, getHelpText(helpArg || undefined));
      return { type: 'help' };
    } else if (handler.function === 'handleStatus') {
      await sendMessage(phoneNumber, getStatusMessage());
      return { type: 'status' };
    } else if (handler.function === 'handleSessions') {
      const sessions = listSessions('imessage');
      if (sessions.length === 0) {
        await sendMessage(phoneNumber, 'No active sessions.\n\nUse /claude <task> to start a new task.');
      } else {
        let response = 'Active Sessions:\n\n';
        for (const session of sessions) {
          const age = getSessionAge(session.createdAt);
          response += `/${session.code} - ${session.task.slice(0, 40)}${session.task.length > 40 ? '...' : ''}\n`;
          response += `  Created: ${age} ago\n\n`;
        }
        response += 'Resume with: /<code> [message]';
        await sendMessage(phoneNumber, response);
      }
      return { type: 'sessions' };
    } else if (handler.function === 'handleQuestions') {
      const pendingQuestions = getPendingQuestions('pending');
      if (pendingQuestions.length === 0) {
        await sendMessage(phoneNumber, 'No pending approval requests.');
      } else {
        let response = `Pending Requests (${pendingQuestions.length}):\n\n`;
        for (const question of pendingQuestions) {
          // Get contact name (display_name or phone number)
          const contact = getContact(question.phoneNumber);
          const contactName = contact?.display_name || question.phoneNumber;

          // Truncate question to 50 chars
          const truncatedQuestion = question.question.length > 50
            ? question.question.slice(0, 50) + '...'
            : question.question;

          response += `/${question.sessionCode} - ${contactName}\n`;
          response += `  "${truncatedQuestion}"\n\n`;
        }
        response += 'Reply: /<code> allow or /<code> deny';
        await sendMessage(phoneNumber, response);
      }
      return { type: 'questions' };
    } else if (handler.function === 'handleDigest') {
      // Parse days from argString, default to 7
      const days = parseInt(argString) || 7;
      await sendMessage(phoneNumber, `Digest (last ${days} days): Feature coming soon.\n\nFor now, use /questions to see pending requests.`);
      return { type: 'digest' };
    }
    return { type: 'internal', handler: handler.function };
  }

  // Handle claude and skill commands
  if (handler.type === 'claude' || handler.type === 'skill') {
    const task = handler.type === 'claude'
      ? argString
      : `Use the /${handler.skill} skill: ${argString}`;

    if (!task || task.trim() === '') {
      await sendMessage(phoneNumber, `Please provide a task. Example: /${commandName} <your task here>`);
      return { type: 'empty_task' };
    }

    // Create a new session with type 'imessage' (2-char codes)
    const session = createSession({
      type: 'imessage',
      task,
      chatId: phoneNumber
    });

    // Check queue position before enqueueing
    const queuePos = getQueueDepth() + 1;

    // Enqueue the job
    enqueue({
      task,
      chatId: phoneNumber,
      source: 'imessage',
      sessionCode: session.code,
      priority: PRIORITY.CRITICAL
    });

    // Respond based on processing state
    // Include session code only for Tommy
    if (isProcessing()) {
      if (isTommy) {
        await sendMessage(phoneNumber, `${getBusyMessage(queuePos)}\nSession: /${session.code}`);
      } else {
        await sendMessage(phoneNumber, getBusyMessage(queuePos));
      }
    } else {
      if (isTommy) {
        await sendMessage(phoneNumber, `Starting... Session: /${session.code}`);
      } else {
        await sendMessage(phoneNumber, 'Starting your task...');
      }
    }

    return { type: 'claude', sessionCode: session.code, task };
  }

  // Unknown handler type
  console.log(`Unhandled command type: ${handler.type}`);
  await sendMessage(phoneNumber, `Command /${commandName} is not yet supported.`);
  return { type: 'unsupported', commandName };
}

// ============================================
// Message Polling
// ============================================

/**
 * Poll for new messages and process them
 */
async function pollMessages() {
  const DEBUG = process.argv.includes('--debug');

  try {
    const messages = getRecentMessages(TOMMY_PHONE, 20);

    if (DEBUG && messages.length > 0) {
      console.log(`[Poll] Fetched ${messages.length} messages`);
    }

    // On first poll (no lastProcessedId), record existing messages as "seen"
    if (lastProcessedId === 0 && messages.length > 0) {
      // Mark all existing messages as processed
      for (const msg of messages) {
        processedMessageIds.add(msg.id);
      }
      lastProcessedId = messages[0].id;
      if (DEBUG) {
        console.log(`[Poll] First poll - marked ${messages.length} existing messages as seen`);
      }
      return;
    }

    // Filter to new, valid command messages
    const toProcess = filterNewMessages(messages, processedMessageIds);

    // Process each command (oldest first)
    const orderedMessages = [...toProcess].reverse();

    for (const msg of orderedMessages) {
      // Double-check not already processed (race condition protection)
      if (processedMessageIds.has(msg.id)) {
        continue;
      }

      // Mark as processed BEFORE handling to prevent duplicates
      processedMessageIds.add(msg.id);

      console.log(`\n[${new Date().toISOString()}] Received: "${msg.text}"`);
      await processCommand({
        text: msg.text,
        phoneNumber: TOMMY_PHONE
      });
    }

    // Update last processed ID
    if (messages.length > 0) {
      lastProcessedId = messages[0].id;
    }

    // Clean up old processed IDs to prevent memory leak
    if (processedMessageIds.size > MAX_PROCESSED_IDS) {
      const idsArray = Array.from(processedMessageIds);
      const toRemove = idsArray.slice(0, idsArray.length - MAX_PROCESSED_IDS);
      toRemove.forEach(id => processedMessageIds.delete(id));
    }

  } catch (err) {
    console.error('Polling error:', err.message);
  }
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
// Safe message sending wrapper
// ============================================

/**
 * Send message via iMessage with dry-run support
 * Used as callback for worker.js
 * @param {string} chatId - Phone number to send to
 * @param {string} message - Message to send
 */
async function workerSendMessage(chatId, message) {
  await safeSendMessage(chatId, message, { dryRun: DRY_RUN });
}

// ============================================
// Startup and Bot Initialization
// ============================================

let pollingInterval = null;
let queueInterval = null;
let sessionExpiryInterval = null;

/**
 * Start the bot's main loops
 */
function startBot() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\nMode: ${mode}`);
  console.log('Starting message polling...');
  console.log('Commands: /claude, /help, /status, /sessions, /research, /github, /x, /youtube, /email, /schedule\n');

  // Register the send callback with the worker
  setSendMessageCallback(workerSendMessage);

  // Set dry-run mode in worker if enabled
  if (DRY_RUN) {
    setDryRunMode(true);
  }

  // Start polling for messages
  pollingInterval = setInterval(pollMessages, POLLING_INTERVAL_MS);

  // Start queue processing interval (every 1 second)
  queueInterval = setInterval(processQueue, QUEUE_PROCESS_INTERVAL_MS);

  // Start session expiry interval (every hour)
  sessionExpiryInterval = setInterval(() => {
    const expired = expireSessions(SESSION_MAX_AGE_MS);
    if (expired > 0) {
      console.log(`[Session cleanup] Expired ${expired} old sessions`);
    }
  }, SESSION_EXPIRY_INTERVAL_MS);

  // Send startup message
  setTimeout(async () => {
    try {
      const msg = DRY_RUN
        ? 'Bot online [DRY-RUN MODE]\nCommands will be parsed but not executed.\nUse /help to see available commands.'
        : 'Bot online! Use /help to see available commands.';
      await safeSendMessage(TOMMY_PHONE, msg, { dryRun: DRY_RUN });
      console.log('Sent startup message');
    } catch (err) {
      console.error('Failed to send startup message:', err.message);
    }
  }, 2000);
}

// ============================================
// Shutdown Handlers
// ============================================

/**
 * Cleanup function for graceful shutdown
 */
function cleanup() {
  console.log('\nShutting down...');

  // Clear intervals
  if (pollingInterval) clearInterval(pollingInterval);
  if (queueInterval) clearInterval(queueInterval);
  if (sessionExpiryInterval) clearInterval(sessionExpiryInterval);

  // Release lock
  releaseLock();
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

// Ensure lock is released on exit
process.on('exit', () => {
  releaseLock();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup();
  process.exit(1);
});

// ============================================
// Main Startup
// ============================================

/**
 * Main entry point
 */
async function main() {
  console.log('Starting iMessage bot...');
  if (DRY_RUN) {
    console.log('*** DRY-RUN MODE ENABLED ***\n');
  } else {
    console.log('*** LIVE MODE ***\n');
  }

  // Acquire lock (exit if already running)
  if (!acquireLock()) {
    console.error('Exiting: another instance is already running');
    process.exit(1);
  }

  // Run startup cleanup
  const cleanupResult = startupCleanup();
  if (cleanupResult.orphanedJobs > 0) {
    console.log(`Startup cleanup: recovered ${cleanupResult.orphanedJobs} orphaned jobs`);
  }
  if (cleanupResult.chromeProcesses > 0) {
    console.log(`Startup cleanup: killed ${cleanupResult.chromeProcesses} Chrome processes`);
  }
  if (cleanupResult.tempFiles > 0) {
    console.log(`Startup cleanup: removed ${cleanupResult.tempFiles} temp files`);
  }

  // Start the bot
  startBot();
}

// Only run main if this is the entry point (not imported for testing)
if (import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*[/\\]/, ''))) {
  main().catch(err => {
    console.error('Fatal error:', err);
    cleanup();
    process.exit(1);
  });
}
