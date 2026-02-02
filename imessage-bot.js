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
import { getRecentMessages, getAllRecentMessages, getChatInfo } from './lib/imessage-reader.js';
import { safeSendMessage, safeSendGroupMessage } from './lib/imessage-sender.js';
import { parseMessage, getHelpText } from './lib/message-parser.js';
import { enqueue, PRIORITY, getQueueDepth, getActiveJob } from './lib/queue.js';
import { createSession, getSessionByCode, listSessions, expireSessions } from './lib/sessions.js';
// Note: Worker logic moved to standalone worker.js process

/**
 * Check if a job is currently being processed (uses queue state)
 * @returns {boolean} True if a job is active
 */
function isProcessing() {
  return getActiveJob() !== null;
}

/**
 * Get the current session code being processed (uses queue state)
 * @returns {string|null} Session code or null
 */
function getCurrentSessionCode() {
  const activeJob = getActiveJob();
  return activeJob?.sessionCode || null;
}
import { startupCleanup } from './lib/resources.js';
import { getBusyMessage, getStatusMessage } from './lib/busy-handler.js';
import { shouldConsultTommy, sendConsultation } from './lib/imessage-consultation.js';
import { getPendingByCode, resolvePending, getPendingQuestions } from './lib/imessage-pending.js';
import { getContact, getOrCreateContact } from './lib/imessage-permissions.js';
import { GroupMonitor } from './lib/group-monitor.js';

// Initialize group monitor for tracking Brokkr mentions in group chats
const groupMonitor = new GroupMonitor();

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
export const UNIVERSAL_ACCESS = process.argv.includes('--universal');
const LOCK_FILE = join(WORKSPACE, 'imessage-bot.lock');

// Session expiration interval: 1 hour (in ms)
const SESSION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;
// Session max age: 24 hours (in ms)
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
 * @param {Object} options.chatInfo - Optional chat info for group message handling
 * @returns {Promise<Object>} Result object with type and details
 */
export async function processCommand(options) {
  const { text, phoneNumber, sendMessage: customSendMessage = null, contact = null, treatAsNatural = false, chatInfo = null } = options;

  // Determine if this is a group message
  const isGroupMessage = chatInfo?.isGroup === true;

  // Create appropriate send function based on chat type
  const sendMessage = customSendMessage || ((target, msg) => {
    if (isGroupMessage && chatInfo?.guid) {
      console.log(`[DEBUG] Sending to group chat: ${chatInfo.guid}`);
      return safeSendGroupMessage(chatInfo.guid, msg, { dryRun: DRY_RUN });
    } else {
      return safeSendMessage(target, msg, { dryRun: DRY_RUN });
    }
  });

  // Check if sender is Tommy - only Tommy gets session codes (and only in direct messages)
  // Group messages never get session codes
  const isTommy = isTommyMessage(phoneNumber) && !isGroupMessage;

  // SECURITY: Permission check for ALL messages from non-Tommy contacts
  // This applies to both commands AND natural messages
  if (!isTommy && contact) {
    // Check if consultation is needed (untrusted or partial_trust contacts)
    if (shouldConsultTommy(contact, text)) {
      // Use proper sendConsultation to create session code for allow/deny
      const pendingEntry = await sendConsultation({
        contact,
        message: text,
        sendMessage: (phone, msg) => safeSendMessage(phone, msg, { dryRun: DRY_RUN }),
        tommyPhone: TOMMY_PHONE
      });

      console.log(`[SECURITY] Created consultation /${pendingEntry.sessionCode} for ${contact.display_name || phoneNumber}: "${text.slice(0, 50)}..."`);
      return { type: 'consultation_pending', phoneNumber, sessionCode: pendingEntry.sessionCode };
    }
    // If contact is trusted (shouldConsultTommy returns false), allow through
    console.log(`[SECURITY] Trusted contact ${contact.display_name || phoneNumber} - allowing message through`);
  }

  const parsed = parseMessage(text, { treatAsNatural });
  console.log(`Parsed type: ${parsed.type}, treatAsNatural: ${treatAsNatural}, isTommy: ${isTommy}`);

  // Handle different parsed types
  switch (parsed.type) {
    case 'not_command':
      // Non-command message when treatAsNatural is false - ignore
      console.log(`[DEBUG] Ignoring not_command message (treatAsNatural=${treatAsNatural})`);
      return { type: 'not_command' };

    case 'natural_message':
      // Natural conversation message - treat as /claude command
      console.log(`[DEBUG] Processing natural message as /claude task: "${parsed.message.slice(0, 50)}..."`);
      // Create a synthetic parsed object that looks like a /claude command
      const syntheticParsed = {
        type: 'command',
        commandName: 'claude',
        command: { name: 'claude', handler: { type: 'claude', prompt: '$ARGUMENTS' } },
        argString: parsed.message,
        handler: { type: 'claude', prompt: '$ARGUMENTS' }
      };
      return await handleParsedCommand(syntheticParsed, phoneNumber, sendMessage, isTommy, chatInfo);

    case 'unknown_command':
      await sendMessage(phoneNumber, `Unknown command: /${parsed.commandName}\n\nUse /help to see available commands.`);
      return { type: 'unknown' };

    case 'session_resume':
      return await handleSessionResume(parsed, phoneNumber, sendMessage, isTommy, chatInfo);

    case 'command':
      return await handleParsedCommand(parsed, phoneNumber, sendMessage, isTommy, chatInfo);

    default:
      console.log(`[DEBUG] Unknown parsed type: ${parsed.type}`);
      return { type: 'unknown' };
  }
}

