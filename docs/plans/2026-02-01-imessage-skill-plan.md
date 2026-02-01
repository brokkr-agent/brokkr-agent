# iMessage Integration Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Add iMessage as a second input channel for the Brokkr agent, enabling Tommy to send commands via Messages.app with the same syntax as WhatsApp, sharing the same session pool and priority queue.

**Architecture:** Create an `imessage-bot.js` process that polls Messages.app via AppleScript for new messages from Tommy's phone number (+1 206-909-0025). Uses the existing session, queue, and worker infrastructure. Runs alongside whatsapp-bot.js as a separate process managed by PM2. iMessage sessions get 2-char codes like WhatsApp (CRITICAL priority). Responses sent back via AppleScript `send` command.

**Tech Stack:** Node.js, better-sqlite3 (for reading messages), osascript (for sending messages), shared lib modules (queue.js, sessions.js, worker.js, message-parser.js)

---

## CRITICAL: Research Findings (2026-02-01)

### AppleScript Limitation Discovered

**Messages.app AppleScript scripting dictionary has NO "message" class.** The original plan assumed AppleScript could read individual messages, but research confirms:

- Cannot access individual message objects or their properties
- Cannot get `text of msg`, `id of msg`, or `date received of msg`
- Chat-level properties are also unreliable/broken

### Revised Approach: Hybrid SQLite + AppleScript

**Reading Messages:** Use SQLite database at `~/Library/Messages/chat.db`
- Full access to all message history
- Reliable message properties (text, sender, date, is_read)
- Requires Full Disk Access permission for Terminal/Node

**Sending Messages:** Keep AppleScript approach (works correctly)
- Use `send` command to buddy/participant
- Retry logic and message chunking

### New Dependency

```bash
npm install better-sqlite3
```

### Permission Requirements

1. **Full Disk Access** (for reading chat.db):
   - System Settings → Privacy & Security → Full Disk Access
   - Add Terminal.app or node binary

2. **Automation** (for sending via AppleScript):
   - System Settings → Privacy & Security → Automation
   - Allow Terminal to control Messages.app

### Official Documentation Sources

