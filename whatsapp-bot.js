// whatsapp-bot.js
// WhatsApp bot with queue/worker integration for Brokkr V2
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

// Import library modules
import { parseMessage, getHelpText } from './lib/message-parser.js';
import { enqueue, PRIORITY, getQueueDepth } from './lib/queue.js';
import { createSession, getSessionByCode, listSessions, expireSessions } from './lib/sessions.js';
import { processNextJob, setSendMessageCallback, isProcessing, getCurrentSessionCode } from './lib/worker.js';
import { startupCleanup } from './lib/resources.js';
import { getBusyMessage, getStatusMessage } from './lib/busy-handler.js';

const WORKSPACE = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const LOCK_FILE = join(WORKSPACE, 'bot.lock');

// Session expiration interval: 1 hour (in ms)
const SESSION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
// Session max age: 24 hours (in ms)
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Queue processing interval: 1 second
const QUEUE_PROCESS_INTERVAL_MS = 1000;

// ============================================
// Lock file management (single instance)
// ============================================

/**
 * Acquire the bot lock file to ensure single instance
 * @returns {boolean} True if lock acquired, false if already running
 */
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Check if process is still running
      try {
        process.kill(lockData.pid, 0); // Signal 0 just checks if process exists
        console.error(`Bot already running (PID: ${lockData.pid})`);
        return false;
      } catch (err) {
        // Process not running, stale lock file
        console.log(`Removing stale lock file (PID ${lockData.pid} not running)`);
        unlinkSync(LOCK_FILE);
      }
    } catch (err) {
      // Invalid lock file, remove it
      console.log('Removing invalid lock file');
      try { unlinkSync(LOCK_FILE); } catch {}
    }
  }

  // Write new lock file
  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString()
  };
  writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
  console.log(`Lock acquired (PID: ${process.pid})`);
  return true;
}

/**
 * Release the bot lock file
 */
function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Only remove if we own the lock
      if (lockData.pid === process.pid) {
        unlinkSync(LOCK_FILE);
        console.log('Lock released');
      }
    }
  } catch (err) {
    // Ignore errors during cleanup
  }
}

// ============================================
// WhatsApp Client Setup
// ============================================

const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032721183-alpha.html'
  },
  puppeteer: {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// ============================================
// Safe message sending with retry logic
// ============================================

/**
 * Send message with retry logic
 * @param {string} chatId - Chat ID to send message to
 * @param {string} message - Message to send
 * @param {number} retries - Number of retry attempts
 */
async function safeSendMessage(chatId, message, retries = 3) {
  // Add dry-run prefix if in dry-run mode
  const finalMessage = DRY_RUN ? `[DRY-RUN] ${message}` : message;

  // Chunk long messages (WhatsApp limit ~4000 chars)
  const MAX_LENGTH = 4000;
  const chunks = [];
  for (let i = 0; i < finalMessage.length; i += MAX_LENGTH) {
    chunks.push(finalMessage.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    for (let i = 0; i < retries; i++) {
      try {
        await client.sendMessage(chatId, chunk, { sendSeen: false });
        break; // Success, move to next chunk
      } catch (err) {
        console.error(`Send attempt ${i + 1} failed:`, err.message);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
        else throw new Error('Failed to send after all retries');
      }
    }
  }
}

// Register the send callback with the worker
setSendMessageCallback(safeSendMessage);

// ============================================
// Client Event Handlers
// ============================================

client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent + '%', message);
});

client.on('authenticated', () => {
  console.log('Authenticated!');
});

client.on('auth_failure', msg => {
  console.error('Auth failure:', msg);
});

// ============================================
// Message Polling
// ============================================

let lastMessageId = null;
let pollCount = 0;