/**
 * Handle session resume command (/<xx> [message])
 * @param {Object} parsed - Parsed message with sessionCode and optional message
 * @param {string} phoneNumber - Phone number to respond to
 * @param {Function} sendMessage - Function to send messages
 * @param {boolean} isTommy - Whether sender is Tommy (includes session codes if true)
 * @param {Object} chatInfo - Chat info for group detection
 * @returns {Promise<Object>} Result object
 */
async function handleSessionResume(parsed, phoneNumber, sendMessage, isTommy = true, chatInfo = null) {
  const { sessionCode, message } = parsed;
  // Use group GUID as chatId if this is a group message
  const responseChatId = chatInfo?.isGroup && chatInfo?.guid ? chatInfo.guid : phoneNumber;

  // Check for allow/deny commands BEFORE normal session resume
  // Format: /<xx> <allow|y|deny|n> [/ <additional instructions>]
  const messageText = (message || '').trim();
  const messageLower = messageText.toLowerCase();

  // Check for approval/denial patterns
  // First word determines action: y/allow = approve, n/deny = reject
  const firstWord = messageLower.split(/[\s\/]/)[0];  // Split on space or /
  const isApproval = firstWord === 'allow' || firstWord === 'y' || firstWord === 'yes';
  const isDenial = firstWord === 'deny' || firstWord === 'n' || firstWord === 'no';

  console.log(`[DEBUG handleSessionResume] sessionCode=${sessionCode}, messageText="${messageText}", firstWord="${firstWord}", isApproval=${isApproval}, isDenial=${isDenial}`);

  if (isApproval || isDenial) {
    // Check if there's a pending question for this session code
    const pending = getPendingByCode(sessionCode);
    console.log(`[DEBUG handleSessionResume] pending lookup result:`, pending ? { code: pending.sessionCode, status: pending.status } : 'null');
    if (pending && pending.status === 'pending') {

      if (isApproval) {
        // Parse for additional instructions after "/"
        // Format: "allow / update contact name to John" or "y / he's my coworker"
        let additionalInstructions = null;
        const slashIndex = messageText.indexOf('/');
        if (slashIndex > 0) {
          additionalInstructions = messageText.slice(slashIndex + 1).trim();
        }

        // Resolve the pending question
        resolvePending(sessionCode, 'allow');

        // Build the task for Claude
        const originalQuestion = pending.question;
        const originalPhoneNumber = pending.phoneNumber;
        const contactName = pending.context?.replace('From ', '') || originalPhoneNumber;

        let task;
        if (additionalInstructions) {
          // Include Tommy's additional instructions for Claude
          task = `${contactName} asked: "${originalQuestion}"

Tommy's instructions: ${additionalInstructions}

Respond to ${contactName} and follow Tommy's instructions (which may include updating contact details, permissions, etc.)`;
        } else {
          // Just process the original question
          task = originalQuestion;
        }

        const session = createSession({
          type: 'imessage',
          task,
          chatId: originalPhoneNumber
        });

        // Enqueue the job to process the request
        enqueue({
          task,
          chatId: originalPhoneNumber,
          source: 'imessage',
          sessionCode: session.code,
          priority: PRIORITY.CRITICAL,
          phoneNumber: originalPhoneNumber
        });

        // Send confirmation to Tommy
        const confirmMsg = additionalInstructions
          ? `Approved /${sessionCode} with instructions. Processing for ${contactName}...`
          : `Approved /${sessionCode}. Processing for ${contactName}...`;
        await sendMessage(phoneNumber, confirmMsg);

        return { type: 'consultation_approved', sessionCode, newSessionCode: session.code, hasInstructions: !!additionalInstructions };
      } else {
        // Deny - check for additional instructions (e.g., "n / restrict this contact")
        let additionalInstructions = null;
        const slashIndex = messageText.indexOf('/');
        if (slashIndex > 0) {
          additionalInstructions = messageText.slice(slashIndex + 1).trim();
        }

        // Resolve the pending question
        resolvePending(sessionCode, 'deny');

        if (additionalInstructions) {
          // Process instructions with Claude (e.g., restrict contact, update permissions)
          const originalPhoneNumber = pending.phoneNumber;
          const contactName = pending.context?.replace('From ', '') || originalPhoneNumber;

          const task = `Request from ${contactName} was DENIED: "${pending.question}"

Tommy's instructions: ${additionalInstructions}

Follow Tommy's instructions to update contact settings, restrictions, etc. Do NOT respond to the contact.`;

          const session = createSession({
            type: 'imessage',
            task,
            chatId: phoneNumber  // Send response to Tommy, not the contact
          });

          enqueue({
            task,
            chatId: phoneNumber,
            source: 'imessage',
            sessionCode: session.code,
            priority: PRIORITY.CRITICAL,
            phoneNumber: phoneNumber
          });

          await sendMessage(phoneNumber, `Denied /${sessionCode} with instructions. Processing...`);
          return { type: 'consultation_denied', sessionCode, hasInstructions: true };
        } else {
          await sendMessage(phoneNumber, `Denied /${sessionCode}`);
          return { type: 'consultation_denied', sessionCode };
        }
      }
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

  // Enqueue the job - use group GUID as chatId for group chats
  enqueue({
    task,
    chatId: responseChatId,
    source: 'imessage',
    sessionCode: session.code,
    priority: PRIORITY.CRITICAL,
    phoneNumber: phoneNumber
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
 * @param {Object} chatInfo - Chat info for group detection
 * @returns {Promise<Object>} Result object
 */
async function handleParsedCommand(parsed, phoneNumber, sendMessage, isTommy = true, chatInfo = null) {
  const { handler, commandName, argString } = parsed;
  // Use group GUID as chatId if this is a group message
  const responseChatId = chatInfo?.isGroup && chatInfo?.guid ? chatInfo.guid : phoneNumber;
  console.log(`[DEBUG handleParsedCommand] chatInfo=${JSON.stringify(chatInfo)}, responseChatId=${responseChatId}`);

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

          // Show full question (up to 200 chars) for better context
          const displayQuestion = question.question.length > 200
            ? question.question.slice(0, 200) + '...'
            : question.question;

          response += `/${question.sessionCode} - ${contactName}\n`;
          response += `"${displayQuestion}"\n\n`;
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
      chatId: responseChatId
    });

    // Check queue position before enqueueing
    const queuePos = getQueueDepth() + 1;

    // Enqueue the job - use group GUID as chatId for group chats
    console.log(`[DEBUG enqueue] Enqueueing job with chatId=${responseChatId}, isGroupChat=${chatInfo?.isGroup}`);
    enqueue({
      task,
      chatId: responseChatId,
      source: 'imessage',
      sessionCode: session.code,
      priority: PRIORITY.CRITICAL,
      phoneNumber: phoneNumber
    });

    // Respond based on processing state
    // Include session code only for Tommy
    // Skip pre-alert messages for group chats (per plan spec)
    const isGroupChat = chatInfo?.isGroup === true;

    if (!isGroupChat) {
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
    }
    // Group chats: no pre-alert, just process silently

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
 * Poll for new messages and process them (with injectable dependencies for testing)
 *
 * @param {Object} deps - Dependencies
 * @param {boolean} deps.universalAccess - Whether to use universal access mode
 * @param {Function} deps.getRecentMessages - Function to get recent messages from a phone
 * @param {Function} deps.getAllRecentMessages - Function to get all recent messages
 * @param {Function} deps.getOrCreateContact - Function to get or create a contact
 * @param {Function} deps.getChatInfo - Function to get chat info from chat_id
 * @param {Function} deps.processCommand - Function to process a command
 * @param {Set} deps.processedIds - Set of processed message IDs
 * @param {boolean} deps.isFirstPoll - Whether this is the first poll (mark as seen)
 */
export async function pollMessagesWithDeps(deps) {
  const {
    universalAccess,
    getRecentMessages: getRecentMessagesFn,
    getAllRecentMessages: getAllRecentMessagesFn,
    getOrCreateContact: getOrCreateContactFn,
    getChatInfo: getChatInfoFn = getChatInfo,
    processCommand: processCommandFn,
    processedIds,
    isFirstPoll
  } = deps;

  const DEBUG = process.argv.includes('--debug');

  try {
    // Fetch messages based on access mode
    const messages = universalAccess
      ? getAllRecentMessagesFn(50)
      : getRecentMessagesFn(TOMMY_PHONE, 20);

    if (DEBUG && messages.length > 0) {
      console.log(`[Poll] Fetched ${messages.length} messages (universal=${universalAccess})`);
    }

    // On first poll, record existing messages as "seen"
    if (isFirstPoll && messages.length > 0) {
      for (const msg of messages) {
        processedIds.add(msg.id);
      }
      if (DEBUG) {
        console.log(`[Poll] First poll - marked ${messages.length} existing messages as seen`);
      }
      return;
    }

    // Filter to new, valid messages
    const toProcess = filterNewMessages(messages, processedIds, { universalAccess });

    // Process each message (oldest first)
    const orderedMessages = [...toProcess].reverse();

    for (const msg of orderedMessages) {
      // Double-check not already processed (race condition protection)
      if (processedIds.has(msg.id)) {
        continue;
      }

      // Mark as processed BEFORE handling to prevent duplicates
      processedIds.add(msg.id);

      // Determine if message is a command or natural message
      const isCommand = msg.text.startsWith('/');

      // In universal mode, get/create contact for this sender
      // In non-universal mode, we only get messages from Tommy (hardcoded)
      const phoneNumber = universalAccess ? msg.sender : TOMMY_PHONE;
      const contact = universalAccess
        ? getOrCreateContactFn(msg.sender, 'iMessage', 'us')
        : null;

      // Get chat info to determine if this is a group message
      // chat_id is only available in universal mode (from getAllRecentMessages)
      let chatInfo = null;
      if (universalAccess && msg.chat_id) {
        chatInfo = getChatInfoFn(msg.chat_id);
        if (chatInfo?.isGroup) {
          console.log(`[DEBUG] Group chat detected: ${chatInfo.guid} (${chatInfo.memberCount} members)`);
        }
      }

      const treatAsNatural = universalAccess && !isCommand;
      console.log(`\n[${new Date().toISOString()}] Received from ${phoneNumber}: "${msg.text}"`);
      console.log(`[DEBUG] isCommand=${isCommand}, universalAccess=${universalAccess}, treatAsNatural=${treatAsNatural}, isGroup=${chatInfo?.isGroup || false}`);

      // For group chats with natural messages, check if Brokkr should respond
      if (chatInfo?.isGroup && treatAsNatural) {
        const groupResponse = groupMonitor.processMessage({
          groupId: chatInfo.guid,
          text: msg.text,
          sender: phoneNumber
        });
        console.log(`[DEBUG] Group monitor: shouldRespond=${groupResponse.shouldRespond}, reason=${groupResponse.reason}`);

        if (!groupResponse.shouldRespond) {
          // Skip processing - Brokkr was not mentioned/addressed
          continue;
        }
      }

      await processCommandFn({
        text: msg.text,
        phoneNumber,
        contact,
        treatAsNatural,
        chatInfo
      });
    }

  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

/**
 * Poll for new messages and process them
 * Uses the module's dependencies (for production use)
 */
export async function pollMessages() {
  const isFirstPoll = lastProcessedId === 0;

  await pollMessagesWithDeps({
    universalAccess: UNIVERSAL_ACCESS,
    getRecentMessages,
    getAllRecentMessages,
    getOrCreateContact,
    processCommand,
    processedIds: processedMessageIds,
    isFirstPoll
  });

  // Update last processed ID based on current state of processedMessageIds
  // (to track that we've done at least one poll)
  if (isFirstPoll && processedMessageIds.size > 0) {
    lastProcessedId = Math.max(...processedMessageIds);
  }

  // Clean up old processed IDs to prevent memory leak
  if (processedMessageIds.size > MAX_PROCESSED_IDS) {
    const idsArray = Array.from(processedMessageIds);
    const toRemove = idsArray.slice(0, idsArray.length - MAX_PROCESSED_IDS);
    toRemove.forEach(id => processedMessageIds.delete(id));
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a chat ID is a group chat GUID
 * Group GUIDs typically contain 'chat' (e.g., 'iMessage;+;chat12345' or 'chat12345')
 * @param {string} chatId - Chat ID to check
 * @returns {boolean} True if this is a group chat GUID
 */
function isGroupChatId(chatId) {
  return chatId && (chatId.includes('chat') || chatId.includes(';+;'));
}

// ============================================
// Startup and Bot Initialization
// ============================================

let pollingInterval = null;
let sessionExpiryInterval = null;

/**
 * Start the poller's main loops
 * Note: Queue processing is handled by the standalone worker.js process
 */
function startBot() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\nMode: ${mode}`);
  console.log('Starting message polling...');
  console.log('Note: Job processing handled by worker.js');
  console.log('Commands: /claude, /help, /status, /sessions, /research, /github, /x, /youtube, /email, /schedule\n');

  // Start polling for messages
  pollingInterval = setInterval(pollMessages, POLLING_INTERVAL_MS);

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