- [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/)
- [Messages.sdef Analysis](https://github.com/tingraldi/SwiftScripting/blob/master/Frameworks/MessagesScripting/MessagesScripting/Messages.sdef)
- [iMessage Database Structure](https://davidbieber.com/snippets/2020-05-20-imessage-sql-db/)

---

## Design Decisions

### Why Separate Process (Not Merged)

1. **Isolation** - If iMessage polling fails, WhatsApp continues unaffected
2. **PM2 Management** - Each can be restarted independently
3. **Clear Logs** - Separate log files (`/tmp/imessage-bot.log`)
4. **Simpler Code** - No complex channel multiplexing

### Session Type

- iMessage sessions use type `'imessage'` (not `'whatsapp'`)
- Code length: 2 characters (same as WhatsApp - both are CRITICAL priority)
- Sessions are shared across all channels (can resume iMessage session from WhatsApp or webhook)

### No Anti-Loop Needed

Tommy and Brokkr use separate iCloud accounts, so Messages.app naturally separates incoming vs outgoing.

### AppleScript Strategy

1. **Reading Messages**: Query Messages.app for recent messages from Tommy's phone handle
2. **Sending Messages**: Use `send` command to Tommy's phone number via iMessage service
3. **Polling Interval**: 2 seconds (same as WhatsApp)

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | AppleScript Message Reader Module | `lib/imessage-reader.js`, `tests/imessage-reader.test.js` |
| 2 | AppleScript Message Sender Module | `lib/imessage-sender.js`, `tests/imessage-sender.test.js` |
| 3 | iMessage Bot Main Process | `imessage-bot.js` |
| 4 | Update Sessions for iMessage Type | `lib/sessions.js` |
| 5 | PM2 Configuration Update | `ecosystem.config.cjs` |
| 6 | Bot Control Script Update | `scripts/bot-control.sh` |
| 7 | Skill Documentation | `skills/imessage/skill.md` |
| 8 | Integration Testing | Manual testing script |
| 9 | CLAUDE.md Documentation | `CLAUDE.md` |

---

## Task 1: AppleScript Message Reader Module

**Files:**
- Create: `lib/imessage-reader.js`
- Create: `tests/imessage-reader.test.js`

### Step 1: Write the failing test

```javascript
// tests/imessage-reader.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecentMessages, buildReadScript, parseAppleScriptOutput } from '../lib/imessage-reader.js';

describe('iMessage Reader', () => {
  describe('buildReadScript', () => {
    it('should build AppleScript to read messages from phone number', () => {
      const script = buildReadScript('+12069090025', 10);

      expect(script).toContain('tell application "Messages"');
      expect(script).toContain('+12069090025');
      expect(script).toContain('get text of');
    });

    it('should handle message limit parameter', () => {
      const script = buildReadScript('+12069090025', 5);
      expect(script).toContain('5');
    });
  });

  describe('parseAppleScriptOutput', () => {
    it('should parse single message output', () => {
      const output = 'MSG|||12345|||/claude hello world|||2026-02-01T10:00:00Z';
      const messages = parseAppleScriptOutput(output);

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('12345');
      expect(messages[0].text).toBe('/claude hello world');
      expect(messages[0].timestamp).toBe('2026-02-01T10:00:00Z');
    });

    it('should parse multiple messages', () => {
      const output = 'MSG|||1|||/claude task one|||2026-02-01T10:00:00Z\nMSG|||2|||/status|||2026-02-01T10:01:00Z';
      const messages = parseAppleScriptOutput(output);

      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('/claude task one');
      expect(messages[1].text).toBe('/status');
    });

    it('should return empty array for no output', () => {
      expect(parseAppleScriptOutput('')).toEqual([]);
      expect(parseAppleScriptOutput(null)).toEqual([]);
    });

    it('should skip malformed lines', () => {
      const output = 'MSG|||1|||/claude test|||2026-02-01T10:00:00Z\nbad line\nMSG|||2|||/help|||2026-02-01T10:01:00Z';
      const messages = parseAppleScriptOutput(output);

      expect(messages).toHaveLength(2);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/imessage-reader.test.js`
Expected: FAIL with "Cannot find module '../lib/imessage-reader.js'"

### Step 3: Write minimal implementation

```javascript
// lib/imessage-reader.js
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Message delimiter for AppleScript output parsing
const MSG_DELIMITER = '|||';
const MSG_PREFIX = 'MSG';

/**
 * Build AppleScript to read recent messages from a phone number
 * @param {string} phoneNumber - Phone number to read messages from (e.g., '+12069090025')
 * @param {number} limit - Maximum number of messages to retrieve
 * @returns {string} AppleScript code
 */
export function buildReadScript(phoneNumber, limit = 10) {
  // AppleScript to get messages from a specific sender
  // Messages.app stores chats with participants, we need to find the chat with this phone
  return `
tell application "Messages"
  set targetPhone to "${phoneNumber}"
  set msgList to {}

  -- Find chat with this participant
  repeat with aChat in chats
    try
      set participants to participants of aChat
      repeat with p in participants
        set pHandle to handle of p
        if pHandle contains targetPhone or targetPhone contains pHandle then
          -- Found the chat, get recent messages
          set chatMessages to messages of aChat
          set msgCount to count of chatMessages
          set startIdx to 1
          if msgCount > ${limit} then
            set startIdx to msgCount - ${limit} + 1
          end if

          repeat with i from startIdx to msgCount
            set msg to item i of chatMessages
            try
              set msgId to id of msg
              set msgText to text of msg as text
              set msgDate to date received of msg
              -- Format: MSG|||id|||text|||timestamp
              set end of msgList to "MSG${MSG_DELIMITER}" & msgId & "${MSG_DELIMITER}" & msgText & "${MSG_DELIMITER}" & (msgDate as string)
            end try
          end repeat

          -- Return results
          set AppleScript's text item delimiters to linefeed
          return msgList as text
        end if
      end repeat
    end try
  end repeat

  return ""
end tell
`;
}

/**
 * Parse AppleScript output into message objects
 * @param {string} output - Raw AppleScript output
 * @returns {Array<{id: string, text: string, timestamp: string}>} Parsed messages
 */
export function parseAppleScriptOutput(output) {
  if (!output || typeof output !== 'string') {
    return [];
  }

  const messages = [];
  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line.startsWith(MSG_PREFIX + MSG_DELIMITER)) {
      continue;
    }

    const parts = line.split(MSG_DELIMITER);
    if (parts.length >= 4) {
      messages.push({
        id: parts[1],
        text: parts[2],
        timestamp: parts[3]
      });
    }
  }

  return messages;
}

/**
 * Get recent messages from a phone number via AppleScript
 * @param {string} phoneNumber - Phone number to read from
 * @param {number} limit - Maximum messages to retrieve
 * @returns {Promise<Array<{id: string, text: string, timestamp: string}>>}
 */
export async function getRecentMessages(phoneNumber, limit = 10) {
  const script = buildReadScript(phoneNumber, limit);

  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 10000 // 10 second timeout
    });
    return parseAppleScriptOutput(stdout);
  } catch (err) {
    console.error('[iMessage Reader] AppleScript error:', err.message);
    return [];
  }
}

/**
 * Get recent messages synchronously (for testing)
 * @param {string} phoneNumber - Phone number to read from
 * @param {number} limit - Maximum messages to retrieve
 * @returns {Array<{id: string, text: string, timestamp: string}>}
 */
export function getRecentMessagesSync(phoneNumber, limit = 10) {
  const script = buildReadScript(phoneNumber, limit);

  try {
    const stdout = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 10000,
      encoding: 'utf-8'
    });
    return parseAppleScriptOutput(stdout);
  } catch (err) {
    console.error('[iMessage Reader] AppleScript error:', err.message);
    return [];
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- tests/imessage-reader.test.js`
Expected: PASS (all 5 tests)

### Step 5: Commit

```bash
git add lib/imessage-reader.js tests/imessage-reader.test.js
git commit -m "feat(imessage): add message reader module with AppleScript"
```

---

## Task 2: AppleScript Message Sender Module

**Files:**
- Create: `lib/imessage-sender.js`
- Create: `tests/imessage-sender.test.js`

### Step 1: Write the failing test

```javascript
// tests/imessage-sender.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSendScript, formatMessageForAppleScript } from '../lib/imessage-sender.js';

describe('iMessage Sender', () => {
  describe('formatMessageForAppleScript', () => {
    it('should escape double quotes', () => {
      const result = formatMessageForAppleScript('Hello "world"');
      expect(result).toBe('Hello \\"world\\"');
    });

    it('should escape backslashes', () => {
      const result = formatMessageForAppleScript('Path: C:\\Users');
      expect(result).toBe('Path: C:\\\\Users');
    });

    it('should handle newlines', () => {
      const result = formatMessageForAppleScript('Line 1\nLine 2');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    it('should handle empty string', () => {
      expect(formatMessageForAppleScript('')).toBe('');
    });
  });

  describe('buildSendScript', () => {
    it('should build AppleScript to send iMessage', () => {
      const script = buildSendScript('+12069090025', 'Hello from Brokkr');

      expect(script).toContain('tell application "Messages"');
      expect(script).toContain('+12069090025');
      expect(script).toContain('Hello from Brokkr');
      expect(script).toContain('send');
    });

    it('should escape special characters in message', () => {
      const script = buildSendScript('+12069090025', 'Quote: "test"');
      expect(script).toContain('\\"test\\"');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/imessage-sender.test.js`
Expected: FAIL with "Cannot find module '../lib/imessage-sender.js'"

### Step 3: Write minimal implementation

```javascript
// lib/imessage-sender.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Maximum message length for iMessage (similar to SMS limits for reliability)
const MAX_MESSAGE_LENGTH = 4000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Escape special characters for AppleScript string
 * @param {string} message - Raw message text
 * @returns {string} Escaped message
 */
export function formatMessageForAppleScript(message) {
  if (!message) return '';

  return message
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\r\n/g, '\n')   // Normalize line endings
    .replace(/\r/g, '\n');    // Normalize line endings
}

/**
 * Build AppleScript to send an iMessage
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 * @returns {string} AppleScript code
 */
export function buildSendScript(phoneNumber, message) {
  const escapedMessage = formatMessageForAppleScript(message);

  return `
tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${phoneNumber}" of targetService
  send "${escapedMessage}" to targetBuddy
end tell
`;
}

/**
 * Send an iMessage to a phone number
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 * @param {number} retries - Current retry count
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendMessage(phoneNumber, message, retries = 0) {
  // Chunk long messages
  const chunks = [];
  for (let i = 0; i < message.length; i += MAX_MESSAGE_LENGTH) {
    chunks.push(message.slice(i, i + MAX_MESSAGE_LENGTH));
  }

  for (const chunk of chunks) {
    const script = buildSendScript(phoneNumber, chunk);

    try {
      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
        timeout: 30000 // 30 second timeout per message
      });
    } catch (err) {
      console.error(`[iMessage Sender] Send attempt ${retries + 1} failed:`, err.message);

      if (retries < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return sendMessage(phoneNumber, message, retries + 1);
      }

      return {
        success: false,
        error: `Failed to send after ${MAX_RETRIES} retries: ${err.message}`
      };
    }
  }

  return { success: true };
}

/**
 * Send an iMessage with dry-run prefix if enabled
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 * @param {boolean} dryRun - If true, prefix message with [DRY-RUN]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function safeSendMessage(phoneNumber, message, dryRun = false) {
  const finalMessage = dryRun ? `[DRY-RUN] ${message}` : message;
  return sendMessage(phoneNumber, finalMessage);
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- tests/imessage-sender.test.js`
Expected: PASS (all 5 tests)

### Step 5: Commit

```bash
git add lib/imessage-sender.js tests/imessage-sender.test.js
git commit -m "feat(imessage): add message sender module with AppleScript"
```

---

## Task 3: iMessage Bot Main Process

**Files:**
- Create: `imessage-bot.js`

### Step 1: Create the main bot file

```javascript
// imessage-bot.js
// iMessage bot with queue/worker integration for Brokkr
// Polls Messages.app for commands from Tommy's phone

import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

// Import library modules
import { parseMessage, getHelpText } from './lib/message-parser.js';
import { enqueue, PRIORITY, getQueueDepth } from './lib/queue.js';
import { createSession, getSessionByCode, listSessions, expireSessions } from './lib/sessions.js';
import { processNextJob, setSendMessageCallback, setDryRunMode, isProcessing, getCurrentSessionCode, cancelJob } from './lib/worker.js';
import { startupCleanup } from './lib/resources.js';
import { getBusyMessage, getStatusMessage } from './lib/busy-handler.js';
import { getRecentMessages } from './lib/imessage-reader.js';
import { safeSendMessage } from './lib/imessage-sender.js';

// Configuration
const WORKSPACE = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const LOCK_FILE = join(WORKSPACE, 'imessage-bot.lock');

// Tommy's phone number (only sender to monitor)
const TOMMY_PHONE = '+12069090025';

// Timing constants
const POLLING_INTERVAL_MS = 2000;
const SESSION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const QUEUE_PROCESS_INTERVAL_MS = 1000;
const STARTUP_MESSAGE_DELAY_MS = 3000;

// Track processed message IDs to avoid duplicates
const processedMessageIds = new Set();
const MAX_PROCESSED_IDS = 100;
let lastKnownMessageId = null;

// ============================================
// Lock file management (single instance)
// ============================================

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      try {
        process.kill(lockData.pid, 0);
        console.error(`iMessage bot already running (PID: ${lockData.pid})`);
        return false;
      } catch {
        console.log(`Removing stale lock file (PID ${lockData.pid} not running)`);
        unlinkSync(LOCK_FILE);
      }
    } catch {
      console.log('Removing invalid lock file');
      try { unlinkSync(LOCK_FILE); } catch {}
    }
  }

  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString()
  };
  writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
  console.log(`Lock acquired (PID: ${process.pid})`);
  return true;
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      if (lockData.pid === process.pid) {
        unlinkSync(LOCK_FILE);
        console.log('Lock released');
      }
    }
  } catch {}
}

// ============================================
// Message sending callback for worker
// ============================================

async function sendMessageCallback(chatId, message) {
  // chatId for iMessage is the phone number
  // But we always send to Tommy
  const result = await safeSendMessage(TOMMY_PHONE, message, DRY_RUN);
  if (!result.success) {
    console.error('[iMessage] Failed to send message:', result.error);
  }
}

// Register with worker
setSendMessageCallback(sendMessageCallback);
if (DRY_RUN) {
  setDryRunMode(true);
}

// ============================================
// Message Polling
// ============================================

let pollCount = 0;

async function pollForMessages() {
  pollCount++;

  try {
    const messages = await getRecentMessages(TOMMY_PHONE, 10);

    if (DEBUG && pollCount % 10 === 0) {
      console.log(`[Poll #${pollCount}] Retrieved ${messages.length} messages`);
    }

    // First poll: mark all existing messages as seen
    if (!lastKnownMessageId && messages.length > 0) {
      lastKnownMessageId = messages[messages.length - 1].id;
      for (const msg of messages) {
        processedMessageIds.add(msg.id);
      }
      if (DEBUG) {
        console.log(`[Poll #${pollCount}] Initial poll - marked ${messages.length} messages as seen`);
      }
      return;
    }

    // Process new messages (oldest first)
    for (const msg of messages) {
      if (processedMessageIds.has(msg.id)) {
        continue;
      }

      // Mark as processed immediately
      processedMessageIds.add(msg.id);
      lastKnownMessageId = msg.id;

      const text = (msg.text || '').trim();

      // Skip empty messages
      if (!text) continue;

      // Skip bot responses (messages we sent)
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
        continue;
      }

      // Skip help text output
      if (text.includes('/claude <task>') && text.includes('/help')) {
        continue;
      }

      // Only process commands (starting with /)
      if (!text.startsWith('/')) {
        continue;
      }

      console.log(`\n[${new Date().toISOString()}] Received: "${text}"`);
      await handleCommand(text);
    }

    // Clean up old processed IDs
    if (processedMessageIds.size > MAX_PROCESSED_IDS) {
      const idsArray = Array.from(processedMessageIds);
      const toRemove = idsArray.slice(0, idsArray.length - MAX_PROCESSED_IDS);
      toRemove.forEach(id => processedMessageIds.delete(id));
    }

  } catch (err) {
    console.error('[iMessage] Polling error:', err.message);
  }
}