async function pollForMessages() {
  pollCount++;
  const DEBUG = process.argv.includes('--debug');

  try {
    const chats = await client.getChats();
    const myId = client.info?.wid?._serialized;

    // Find "message yourself" chat
    let selfChat = chats.find(c => c.id._serialized.endsWith('@lid'));

    // Fallback: try to find by matching user's own ID
    if (!selfChat && myId) {
      const myNumber = myId.replace('@c.us', '');
      selfChat = chats.find(c => c.id.user === myNumber || c.id._serialized.includes(myNumber));
    }

    // Fallback: find chat named "You"
    if (!selfChat) {
      selfChat = chats.find(c => c.isGroup === false && c.name === 'You');
    }

    if (DEBUG && pollCount % 10 === 0) {
      console.log(`[Poll #${pollCount}] selfChat: ${!!selfChat}, myId: ${myId}`);
      if (!selfChat && pollCount === 10) {
        console.log('Available chats:', chats.slice(0, 5).map(c => ({ id: c.id._serialized, name: c.name })));
      }
    }

    if (selfChat && myId) {
      const messages = await selfChat.fetchMessages({ limit: 1 });
      const lastMsg = messages[0];

      if (DEBUG && lastMsg) {
        console.log(`[Poll #${pollCount}] Last msg: "${lastMsg.body?.slice(0, 30)}..." fromMe: ${lastMsg.fromMe}, isNew: ${lastMsg.id._serialized !== lastMessageId}`);
      }

      if (lastMsg && lastMsg.id._serialized !== lastMessageId && lastMsg.fromMe) {
        const text = lastMsg.body.trim();

        // Skip bot responses (they start with these patterns)
        if (text.startsWith('[DRY-RUN]') ||
            text.startsWith('Bot online') ||
            text.startsWith('Starting') ||
            text.startsWith('Unknown command:') ||
            text.startsWith('Working on:') ||
            text.startsWith('Bot Status:') ||
            text.startsWith('Session not found') ||
            text.startsWith('Resuming session') ||
            text.startsWith('Active Sessions:') ||
            text.startsWith('No active sessions')) {
          lastMessageId = lastMsg.id._serialized;
          if (DEBUG) console.log('[Skip] Bot response detected');
          return;
        }

        // Skip help text output
        if (text.includes('/claude <task>') && text.includes('/help')) {
          lastMessageId = lastMsg.id._serialized;
          if (DEBUG) console.log('[Skip] Help text detected');
          return;
        }

        // Only process messages starting with /
        if (text.startsWith('/')) {
          lastMessageId = lastMsg.id._serialized;
          console.log(`\n[${new Date().toISOString()}] Received: "${text}"`);

          await handleCommand(text, myId);
        } else if (lastMsg.id._serialized !== lastMessageId) {
          lastMessageId = lastMsg.id._serialized;
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

// ============================================
// Command Handling
// ============================================

/**
 * Handle a slash command
 * @param {string} text - The command text
 * @param {string} chatId - The chat ID to respond to
 */
async function handleCommand(text, chatId) {
  const parsed = parseMessage(text);
  console.log(`Parsed type: ${parsed.type}`);

  // Handle different parsed types
  switch (parsed.type) {
    case 'not_command':
      // Shouldn't happen since we check for / above
      return;

    case 'unknown_command':
      await safeSendMessage(chatId, `Unknown command: /${parsed.commandName}\n\nUse /help to see available commands.`);
      return;

    case 'session_resume':
      await handleSessionResume(parsed, chatId);
      return;

    case 'command':
      await handleParsedCommand(parsed, chatId);
      return;

    default:
      console.log(`Unknown parsed type: ${parsed.type}`);
  }
}

/**
 * Handle session resume command (/<xx> [message])
 * @param {Object} parsed - Parsed message with sessionCode and optional message
 * @param {string} chatId - Chat ID to respond to
 */
async function handleSessionResume(parsed, chatId) {
  const { sessionCode, message } = parsed;

  // Look up the session
  const session = getSessionByCode(sessionCode);

  if (!session) {
    await safeSendMessage(chatId, `Session not found: /${sessionCode}\n\nUse /sessions to see active sessions.`);
    return;
  }

  // Build task text
  const task = message || 'continue';

  // Check queue position and enqueue
  const queuePos = getQueueDepth() + 1;

  // Enqueue the job
  enqueue({
    task,
    chatId,
    source: 'whatsapp',
    sessionCode: session.code,
    priority: PRIORITY.CRITICAL
  });

  // Respond based on current processing state
  if (isProcessing()) {
    // Busy with different session
    const currentCode = getCurrentSessionCode();
    if (currentCode !== sessionCode) {
      await safeSendMessage(chatId, `${getBusyMessage(queuePos)}\nSession: /${sessionCode}`);
    } else {
      // Same session - still queued
      await safeSendMessage(chatId, `Queued follow-up for session /${sessionCode}`);
    }
  } else {
    await safeSendMessage(chatId, `Resuming session /${sessionCode}...`);
  }
}

/**
 * Handle a parsed command
 * @param {Object} parsed - Parsed command object
 * @param {string} chatId - Chat ID to respond to
 */
async function handleParsedCommand(parsed, chatId) {
  const { handler, commandName, argString, args } = parsed;

  // Handle internal commands immediately
  if (handler.type === 'internal') {
    if (handler.function === 'handleHelp') {
      // Check for specific command help
      const helpArg = argString?.trim();
      await safeSendMessage(chatId, getHelpText(helpArg || undefined));
    } else if (handler.function === 'handleStatus') {
      await safeSendMessage(chatId, getStatusMessage());
    } else if (handler.function === 'handleSessions') {
      const sessions = listSessions('whatsapp');
      if (sessions.length === 0) {
        await safeSendMessage(chatId, 'No active sessions.\n\nUse /claude <task> to start a new task.');
      } else {
        let response = 'Active Sessions:\n\n';
        for (const session of sessions) {
          const age = getSessionAge(session.createdAt);
          response += `/${session.code} - ${session.task.slice(0, 40)}${session.task.length > 40 ? '...' : ''}\n`;
          response += `  Created: ${age} ago\n\n`;
        }
        response += 'Resume with: /<code> [message]';
        await safeSendMessage(chatId, response);
      }
    }
    return;
  }

  // Handle claude and skill commands
  if (handler.type === 'claude' || handler.type === 'skill') {
    const task = handler.type === 'claude'
      ? argString
      : `Use the /${handler.skill} skill: ${argString}`;

    if (!task || task.trim() === '') {
      await safeSendMessage(chatId, `Please provide a task. Example: /${commandName} <your task here>`);
      return;
    }

    // Create a new session
    const session = createSession({
      type: 'whatsapp',
      task,
      chatId
    });

    // Check queue position before enqueueing
    const queuePos = getQueueDepth() + 1;

    // Enqueue the job
    enqueue({
      task,
      chatId,
      source: 'whatsapp',
      sessionCode: session.code,
      priority: PRIORITY.CRITICAL
    });

    // Respond based on processing state
    if (isProcessing()) {
      await safeSendMessage(chatId, `${getBusyMessage(queuePos)}\nSession: /${session.code}`);
    } else {
      await safeSendMessage(chatId, `Starting... Session: /${session.code}`);
    }

    return;
  }

  // Unknown handler type
  console.log(`Unhandled command type: ${handler.type}`);
  await safeSendMessage(chatId, `Command /${commandName} is not yet supported.`);
}

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
// Startup and Bot Initialization
// ============================================

let readyFired = false;
let botStarted = false;
let queueInterval = null;
let sessionExpiryInterval = null;

async function startBot() {
  if (botStarted) return;
  botStarted = true;

  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\nMode: ${mode}`);
  console.log('Starting message polling...');
  console.log('Commands: /claude, /help, /status, /sessions, /research, /github, /x, /youtube, /email, /schedule\n');

  // Start polling for messages
  setInterval(pollForMessages, 2000);

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
      const myId = client.info?.wid?._serialized;
      if (myId) {
        const msg = DRY_RUN
          ? 'Bot online [DRY-RUN MODE]\nCommands will be parsed but not executed.\nUse /help to see available commands.'
          : 'Bot online! Use /help to see available commands.';
        await client.sendMessage(myId, msg, { sendSeen: false });
        console.log('Sent startup message');
      }
    } catch (err) {
      console.log('Startup message skipped (library still initializing)');
    }
  }, 5000);
}

client.on('ready', () => {
  readyFired = true;
  console.log('\nWhatsApp READY!');
  console.log('Workspace:', WORKSPACE);
  if (DRY_RUN) {
    console.log('\n*** DRY-RUN MODE - Commands will be parsed but NOT executed ***');
  }
  console.log('\nSend /help to see available commands');
  console.log('Example: /claude list files in this project\n');
  startBot();
});

// Fallback if ready event doesn't fire (wait 45s for full initialization)
client.on('authenticated', () => {
  setTimeout(() => {
    if (!readyFired && client.info) {
      console.log('Ready event did not fire, using fallback');
      startBot();
    }
  }, 45000);
});

// ============================================
// Shutdown Handlers
// ============================================

function cleanup() {
  console.log('\nShutting down...');

  // Clear intervals
  if (queueInterval) clearInterval(queueInterval);
  if (sessionExpiryInterval) clearInterval(sessionExpiryInterval);

  // Release lock
  releaseLock();

  // Destroy client
  try {
    client.destroy();
  } catch (err) {
    // Ignore errors during shutdown
  }
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

// ============================================
// Main Startup
// ============================================

console.log('Starting WhatsApp bot...');
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

// Initialize WhatsApp client
client.initialize();