// ============================================
// Command Handling
// ============================================

async function handleCommand(text) {
  const parsed = parseMessage(text);
  console.log(`Parsed type: ${parsed.type}`);

  switch (parsed.type) {
    case 'not_command':
      return;

    case 'unknown_command':
      await sendMessageCallback(TOMMY_PHONE, `Unknown command: /${parsed.commandName}\n\nUse /help to see available commands.`);
      return;

    case 'session_resume':
      await handleSessionResume(parsed);
      return;

    case 'command':
      await handleParsedCommand(parsed);
      return;

    default:
      console.log(`Unknown parsed type: ${parsed.type}`);
  }
}

async function handleSessionResume(parsed) {
  const { sessionCode, message } = parsed;

  // Check for -cancel flag
  if (message && (message.trim() === '-cancel' || message.trim().startsWith('-cancel '))) {
    await handleCancelJob(sessionCode);
    return;
  }

  const session = getSessionByCode(sessionCode);

  if (!session) {
    await sendMessageCallback(TOMMY_PHONE, `Session not found: /${sessionCode}\n\nUse /sessions to see active sessions.`);
    return;
  }

  const task = message || 'continue';
  const queuePos = getQueueDepth() + 1;

  enqueue({
    task,
    chatId: TOMMY_PHONE,
    source: 'imessage',
    sessionCode: session.code,
    priority: PRIORITY.CRITICAL
  });

  if (isProcessing()) {
    const currentCode = getCurrentSessionCode();
    if (currentCode !== sessionCode) {
      await sendMessageCallback(TOMMY_PHONE, `${getBusyMessage(queuePos)}\nSession: /${sessionCode}`);
    } else {
      await sendMessageCallback(TOMMY_PHONE, `Queued follow-up for session /${sessionCode}`);
    }
  } else {
    await sendMessageCallback(TOMMY_PHONE, `Resuming session /${sessionCode}...`);
  }
}

async function handleCancelJob(sessionCode) {
  const result = cancelJob(sessionCode);

  if (result.success) {
    await sendMessageCallback(TOMMY_PHONE, `Cancelled /${sessionCode}: ${result.message}`);
  } else {
    await sendMessageCallback(TOMMY_PHONE, result.message);
  }
}

async function handleParsedCommand(parsed) {
  const { handler, commandName, argString } = parsed;

  // Handle internal commands immediately
  if (handler.type === 'internal') {
    if (handler.function === 'handleHelp') {
      const helpArg = argString?.trim();
      await sendMessageCallback(TOMMY_PHONE, getHelpText(helpArg || undefined));
    } else if (handler.function === 'handleStatus') {
      await sendMessageCallback(TOMMY_PHONE, getStatusMessage());
    } else if (handler.function === 'handleSessions') {
      // Show all sessions (not filtered by type)
      const sessions = listSessions();
      if (sessions.length === 0) {
        await sendMessageCallback(TOMMY_PHONE, 'No active sessions.\n\nUse /claude <task> to start a new task.');
      } else {
        let response = 'Active Sessions:\n\n';
        for (const session of sessions) {
          const age = getSessionAge(session.createdAt);
          const typeIcon = session.type === 'imessage' ? 'iM' : session.type === 'whatsapp' ? 'WA' : 'WH';
          response += `/${session.code} [${typeIcon}] - ${session.task.slice(0, 40)}${session.task.length > 40 ? '...' : ''}\n`;
          response += `  Created: ${age} ago\n\n`;
        }
        response += 'Resume with: /<code> [message]';
        await sendMessageCallback(TOMMY_PHONE, response);
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
      await sendMessageCallback(TOMMY_PHONE, `Please provide a task. Example: /${commandName} <your task here>`);
      return;
    }

    // Create session with iMessage type
    const session = createSession({
      type: 'imessage',
      task,
      chatId: TOMMY_PHONE
    });

    const queuePos = getQueueDepth() + 1;

    enqueue({
      task,
      chatId: TOMMY_PHONE,
      source: 'imessage',
      sessionCode: session.code,
      priority: PRIORITY.CRITICAL
    });

    if (isProcessing()) {
      await sendMessageCallback(TOMMY_PHONE, `${getBusyMessage(queuePos)}\nSession: /${session.code}`);
    } else {
      await sendMessageCallback(TOMMY_PHONE, `Starting... Session: /${session.code}`);
    }

    return;
  }

  console.log(`Unhandled command type: ${handler.type}`);
  await sendMessageCallback(TOMMY_PHONE, `Command /${commandName} is not yet supported.`);
}

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

async function processQueue() {
  if (!isProcessing()) {
    await processNextJob();
  }
}

// ============================================
// Startup
// ============================================

let pollingInterval = null;
let queueInterval = null;
let sessionExpiryInterval = null;

async function startBot() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\n[iMessage Bot] Mode: ${mode}`);
  console.log(`[iMessage Bot] Monitoring: ${TOMMY_PHONE}`);
  console.log('[iMessage Bot] Starting message polling...');
  console.log('[iMessage Bot] Commands: /claude, /help, /status, /sessions, /research, /github, /x, /youtube, /email, /schedule\n');

  // Start polling
  pollingInterval = setInterval(pollForMessages, POLLING_INTERVAL_MS);

  // Start queue processing
  queueInterval = setInterval(processQueue, QUEUE_PROCESS_INTERVAL_MS);

  // Start session expiry
  sessionExpiryInterval = setInterval(() => {
    const expired = expireSessions(SESSION_MAX_AGE_MS);
    if (expired > 0) {
      console.log(`[Session cleanup] Expired ${expired} old sessions`);
    }
  }, SESSION_EXPIRY_INTERVAL_MS);

  // Send startup message after delay
  setTimeout(async () => {
    const msg = DRY_RUN
      ? 'iMessage bot online [DRY-RUN MODE]\nCommands will be parsed but not executed.'
      : 'iMessage bot online! Use /help for commands.';
    await sendMessageCallback(TOMMY_PHONE, msg);
    console.log('[iMessage Bot] Sent startup message');
  }, STARTUP_MESSAGE_DELAY_MS);
}

// ============================================
// Shutdown
// ============================================

function cleanup() {
  console.log('\nShutting down iMessage bot...');

  if (pollingInterval) clearInterval(pollingInterval);
  if (queueInterval) clearInterval(queueInterval);
  if (sessionExpiryInterval) clearInterval(sessionExpiryInterval);

  releaseLock();
}

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  releaseLock();
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup();
  process.exit(1);
});

// ============================================
// Main
// ============================================

console.log('[iMessage Bot] Starting...');
if (DRY_RUN) {
  console.log('*** DRY-RUN MODE ENABLED ***\n');
} else {
  console.log('*** LIVE MODE ***\n');
}

if (!acquireLock()) {
  console.error('Exiting: another iMessage bot instance is already running');
  process.exit(1);
}

// Run startup cleanup (shared with WhatsApp bot)
const cleanupResult = startupCleanup();
if (cleanupResult.orphanedJobs > 0) {
  console.log(`Startup cleanup: recovered ${cleanupResult.orphanedJobs} orphaned jobs`);
}

// Start the bot
startBot();
```

### Step 2: Verify syntax

Run: `node --check imessage-bot.js`
Expected: No output (syntax is valid)

### Step 3: Commit

```bash
git add imessage-bot.js
git commit -m "feat(imessage): add main bot process"
```

---

## Task 4: Update Sessions for iMessage Type

**Files:**
- Modify: `lib/sessions.js:91-97`

### Step 1: Update createSession function

Find this section in `lib/sessions.js`:

```javascript
export function createSession({ type, task, chatId, source, sessionId }, customCode = null) {
  loadSessions();

  // WhatsApp sessions get 2-char codes, webhook sessions get 3-char codes
  const codeLength = type === 'whatsapp' ? 2 : 3;
```

Replace with:

```javascript
export function createSession({ type, task, chatId, source, sessionId }, customCode = null) {
  loadSessions();

  // WhatsApp and iMessage sessions get 2-char codes (CRITICAL priority)
  // Webhook sessions get 3-char codes (HIGH priority)
  const codeLength = (type === 'whatsapp' || type === 'imessage') ? 2 : 3;
```

### Step 2: Run existing tests to verify nothing broke

Run: `npm test -- tests/sessions.test.js`
Expected: PASS (all existing tests still pass)

### Step 3: Commit

```bash
git add lib/sessions.js
git commit -m "feat(sessions): add iMessage type support with 2-char codes"
```

---

## Task 5: PM2 Configuration Update

**Files:**
- Create: `ecosystem.config.cjs`

### Step 1: Create PM2 ecosystem config

```javascript
// ecosystem.config.cjs
// PM2 configuration for Brokkr bot services

module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'whatsapp-bot.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/tmp/whatsapp-bot.log',
      out_file: '/tmp/whatsapp-bot.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'webhook-server',
      script: 'lib/webhook-server.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/tmp/webhook-server.log',
      out_file: '/tmp/webhook-server.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'imessage-bot',
      script: 'imessage-bot.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/tmp/imessage-bot.log',
      out_file: '/tmp/imessage-bot.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

### Step 2: Commit

```bash
git add ecosystem.config.cjs
git commit -m "feat(pm2): add ecosystem config with iMessage bot"
```

---

## Task 6: Bot Control Script Update

**Files:**
- Modify: `scripts/bot-control.sh`

### Step 1: Read current bot-control.sh

First, read the existing file to understand its structure, then update it to include iMessage bot management.

Add the following to the script where appropriate:

1. In the `stop_all_processes` function, add:
```bash
# Kill iMessage bot
pkill -f "imessage-bot" 2>/dev/null && echo "Killed iMessage bot process"
rm -f "$WORKSPACE/imessage-bot.lock" 2>/dev/null
```

2. In the `status` command, add:
```bash
# Check iMessage bot
if pgrep -f "imessage-bot" > /dev/null; then
    echo "iMessage bot: RUNNING"
else
    echo "iMessage bot: STOPPED"
fi
```

3. In the `logs` and `tail` commands, add iMessage log file:
```bash
/tmp/imessage-bot.log
```

### Step 2: Commit

```bash
git add scripts/bot-control.sh
git commit -m "feat(bot-control): add iMessage bot management"
```

---

## Task 7: Skill Documentation

**Files:**
- Create: `skills/imessage/skill.md`

### Step 1: Create skill directory and documentation

```bash
mkdir -p skills/imessage
```

```markdown
# iMessage Skill

## Overview

iMessage integration for the Brokkr agent system. Allows Tommy to send commands via Messages.app with the same syntax as WhatsApp.

## Configuration

**Tommy's Phone:** +1 206-909-0025 (hardcoded - only sender monitored)

**Bot Process:** `imessage-bot.js`

**Log File:** `/tmp/imessage-bot.log`

**Lock File:** `/Users/brokkrbot/brokkr-agent/imessage-bot.lock`

## Commands

Same commands as WhatsApp:

| Command | Description |
|---------|-------------|
| `/claude <task>` | New task (CRITICAL priority) |
| `/<xx>` | Resume session |
| `/<xx> <msg>` | Continue session with message |
| `/<xx> -cancel` | Cancel pending/active job |
| `/sessions` | List all active sessions (shows channel type) |
| `/status` | Bot status |
| `/help` | Show commands |

## Session Types

Sessions show their originating channel:
- `[iM]` - iMessage
- `[WA]` - WhatsApp
- `[WH]` - Webhook

Any channel can resume any session (shared session pool).

## Architecture

```
Messages.app
    │
    │ AppleScript polling (every 2s)
    ▼
imessage-bot.js
    │
    ├─► lib/imessage-reader.js (read messages)
    ├─► lib/imessage-sender.js (send responses)
    ├─► lib/message-parser.js (parse commands)
    ├─► lib/queue.js (job queue)
    ├─► lib/sessions.js (shared sessions)
    └─► lib/worker.js (Claude execution)
```

## AppleScript Details

### Reading Messages

Uses `osascript` to query Messages.app for recent messages from Tommy's phone handle. Messages are returned with ID, text, and timestamp.

### Sending Messages

Uses `osascript` to send via the iMessage service to Tommy's phone number.

### Permissions Required

- **Accessibility**: Terminal must have accessibility access
- **Automation**: Terminal must be allowed to control Messages.app

Verify with:
```bash
osascript -e 'tell application "Messages" to get name'
```

## Starting/Stopping

### Via PM2 (Recommended)

```bash
# Start all bots
./scripts/bot-control.sh start

# Stop all bots
./scripts/bot-control.sh stop

# Restart all bots
./scripts/bot-control.sh restart

# Status
./scripts/bot-control.sh status
```

### Manual (for debugging)

```bash
# Live mode
node imessage-bot.js

# Dry-run mode
node imessage-bot.js --dry-run

# With debug output
node imessage-bot.js --debug
```

## Troubleshooting

### Bot not receiving messages

1. Check Messages.app is running
2. Verify AppleScript permissions: `osascript -e 'tell application "Messages" to get name'`
3. Check log file: `tail -f /tmp/imessage-bot.log`
4. Verify Tommy's phone number is correct

### Bot not sending messages

1. Check iMessage service is active in Messages.app
2. Verify you can send messages manually to Tommy
3. Check AppleScript: `osascript -e 'tell application "Messages" to get accounts'`

### Multiple instances

Only one iMessage bot can run at a time (lock file prevents duplicates):
```bash
rm /Users/brokkrbot/brokkr-agent/imessage-bot.lock
```

## No Anti-Loop Needed

Tommy (tommyjohnson90@gmail.com) and Brokkr (brokkrassist@icloud.com) use separate iCloud accounts. Messages.app naturally separates incoming vs outgoing messages, so no anti-loop detection is needed.
```

### Step 2: Commit

```bash
git add skills/imessage/skill.md
git commit -m "docs(imessage): add skill documentation"
```

---

## Task 8: Integration Testing

**Files:**
- Create: `scripts/test-imessage.js`

### Step 1: Create test script

```javascript
#!/usr/bin/env node
// scripts/test-imessage.js
// Manual integration test for iMessage modules

import { buildReadScript, parseAppleScriptOutput, getRecentMessagesSync } from '../lib/imessage-reader.js';
import { buildSendScript, formatMessageForAppleScript } from '../lib/imessage-sender.js';

const TOMMY_PHONE = '+12069090025';

console.log('=== iMessage Integration Test ===\n');

// Test 1: Build read script
console.log('--- Test 1: Build Read Script ---');
const readScript = buildReadScript(TOMMY_PHONE, 5);
console.log('Generated AppleScript (first 200 chars):');
console.log(readScript.slice(0, 200) + '...\n');

// Test 2: Parse sample output
console.log('--- Test 2: Parse AppleScript Output ---');
const sampleOutput = 'MSG|||12345|||/status|||2026-02-01T10:00:00Z\nMSG|||12346|||/claude hello|||2026-02-01T10:01:00Z';
const parsed = parseAppleScriptOutput(sampleOutput);
console.log('Parsed messages:', JSON.stringify(parsed, null, 2), '\n');

// Test 3: Format message for AppleScript
console.log('--- Test 3: Format Message ---');
const testMessage = 'Hello "world"! Path: C:\\test\nLine 2';
const formatted = formatMessageForAppleScript(testMessage);
console.log('Original:', testMessage);
console.log('Formatted:', formatted, '\n');

// Test 4: Build send script
console.log('--- Test 4: Build Send Script ---');
const sendScript = buildSendScript(TOMMY_PHONE, 'Test message from Brokkr');
console.log('Generated AppleScript:');
console.log(sendScript, '\n');

// Test 5: Live read test (optional)
if (process.argv.includes('--live')) {
  console.log('--- Test 5: Live Read Test ---');
  console.log(`Attempting to read messages from ${TOMMY_PHONE}...`);
  try {
    const messages = getRecentMessagesSync(TOMMY_PHONE, 5);
    if (messages.length > 0) {
      console.log(`Found ${messages.length} messages:`);
      messages.forEach((m, i) => {
        console.log(`  ${i + 1}. [${m.id}] ${m.text.slice(0, 50)}${m.text.length > 50 ? '...' : ''}`);
      });
    } else {
      console.log('No messages found (check if Messages.app has conversation with this number)');
    }
  } catch (err) {
    console.log('Error:', err.message);
    console.log('(This is expected if AppleScript permissions are not configured)');
  }
} else {
  console.log('--- Test 5: Live Read Test ---');
  console.log('Skipped (run with --live to test actual Messages.app access)\n');
}

console.log('=== All Tests Complete ===');
```

### Step 2: Make executable

```bash
chmod +x scripts/test-imessage.js
```

### Step 3: Run test

```bash
node scripts/test-imessage.js
```

### Step 4: Commit

```bash
git add scripts/test-imessage.js
git commit -m "test(imessage): add integration test script"
```

---

## Task 9: CLAUDE.md Documentation Update

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update CLAUDE.md

Add after the "WhatsApp Commands" section:

```markdown
## iMessage Commands

Same command syntax as WhatsApp, sent from Tommy's phone (+1 206-909-0025):

| Command | Description |
|---------|-------------|
| `/claude <task>` | New task |
| `/<xx>` | Resume session |
| `/<xx> <msg>` | Continue session |
| `/<xx> -cancel` | Cancel pending/active job |
| `/sessions` | List sessions (all channels) |
| `/status` | Bot status |
| `/help` | Show commands |

**Bot Process:** `imessage-bot.js`
**Log File:** `/tmp/imessage-bot.log`

Sessions are shared across WhatsApp, iMessage, and webhooks. Start a task on iMessage, continue it from WhatsApp.
```

Update the "Files" section to include:
```markdown
- `imessage-bot.js` - iMessage entry point
- `lib/imessage-reader.js` - Read messages via AppleScript
- `lib/imessage-sender.js` - Send messages via AppleScript
```

Update the "Planned Capabilities" section to mark iMessage as complete:
```markdown
### Completed Capabilities
- **iMessage**: Commands + responses to Tommy via Messages.app
```

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: add iMessage integration to CLAUDE.md"
```

---

## Task 10: Final Integration Test

### Step 1: Run all unit tests

```bash
npm test
```

Expected: All tests pass

### Step 2: Syntax check all new files

```bash
node --check imessage-bot.js
node --check lib/imessage-reader.js
node --check lib/imessage-sender.js
```

Expected: No errors

### Step 3: Run integration test script

```bash
node scripts/test-imessage.js
```

Expected: All tests complete

### Step 4: Test with dry-run mode

```bash
node imessage-bot.js --dry-run --debug
```

Expected: Bot starts, polls messages, responds in dry-run mode

### Step 5: Final commit

```bash
git add -A
git commit -m "feat(imessage): complete iMessage integration implementation"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `lib/imessage-reader.js`, `tests/imessage-reader.test.js` | AppleScript message reading |
| 2 | `lib/imessage-sender.js`, `tests/imessage-sender.test.js` | AppleScript message sending |
| 3 | `imessage-bot.js` | Main bot process |
| 4 | `lib/sessions.js` | iMessage type support |
| 5 | `ecosystem.config.cjs` | PM2 configuration |
| 6 | `scripts/bot-control.sh` | Control script update |
| 7 | `skills/imessage/skill.md` | Skill documentation |
| 8 | `scripts/test-imessage.js` | Integration test script |
| 9 | `CLAUDE.md` | Documentation update |
| 10 | - | Final testing |

## Post-Implementation Notes

### RAM Usage

The iMessage bot is lightweight (~50-100MB) since it just polls AppleScript and dispatches to the shared worker. Total system with all three processes:
- WhatsApp bot: ~200-300MB (Chrome/Puppeteer)
- Webhook server: ~50MB
- iMessage bot: ~50-100MB

Total: ~300-450MB, well under the 8GB limit.

### Polling Efficiency

AppleScript polling every 2 seconds is efficient because:
1. Messages.app is always running (for other integrations)
2. AppleScript queries are fast (<100ms)
3. No external network calls involved

### Future Enhancements

1. **Urgent Notifications**: Brokkr can proactively send iMessages for urgent items
2. **Rich Media**: Handle image attachments in messages
3. **Group Messages**: Support commands from a Brokkr group chat
