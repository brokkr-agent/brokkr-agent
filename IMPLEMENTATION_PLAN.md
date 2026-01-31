# Brokkr Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Brokkr from a simple WhatsApp-Claude bridge into a self-improving, resilient autonomous agent that runs 24/7, never loses tasks, and continuously optimizes itself.

**Architecture:** Job queue with parallel workers processes incoming WhatsApp messages. Automatic skill creation captures reusable patterns. Twice-daily self-maintenance cron jobs audit and optimize the setup using Claude's own skills.

**Tech Stack:** Node.js, whatsapp-web.js, file-based job queue, cron, Claude Code CLI with skills

---

## Available Skills Reference

Use these skills when executing tasks:

| Skill | When to Use |
|-------|-------------|
| `superpowers:test-driven-development` | Writing any new code module - write tests first |
| `superpowers:systematic-debugging` | When tests fail or unexpected behavior occurs |
| `superpowers:writing-skills` | Creating new SKILL.md files |
| `superpowers:verification-before-completion` | Before marking any task complete |
| `superpowers:requesting-code-review` | After completing each phase |
| `superpowers:dispatching-parallel-agents` | When tasks can run independently |
| `superpowers:using-git-worktrees` | For isolated feature development |
| `superpowers:finishing-a-development-branch` | When ready to merge completed work |
| `claude-md-management:revise-claude-md` | Updating CLAUDE.md with learnings |
| `claude-md-management:claude-md-improver` | Auditing CLAUDE.md quality |
| `claude-code-setup:claude-automation-recommender` | Evaluating/optimizing automations |
| `agent-sdk-dev:new-sdk-app` | Creating reusable agent scripts for automation |
| `agent-sdk-dev:agent-sdk-verifier-ts` | Verify TypeScript/JS agent apps are properly configured |

---

## Design Principles

1. **Simplicity over complexity** - Prefer file-based state over databases, flat structures over nested
2. **Fail gracefully, recover automatically** - Every error should lead to retry or graceful degradation
3. **Self-documenting** - Logs, skills, and workspace should be human-readable
4. **Always use skills** - Never do manually what a skill can do better

---

## Phase 1: Core Resilience

### Goal
Make the bot bulletproof: never lose tasks, always recoverable, observable health.

---

### Task 1.1: Job Queue System

**Required Skills:**
- `superpowers:test-driven-development` - Write tests before implementation
- `superpowers:verification-before-completion` - Verify module works before committing

**Files:**
- Create: `lib/queue.js`
- Create: `jobs/` directory
- Modify: `whatsapp-bot.js`

**Purpose:** Persist incoming tasks to disk immediately. Process from queue. Never lose a message.

**Step 1: Create queue module**

```javascript
// lib/queue.js
import { writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const JOBS_DIR = join(process.cwd(), 'jobs');
const ACTIVE_DIR = join(JOBS_DIR, 'active');
const COMPLETED_DIR = join(JOBS_DIR, 'completed');
const FAILED_DIR = join(JOBS_DIR, 'failed');

// Ensure directories exist
[JOBS_DIR, ACTIVE_DIR, COMPLETED_DIR, FAILED_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

export function enqueue(job) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobFile = join(JOBS_DIR, `${id}.json`);
  writeFileSync(jobFile, JSON.stringify({ id, ...job, status: 'pending', createdAt: new Date().toISOString() }, null, 2));
  return id;
}

export function getPendingJobs() {
  return readdirSync(JOBS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8')))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markActive(id) {
  const src = join(JOBS_DIR, `${id}.json`);
  const dest = join(ACTIVE_DIR, `${id}.json`);
  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'active';
    job.startedAt = new Date().toISOString();
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
  }
}

export function markCompleted(id, result) {
  const src = join(ACTIVE_DIR, `${id}.json`);
  const dest = join(COMPLETED_DIR, `${id}.json`);
  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = result;
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
  }
}

export function markFailed(id, error) {
  const src = join(ACTIVE_DIR, `${id}.json`);
  const dest = join(FAILED_DIR, `${id}.json`);
  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'failed';
    job.failedAt = new Date().toISOString();
    job.error = error;
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
  }
}

export function getActiveCount() {
  return readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json')).length;
}

export function recoverStaleJobs(maxAgeMs = 30 * 60 * 1000) {
  // Move jobs stuck in active for too long back to pending
  const now = Date.now();
  readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json')).forEach(f => {
    const job = JSON.parse(readFileSync(join(ACTIVE_DIR, f), 'utf-8'));
    if (now - new Date(job.startedAt).getTime() > maxAgeMs) {
      job.status = 'pending';
      job.retryCount = (job.retryCount || 0) + 1;
      writeFileSync(join(JOBS_DIR, f), JSON.stringify(job, null, 2));
      unlinkSync(join(ACTIVE_DIR, f));
    }
  });
}
```

**Step 2: Run to verify module loads**

Run: `node -e "import('./lib/queue.js').then(q => console.log('Queue module OK'))"`
Expected: "Queue module OK"

**Step 3: Commit**

```bash
git add lib/queue.js
git commit -m "feat: add file-based job queue system"
```

---

### Task 1.2: Parallel Worker System

**Required Skills:**
- `superpowers:test-driven-development` - Write tests before implementation
- `superpowers:verification-before-completion` - Verify workers spawn correctly

**Files:**
- Create: `lib/worker.js`
- Modify: `whatsapp-bot.js`

**Purpose:** Run up to N Claude tasks simultaneously. Each worker is independent.

**Step 1: Create worker module**

```javascript
// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getPendingJobs, getActiveCount, recoverStaleJobs } from './queue.js';

const MAX_WORKERS = 3;
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per task
const WORKSPACE = process.cwd();

let sendMessageCallback = null;

export function setSendMessageCallback(fn) {
  sendMessageCallback = fn;
}

async function sendResult(chatId, message) {
  if (sendMessageCallback) {
    try {
      await sendMessageCallback(chatId, message);
    } catch (err) {
      console.error('[Worker] Failed to send result:', err.message);
    }
  }
}

function runTask(job) {
  return new Promise((resolve) => {
    markActive(job.id);
    console.log(`[Worker] Starting job ${job.id}: ${job.task.slice(0, 50)}...`);

    const child = spawn('claude', ['-p', job.task, '--dangerously-skip-permissions', '--chrome'], {
      cwd: WORKSPACE,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', async (code) => {
      clearTimeout(timeout);
      const result = (stdout || stderr || 'Done (no output)').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

      if (killed) {
        markFailed(job.id, 'Task timed out after 10 minutes');
        await sendResult(job.chatId, `Task timed out: ${job.task.slice(0, 50)}...`);
      } else if (code !== 0) {
        markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
        await sendResult(job.chatId, result);
      } else {
        markCompleted(job.id, result.slice(0, 10000));
        await sendResult(job.chatId, result);
      }

      console.log(`[Worker] Finished job ${job.id} (code: ${code})`);
      resolve();
    });

    child.on('error', async (err) => {
      clearTimeout(timeout);
      markFailed(job.id, err.message);
      await sendResult(job.chatId, `Error: ${err.message}`);
      resolve();
    });
  });
}

export async function processQueue() {
  // Recover any stale jobs on startup
  recoverStaleJobs();

  const activeCount = getActiveCount();
  if (activeCount >= MAX_WORKERS) return;

  const pending = getPendingJobs();
  const slotsAvailable = MAX_WORKERS - activeCount;
  const jobsToRun = pending.slice(0, slotsAvailable);

  // Start jobs in parallel (don't await all together)
  jobsToRun.forEach(job => runTask(job));
}
```

**Step 2: Run to verify module loads**

Run: `node -e "import('./lib/worker.js').then(w => console.log('Worker module OK'))"`
Expected: "Worker module OK"

**Step 3: Commit**

```bash
git add lib/worker.js
git commit -m "feat: add parallel worker system with timeout"
```

---

### Task 1.3: Heartbeat System

**Required Skills:**
- `superpowers:test-driven-development` - Write tests before implementation
- `superpowers:verification-before-completion` - Verify heartbeat.json is created

**Files:**
- Create: `lib/heartbeat.js`
- Create: `heartbeat.json` (auto-generated)

**Purpose:** Write heartbeat file every 30s. External monitor can check if bot is alive.

**Step 1: Create heartbeat module**

```javascript
// lib/heartbeat.js
import { writeFileSync } from 'fs';
import { join } from 'path';

const HEARTBEAT_FILE = join(process.cwd(), 'heartbeat.json');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

let stats = {
  startedAt: new Date().toISOString(),
  lastHeartbeat: null,
  tasksProcessed: 0,
  tasksFailed: 0,
  uptime: 0
};

export function incrementProcessed() { stats.tasksProcessed++; }
export function incrementFailed() { stats.tasksFailed++; }

function writeHeartbeat() {
  stats.lastHeartbeat = new Date().toISOString();
  stats.uptime = Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000);
  writeFileSync(HEARTBEAT_FILE, JSON.stringify(stats, null, 2));
}

export function startHeartbeat() {
  writeHeartbeat();
  setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  console.log('[Heartbeat] Started (every 30s)');
}

export function getStats() { return { ...stats }; }
```

**Step 2: Run to verify**

Run: `node -e "import('./lib/heartbeat.js').then(h => { h.startHeartbeat(); setTimeout(() => process.exit(0), 1000); })"`
Expected: Creates heartbeat.json file

**Step 3: Commit**

```bash
git add lib/heartbeat.js
git commit -m "feat: add heartbeat monitoring system"
```

---

### Task 1.4: Structured Logging

**Required Skills:**
- `superpowers:test-driven-development` - Write tests before implementation
- `superpowers:verification-before-completion` - Verify log files are created with correct format

**Files:**
- Create: `lib/logger.js`
- Create: `logs/` directory

**Purpose:** Persistent, structured logs for debugging and self-maintenance analysis.

**Step 1: Create logger module**

```javascript
// lib/logger.js
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

function getLogFile() {
  const date = new Date().toISOString().split('T')[0];
  return join(LOGS_DIR, `${date}.log`);
}

function formatLog(level, component, message, data = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data
  }) + '\n';
}

export function log(level, component, message, data = {}) {
  const line = formatLog(level, component, message, data);
  appendFileSync(getLogFile(), line);

  // Also console.log for visibility
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌', success: '✅' }[level] || '📝';
  console.log(`${prefix} [${component}] ${message}`);
}

export const info = (component, message, data) => log('info', component, message, data);
export const warn = (component, message, data) => log('warn', component, message, data);
export const error = (component, message, data) => log('error', component, message, data);
export const success = (component, message, data) => log('success', component, message, data);
```

**Step 2: Run to verify**

Run: `node -e "import('./lib/logger.js').then(l => l.info('test', 'Hello world'))"`
Expected: Creates log file and prints to console

**Step 3: Commit**

```bash
git add lib/logger.js
git commit -m "feat: add structured JSON logging"
```

---

### Task 1.5: Session Management for /chat

**Required Skills:**
- `superpowers:test-driven-development` - Write tests before implementation
- `superpowers:verification-before-completion` - Verify session persistence works

**Files:**
- Create: `lib/sessions.js`
- Create: `sessions/` directory

**Purpose:** Track multi-turn conversations for `/chat` command using Claude's `--resume` flag.

**Step 1: Create sessions module**

```javascript
// lib/sessions.js
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SESSIONS_DIR = join(process.cwd(), 'sessions');
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getSessionFile(chatId) {
  // Sanitize chatId for filename
  const safe = chatId.replace(/[^a-zA-Z0-9]/g, '_');
  return join(SESSIONS_DIR, `${safe}.json`);
}

export function getSession(chatId) {
  const file = getSessionFile(chatId);
  if (!existsSync(file)) return null;

  const session = JSON.parse(readFileSync(file, 'utf-8'));

  // Check if expired
  if (Date.now() - new Date(session.lastActivity).getTime() > SESSION_TIMEOUT_MS) {
    return null;
  }

  return session;
}

export function updateSession(chatId, sessionId) {
  const file = getSessionFile(chatId);
  const session = {
    chatId,
    sessionId,
    createdAt: existsSync(file)
      ? JSON.parse(readFileSync(file, 'utf-8')).createdAt
      : new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  writeFileSync(file, JSON.stringify(session, null, 2));
}

export function endSession(chatId) {
  const file = getSessionFile(chatId);
  if (existsSync(file)) {
    const session = JSON.parse(readFileSync(file, 'utf-8'));
    session.endedAt = new Date().toISOString();
    // Move to archive
    const archiveDir = join(SESSIONS_DIR, 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, `${Date.now()}.json`), JSON.stringify(session, null, 2));
    // Remove active session
    require('fs').unlinkSync(file);
  }
}
```

**Step 2: Run to verify**

Run: `node -e "import('./lib/sessions.js').then(s => console.log('Sessions module OK'))"`
Expected: "Sessions module OK"

**Step 3: Commit**

```bash
git add lib/sessions.js
git commit -m "feat: add session management for /chat"
```

---

### Task 1.6: Integrate All Modules into whatsapp-bot.js

**Required Skills:**
- `superpowers:test-driven-development` - Write integration tests
- `superpowers:verification-before-completion` - Verify bot starts and all systems initialize
- `superpowers:requesting-code-review` - Review Phase 1 before proceeding
- `superpowers:finishing-a-development-branch` - Commit and tag Phase 1 completion

**Files:**
- Modify: `whatsapp-bot.js`

**Purpose:** Wire up queue, workers, heartbeat, logging, and sessions into the main bot.

**Step 1: Rewrite whatsapp-bot.js**

```javascript
// whatsapp-bot.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

import { enqueue, getPendingJobs } from './lib/queue.js';
import { processQueue, setSendMessageCallback } from './lib/worker.js';
import { startHeartbeat, incrementProcessed, incrementFailed } from './lib/heartbeat.js';
import { info, warn, error, success } from './lib/logger.js';
import { getSession, updateSession, endSession } from './lib/sessions.js';

const WORKSPACE = process.cwd();
const POLL_INTERVAL_MS = 2000;
const QUEUE_PROCESS_INTERVAL_MS = 1000;

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032721183-alpha.html'
  },
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  },
});

// Safe send with retry
async function safeSendMessage(chatId, message, retries = 3) {
  const MAX_LENGTH = 4000;
  const chunks = [];

  for (let i = 0; i < message.length; i += MAX_LENGTH) {
    chunks.push(message.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    for (let i = 0; i < retries; i++) {
      try {
        await client.sendMessage(chatId, chunk, { sendSeen: false });
        return;
      } catch (err) {
        warn('WhatsApp', `Send attempt ${i + 1} failed`, { error: err.message });
        if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
    throw new Error('Failed to send after all retries');
  }
}

// Set up worker callback
setSendMessageCallback(safeSendMessage);

// Message tracking
let lastMessageId = null;

async function pollForMessages() {
  try {
    const chats = await client.getChats();
    const myId = client.info?.wid?._serialized;
    const selfChat = chats.find(c => c.id._serialized === myId);

    if (!selfChat || !myId) return;

    const messages = await selfChat.fetchMessages({ limit: 5 });

    for (const msg of messages.reverse()) {
      if (msg.id._serialized === lastMessageId) continue;
      if (!msg.fromMe) continue;

      const text = msg.body.trim();
      lastMessageId = msg.id._serialized;

      // Handle /claude - one-shot task
      if (text.toLowerCase().startsWith('/claude ')) {
        const task = text.slice(8).trim();
        if (task) {
          const jobId = enqueue({ type: 'oneshot', task, chatId: myId });
          info('Queue', `Enqueued job ${jobId}`, { task: task.slice(0, 50) });
          await safeSendMessage(myId, `Queued: ${task.slice(0, 100)}...`);
        }
      }

      // Handle /chat - session-based conversation
      else if (text.toLowerCase().startsWith('/chat ')) {
        const message = text.slice(6).trim();
        if (message) {
          const session = getSession(myId);
          const jobId = enqueue({
            type: 'chat',
            task: message,
            chatId: myId,
            sessionId: session?.sessionId || null
          });
          info('Queue', `Enqueued chat job ${jobId}`, { hasSession: !!session });
        }
      }

      // Handle /endchat - end session
      else if (text.toLowerCase() === '/endchat') {
        endSession(myId);
        await safeSendMessage(myId, 'Session ended.');
        info('Session', 'Session ended by user');
      }

      // Handle /status - bot status
      else if (text.toLowerCase() === '/status') {
        const pending = getPendingJobs().length;
        await safeSendMessage(myId, `Bot online. ${pending} jobs pending.`);
      }
    }
  } catch (err) {
    // Ignore polling errors - will retry
  }
}

// Event handlers
client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  info('WhatsApp', `Loading: ${percent}%`, { message });
});

client.on('authenticated', () => {
  success('WhatsApp', 'Authenticated');
});

client.on('auth_failure', msg => {
  error('WhatsApp', 'Auth failure', { message: msg });
  process.exit(1);
});

client.on('disconnected', (reason) => {
  error('WhatsApp', 'Disconnected', { reason });
  process.exit(1);
});

client.on('ready', async () => {
  success('WhatsApp', 'Ready');
  info('Bot', `Workspace: ${WORKSPACE}`);

  // Start systems
  startHeartbeat();

  // Poll for messages
  setInterval(pollForMessages, POLL_INTERVAL_MS);

  // Process queue
  setInterval(processQueue, QUEUE_PROCESS_INTERVAL_MS);

  // Startup notification
  try {
    const myId = client.info?.wid?._serialized;
    if (myId) {
      await safeSendMessage(myId, 'Bot online. Send /claude <task> or /chat <message>');
    }
  } catch (err) {
    warn('WhatsApp', 'Could not send startup message');
  }
});

// Error handlers
process.on('uncaughtException', (err) => {
  error('Process', 'Uncaught exception', { error: err.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  error('Process', 'Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

process.on('SIGTERM', () => {
  info('Process', 'Received SIGTERM');
  client.destroy().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  info('Process', 'Received SIGINT');
  client.destroy().then(() => process.exit(0));
});

info('Bot', 'Starting WhatsApp bot (24/7 mode)');
client.initialize();
```

**Step 2: Test the bot starts**

Run: `node whatsapp-bot.js`
Expected: Bot initializes, creates directories, starts heartbeat

**Step 3: Commit**

```bash
git add whatsapp-bot.js lib/
git commit -m "feat: integrate queue, workers, heartbeat, logging, sessions"
```

---

## Phase 2: Self-Maintenance System

### Goal
Brokkr automatically improves itself twice daily using Claude's skills.

---

### Task 2.1: Self-Maintenance Script

**Required Skills:**
- `agent-sdk-dev:new-sdk-app` - Consider creating reusable maintenance agent
- `agent-sdk-dev:agent-sdk-verifier-ts` - Verify any agent apps created
- `claude-code-setup:claude-automation-recommender` - Evaluate current automations
- `claude-md-management:claude-md-improver` - Audit CLAUDE.md quality
- `superpowers:verification-before-completion` - Test script runs correctly

**Files:**
- Create: `scripts/self-maintain.sh`

**Purpose:** Run twice daily via cron. Uses skills to audit and improve the setup.

**Step 1: Create self-maintenance script**

```bash
#!/bin/bash
# scripts/self-maintain.sh
# Brokkr Self-Maintenance - runs twice daily

cd /Users/brokkrbot/brokkr-agent

LOG_FILE="logs/maintenance-$(date +%Y-%m-%d-%H%M).log"

echo "=== Brokkr Self-Maintenance $(date) ===" | tee -a "$LOG_FILE"

# Step 1: Review recent logs for patterns
echo "Analyzing logs..." | tee -a "$LOG_FILE"
claude -p "Review the logs in logs/ directory. Identify any patterns of failures, retries, or errors. Summarize findings." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 2: Use claude-automation-recommender to evaluate setup
echo "Evaluating Claude Code setup..." | tee -a "$LOG_FILE"
claude -p "/claude-code-setup:claude-automation-recommender - Analyze this codebase and recommend improvements to hooks, skills, and automations." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 3: Use claude-md-management to update CLAUDE.md
echo "Updating CLAUDE.md..." | tee -a "$LOG_FILE"
claude -p "/claude-md-management:revise-claude-md - Update CLAUDE.md with any learnings from recent sessions and logs." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 4: Git diff to see what changed
echo "Checking git status..." | tee -a "$LOG_FILE"
git status >> "$LOG_FILE" 2>&1
git diff >> "$LOG_FILE" 2>&1

# Step 5: Commit any improvements
if [ -n "$(git status --porcelain)" ]; then
  echo "Committing improvements..." | tee -a "$LOG_FILE"
  git add -A
  git commit -m "chore: self-maintenance improvements $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
fi

echo "=== Maintenance complete ===" | tee -a "$LOG_FILE"
```

**Step 2: Make executable**

Run: `chmod +x scripts/self-maintain.sh`

**Step 3: Test the script**

Run: `./scripts/self-maintain.sh`
Expected: Script runs, creates log file, checks git status

**Step 4: Commit**

```bash
git add scripts/self-maintain.sh
git commit -m "feat: add self-maintenance script"
```

---

### Task 2.2: Schedule Self-Maintenance Cron Jobs

**Required Skills:**
- `superpowers:verification-before-completion` - Verify cron entries are set
- `claude-md-management:revise-claude-md` - Document self-maintenance in CLAUDE.md

**Files:**
- Modify: User's crontab

**Purpose:** Run self-maintenance at 6am and 6pm daily.

**Step 1: Add cron entries**

Run: `crontab -e`

Add these lines:
```
# Brokkr Self-Maintenance (6am and 6pm)
0 6 * * * /Users/brokkrbot/brokkr-agent/scripts/self-maintain.sh >> /Users/brokkrbot/brokkr-agent/logs/cron.log 2>&1
0 18 * * * /Users/brokkrbot/brokkr-agent/scripts/self-maintain.sh >> /Users/brokkrbot/brokkr-agent/logs/cron.log 2>&1
```

**Step 2: Verify cron is set**

Run: `crontab -l`
Expected: Shows the two maintenance entries

**Step 3: Document in CLAUDE.md**

Add to CLAUDE.md:
```markdown
## Self-Maintenance

Brokkr runs self-maintenance twice daily (6am and 6pm) that:
- Reviews logs for failure patterns
- Uses claude-automation-recommender to evaluate setup
- Updates CLAUDE.md with learnings
- Commits any improvements automatically
```

---

### Task 2.3: Automatic Skill Creation

**Required Skills:**
- `superpowers:test-driven-development` - Write tests for pattern detection
- `superpowers:writing-skills` - Understand skill structure for auto-generation
- `agent-sdk-dev:new-sdk-app` - Create skill-generator agent for reuse
- `agent-sdk-dev:agent-sdk-verifier-ts` - Verify skill-generator agent
- `superpowers:verification-before-completion` - Verify skill creation works
- `superpowers:requesting-code-review` - Review Phase 2 before proceeding

**Files:**
- Create: `lib/skill-detector.js`
- Create: `.claude/skills/` directory structure

**Purpose:** After each successful task, analyze if a reusable pattern should become a skill.

**Step 1: Create skill detector module**

```javascript
// lib/skill-detector.js
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { info, success, error } from './logger.js';

const SKILLS_DIR = join(process.cwd(), '.claude', 'skills');
const PATTERNS_FILE = join(process.cwd(), 'data', 'task-patterns.json');

// Ensure directories exist
if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
if (!existsSync(join(process.cwd(), 'data'))) mkdirSync(join(process.cwd(), 'data'), { recursive: true });

function getPatterns() {
  if (!existsSync(PATTERNS_FILE)) return { patterns: [] };
  return JSON.parse(readFileSync(PATTERNS_FILE, 'utf-8'));
}

function savePatterns(data) {
  writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

export function recordTaskPattern(task, success) {
  const data = getPatterns();

  // Extract key verbs/nouns for pattern matching
  const normalized = task.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .replace(/\d+/g, '<NUM>')
    .replace(/['"]/g, '');

  // Find or create pattern
  let pattern = data.patterns.find(p =>
    normalized.includes(p.keywords[0]) &&
    p.keywords.every(k => normalized.includes(k))
  );

  if (!pattern) {
    // Extract first 3 significant words as keywords
    const words = normalized.split(/\s+/).filter(w => w.length > 3 && !['the', 'and', 'for', 'with'].includes(w));
    pattern = {
      keywords: words.slice(0, 3),
      count: 0,
      successes: 0,
      examples: [],
      skillCreated: false
    };
    data.patterns.push(pattern);
  }

  pattern.count++;
  if (success) pattern.successes++;
  if (pattern.examples.length < 5) pattern.examples.push(task);

  savePatterns(data);

  // Check if should create skill
  if (pattern.count >= 3 && pattern.successes >= 2 && !pattern.skillCreated) {
    createSkillForPattern(pattern);
    pattern.skillCreated = true;
    savePatterns(data);
  }
}

function createSkillForPattern(pattern) {
  info('SkillDetector', 'Creating skill for pattern', { keywords: pattern.keywords });

  const prompt = `Use the superpowers:writing-skills skill to create a new skill based on this pattern:

Keywords: ${pattern.keywords.join(', ')}
Example tasks:
${pattern.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Create a well-structured SKILL.md that captures this reusable pattern. Save it to .claude/skills/<appropriate-name>/SKILL.md`;

  const child = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.on('close', (code) => {
    if (code === 0) {
      success('SkillDetector', 'Skill created for pattern', { keywords: pattern.keywords });
    } else {
      error('SkillDetector', 'Failed to create skill', { keywords: pattern.keywords, code });
    }
  });
}

export function getExistingSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}
```

**Step 2: Integrate into worker**

Add to `lib/worker.js` after task completion:
```javascript
import { recordTaskPattern } from './skill-detector.js';

// In runTask, after markCompleted:
recordTaskPattern(job.task, true);

// After markFailed:
recordTaskPattern(job.task, false);
```

**Step 3: Test pattern recording**

Run: `node -e "import('./lib/skill-detector.js').then(s => { s.recordTaskPattern('check email inbox', true); console.log('OK'); })"`
Expected: Creates data/task-patterns.json

**Step 4: Commit**

```bash
git add lib/skill-detector.js data/
git commit -m "feat: add automatic skill detection and creation"
```

---

## Phase 3: Skills Library

### Goal
Build core skills for common tasks. Each skill is a SKILL.md file that Claude loads when invoked.

---

### Task 3.1: X (Twitter) Skill

**Required Skills:**
- `superpowers:writing-skills` - Follow skill creation best practices
- `superpowers:verification-before-completion` - Test skill invocation works

**Files:**
- Create: `.claude/skills/x/SKILL.md`

**Step 1: Create X skill**

```markdown
---
name: x
description: "Interact with X (Twitter) - post, read, search, engage"
version: "1.0.0"
invoke: auto
---

# X (Twitter) Skill

## Purpose
Interact with X.com using Chrome automation. Post tweets, read timelines, search, engage.

## Prerequisites
- Chrome enabled (`--chrome` flag)
- Logged into X.com as brokkrassist@icloud.com

## Instructions

### Posting a Tweet
1. Navigate to https://x.com/compose/tweet
2. Wait for compose box to load
3. Type the tweet content
4. Click "Post" button
5. Verify tweet was posted by checking for success indicator

### Reading Timeline
1. Navigate to https://x.com/home
2. Scroll to load tweets
3. Extract text content from visible tweets
4. Summarize key topics/themes

### Searching
1. Navigate to https://x.com/search?q=<encoded-query>
2. Select "Latest" tab for recent content
3. Scroll and collect results
4. Summarize findings

### Engaging (Like/Retweet/Reply)
1. Navigate to specific tweet URL
2. Find engagement buttons
3. Click appropriate action
4. Verify action completed

## Error Handling
- If login prompt appears: Log in using credentials from CLAUDE.md
- If rate limited: Wait 5 minutes, retry
- If element not found: Refresh page, retry with updated selectors

## Examples
- "Post a tweet about the weather"
- "Check what people are saying about AI"
- "Like the latest tweet from @anthropic"
```

**Step 2: Commit**

```bash
git add .claude/skills/x/
git commit -m "feat: add X (Twitter) skill"
```

---

### Task 3.2: Email Skill (iCloud)

**Required Skills:**
- `superpowers:writing-skills` - Follow skill creation best practices
- `superpowers:verification-before-completion` - Test skill invocation works

**Files:**
- Create: `.claude/skills/email/SKILL.md`

**Step 1: Create email skill**

```markdown
---
name: email
description: "Read and send email via iCloud Mail"
version: "1.0.0"
invoke: auto
---

# Email Skill (iCloud)

## Purpose
Manage email via mail.icloud.com using Chrome automation.

## Prerequisites
- Chrome enabled (`--chrome` flag)
- Apple ID: brokkrassist@icloud.com (from CLAUDE.md)

## Instructions

### Checking Inbox
1. Navigate to https://www.icloud.com/mail/
2. Wait for inbox to load (may need to handle 2FA)
3. Read visible email subjects and senders
4. Summarize unread/important items

### Reading an Email
1. Click on email in list
2. Wait for content to load in reading pane
3. Extract subject, sender, date, body text
4. Summarize content

### Sending an Email
1. Click "Compose" button
2. Fill in To, Subject, Body fields
3. Click "Send"
4. Verify sent confirmation

### Searching
1. Use search bar at top
2. Enter search query
3. Review results

## Error Handling
- If login required: Use Apple ID from CLAUDE.md
- If 2FA prompt: Report to user via WhatsApp, wait for code
- If slow loading: Wait up to 30 seconds before failing

## Examples
- "Check my email for anything important"
- "Send an email to john@example.com about the meeting"
- "Search for emails from Amazon"
```

**Step 2: Commit**

```bash
git add .claude/skills/email/
git commit -m "feat: add email skill for iCloud Mail"
```

---

### Task 3.3: GitHub Skill

**Required Skills:**
- `superpowers:writing-skills` - Follow skill creation best practices
- `agent-sdk-dev:new-sdk-app` - Create reusable PR review/issue creation agents
- `agent-sdk-dev:agent-sdk-verifier-ts` - Verify GitHub agent apps
- `superpowers:verification-before-completion` - Test skill invocation works

**Files:**
- Create: `.claude/skills/github/SKILL.md`

**Step 1: Create GitHub skill**

```markdown
---
name: github
description: "Interact with GitHub - repos, PRs, issues, code review"
version: "1.0.0"
invoke: auto
---

# GitHub Skill

## Purpose
Work with GitHub repositories using Chrome and gh CLI.

## Prerequisites
- Chrome enabled for web UI tasks
- gh CLI authenticated (run `gh auth login` if needed)
- Git configured as "Brokkr Assist" <brokkrassist@icloud.com>

## Instructions

### Reviewing a PR
1. Use `gh pr view <number> --repo <owner/repo>` for details
2. Use `gh pr diff <number> --repo <owner/repo>` for changes
3. Navigate to PR URL in Chrome for visual review
4. Add comments via `gh pr comment` or Chrome

### Creating an Issue
1. Use `gh issue create --repo <owner/repo> --title "..." --body "..."`
2. Or navigate to repo/issues/new in Chrome

### Checking CI Status
1. Use `gh pr checks <number> --repo <owner/repo>`
2. Or view Actions tab in Chrome

### Browsing Code
1. Navigate to file URL in Chrome
2. Or use `gh api repos/<owner>/<repo>/contents/<path>`

## Error Handling
- If not authenticated: Run `gh auth login`
- If repo not found: Verify owner/repo spelling
- If rate limited: Wait and retry

## Examples
- "Review PR #123 on anthropics/claude-code"
- "Create an issue for the login bug"
- "Check if CI passed on my latest PR"
```

**Step 2: Commit**

```bash
git add .claude/skills/github/
git commit -m "feat: add GitHub skill"
```

---

### Task 3.4: Web Research Skill

**Required Skills:**
- `superpowers:writing-skills` - Follow skill creation best practices
- `agent-sdk-dev:new-sdk-app` - Create reusable research/summarization agents
- `agent-sdk-dev:agent-sdk-verifier-ts` - Verify research agent apps
- `superpowers:verification-before-completion` - Test skill invocation works

**Files:**
- Create: `.claude/skills/research/SKILL.md`

**Step 1: Create research skill**

```markdown
---
name: research
description: "Research topics on the web, summarize articles"
version: "1.0.0"
invoke: auto
---

# Web Research Skill

## Purpose
Research topics using web search and browsing. Summarize findings.

## Prerequisites
- Chrome enabled (`--chrome` flag)
- WebSearch and WebFetch tools available

## Instructions

### Researching a Topic
1. Use WebSearch to find relevant sources
2. Open top 3-5 results in Chrome or via WebFetch
3. Extract key information from each source
4. Synthesize findings into a summary
5. Include source URLs for reference

### Summarizing an Article
1. Navigate to URL in Chrome or use WebFetch
2. Extract main content (skip ads, navigation)
3. Identify key points, quotes, data
4. Write concise summary (3-5 bullet points)

### Comparing Sources
1. Gather information from multiple sources
2. Note agreements and disagreements
3. Highlight most credible/recent sources
4. Present balanced summary

## Error Handling
- If page won't load: Try WebFetch instead of Chrome
- If content is paywalled: Note limitation, try alternative source
- If results are outdated: Add current year to search

## Examples
- "Research the latest developments in AI agents"
- "Summarize this article: <url>"
- "Compare coverage of <event> across news sites"
```

**Step 2: Commit**

```bash
git add .claude/skills/research/
git commit -m "feat: add web research skill"
```

---

### Task 3.5: YouTube Skill

**Required Skills:**
- `superpowers:writing-skills` - Follow skill creation best practices
- `superpowers:verification-before-completion` - Test skill invocation works
- `superpowers:requesting-code-review` - Review Phase 3 before proceeding
- `superpowers:dispatching-parallel-agents` - Skills 3.1-3.5 can be created in parallel

**Files:**
- Create: `.claude/skills/youtube/SKILL.md`

**Step 1: Create YouTube skill**

```markdown
---
name: youtube
description: "Search YouTube, get video info and transcripts"
version: "1.0.0"
invoke: auto
---

# YouTube Skill

## Purpose
Find and analyze YouTube videos. Get transcripts where available.

## Prerequisites
- Chrome enabled (`--chrome` flag)

## Instructions

### Searching for Videos
1. Navigate to https://www.youtube.com/results?search_query=<encoded-query>
2. Wait for results to load
3. Extract video titles, channels, view counts, dates
4. Return top 5-10 relevant results

### Getting Video Info
1. Navigate to video URL
2. Extract title, channel, description, view count, date
3. Note video length

### Getting Transcript
1. Navigate to video URL
2. Click "...more" under description
3. Click "Show transcript" if available
4. Extract transcript text
5. If no transcript: Note limitation

### Summarizing Video Content
1. Get transcript (if available)
2. If no transcript: Watch key sections, note on-screen text
3. Summarize main points

## Error Handling
- If no transcript: Report limitation, offer to describe visible content
- If video unavailable: Report error
- If age-restricted: May need to log in

## Examples
- "Find videos about Python programming"
- "Get the transcript of https://youtube.com/watch?v=..."
- "Summarize the top video about machine learning"
```

**Step 2: Commit**

```bash
git add .claude/skills/youtube/
git commit -m "feat: add YouTube skill"
```

---

## Phase 4: Scheduling System

### Goal
Enable scheduled tasks via cron, with natural language time parsing.

---

### Task 4.1: Schedule Skill

**Required Skills:**
- `superpowers:test-driven-development` - Write tests for cron parsing
- `superpowers:writing-skills` - Create the schedule SKILL.md
- `agent-sdk-dev:new-sdk-app` - Create reusable scheduled task agents
- `agent-sdk-dev:agent-sdk-verifier-ts` - Verify scheduled task agents
- `superpowers:verification-before-completion` - Verify cron entries work
- `superpowers:requesting-code-review` - Review Phase 4 before proceeding
- `superpowers:finishing-a-development-branch` - Finalize implementation

**Files:**
- Create: `.claude/skills/schedule/SKILL.md`
- Create: `lib/schedule.js`

**Step 1: Create schedule module**

```javascript
// lib/schedule.js
import { execSync } from 'child_process';
import { info, error } from './logger.js';

const CRON_MARKER = '# BROKKR:';

function parseToCron(timeExpr) {
  const lower = timeExpr.toLowerCase();

  // "at 3pm" or "at 15:00"
  const atMatch = lower.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (atMatch) {
    let hour = parseInt(atMatch[1]);
    const minute = atMatch[2] ? parseInt(atMatch[2]) : 0;
    const ampm = atMatch[3];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * *`;
  }

  // "every day at 9am"
  const dailyMatch = lower.match(/every day at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = dailyMatch[2] ? parseInt(dailyMatch[2]) : 0;
    const ampm = dailyMatch[3];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * *`;
  }

  // "every monday at 9am"
  const weeklyMatch = lower.match(/every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (weeklyMatch) {
    const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[weeklyMatch[1]];
    let hour = parseInt(weeklyMatch[2]);
    const minute = weeklyMatch[3] ? parseInt(weeklyMatch[3]) : 0;
    const ampm = weeklyMatch[4];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * ${day}`;
  }

  // "every hour"
  if (lower.includes('every hour')) {
    return '0 * * * *';
  }

  return null;
}

export function addSchedule(timeExpr, task) {
  const cron = parseToCron(timeExpr);
  if (!cron) {
    return { success: false, error: `Could not parse time: ${timeExpr}` };
  }

  const id = Date.now().toString(36);
  const command = `cd /Users/brokkrbot/brokkr-agent && claude -p "${task.replace(/"/g, '\\"')}" --dangerously-skip-permissions --chrome >> logs/scheduled.log 2>&1`;
  const cronLine = `${cron} ${command} ${CRON_MARKER}${id}`;

  try {
    const current = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const updated = current.trim() + '\n' + cronLine + '\n';
    execSync(`echo "${updated.replace(/"/g, '\\"')}" | crontab -`);

    info('Schedule', 'Added scheduled task', { id, cron, task: task.slice(0, 50) });
    return { success: true, id, cron };
  } catch (err) {
    error('Schedule', 'Failed to add schedule', { error: err.message });
    return { success: false, error: err.message };
  }
}

export function listSchedules() {
  try {
    const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const lines = crontab.split('\n').filter(l => l.includes(CRON_MARKER));

    return lines.map(line => {
      const idMatch = line.match(/# BROKKR:(\w+)/);
      const parts = line.split(' ');
      return {
        id: idMatch ? idMatch[1] : 'unknown',
        cron: parts.slice(0, 5).join(' '),
        command: parts.slice(5).join(' ').replace(/# BROKKR:\w+/, '').trim()
      };
    });
  } catch {
    return [];
  }
}

export function removeSchedule(id) {
  try {
    const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const lines = crontab.split('\n').filter(l => !l.includes(`${CRON_MARKER}${id}`));
    execSync(`echo "${lines.join('\n').replace(/"/g, '\\"')}" | crontab -`);

    info('Schedule', 'Removed scheduled task', { id });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

**Step 2: Create schedule skill**

```markdown
---
name: schedule
description: "Schedule autonomous tasks to run at specific times"
version: "1.0.0"
invoke: manual
---

# Schedule Skill

## Purpose
Schedule tasks to run automatically using cron.

## Commands

### Add a schedule
"schedule at 3pm check my email"
"schedule every day at 9am summarize hacker news"
"schedule every monday at 10am review github notifications"

### List schedules
"schedule list" or "show my schedules"

### Remove a schedule
"schedule remove <id>"

## Time Formats Supported
- "at 3pm" - today at 3pm
- "at 15:30" - today at 15:30
- "every day at 9am" - daily at 9am
- "every monday at 10am" - weekly on Monday
- "every hour" - every hour on the hour

## How It Works
Tasks are added to the system crontab. Each task runs `claude -p "<task>"` with full permissions.

Results are logged to `logs/scheduled.log`.

## Examples
- Schedule: "at 6pm check if any PRs need review"
- List: "show my scheduled tasks"
- Remove: "remove schedule abc123"
```

**Step 3: Commit**

```bash
git add lib/schedule.js .claude/skills/schedule/
git commit -m "feat: add scheduling system with natural language parsing"
```

---

## Phase 5: CRM Integration (Future)

*Deferred to later phase. Will integrate with brokkr.co when core system is stable.*

---

## Parallelization Opportunities

Use `superpowers:dispatching-parallel-agents` for these task groups:

| Parallel Group | Tasks | Notes |
|----------------|-------|-------|
| Phase 1 Core Modules | 1.1, 1.2, 1.3, 1.4, 1.5 | All independent, can run simultaneously |
| Phase 3 Skills | 3.1, 3.2, 3.3, 3.4, 3.5 | All SKILL.md creation, independent |

**Sequential Dependencies:**
- Task 1.6 depends on 1.1-1.5 (integration)
- Task 2.3 depends on 2.1, 2.2 (skill detector needs maintenance scripts)
- Task 4.1 depends on Phase 1 completion (needs queue/logging)

---

## Post-Implementation Maintenance

After completing all phases, Brokkr should automatically:

1. **Every 2 hours**: Check heartbeat, review queue depth
2. **Every 6am/6pm**: Run `scripts/self-maintain.sh` which uses:
   - `claude-code-setup:claude-automation-recommender` - Evaluate setup
   - `claude-md-management:revise-claude-md` - Update CLAUDE.md
   - `superpowers:systematic-debugging` - If errors detected in logs
   - `agent-sdk-dev:new-sdk-app` - If repetitive automation patterns detected
3. **On pattern detection**: Use `superpowers:writing-skills` to create new skills
4. **On complex automation needs**: Use `agent-sdk-dev:new-sdk-app` to create reusable agent scripts
5. **Weekly**: Use `claude-md-management:claude-md-improver` to audit CLAUDE.md quality

---

## Directory Structure

```
/Users/brokkrbot/brokkr-agent/
├── .claude/
│   └── skills/
│       ├── x/SKILL.md
│       ├── email/SKILL.md
│       ├── github/SKILL.md
│       ├── research/SKILL.md
│       ├── youtube/SKILL.md
│       └── schedule/SKILL.md
├── lib/
│   ├── queue.js
│   ├── worker.js
│   ├── heartbeat.js
│   ├── logger.js
│   ├── sessions.js
│   ├── schedule.js
│   └── skill-detector.js
├── scripts/
│   └── self-maintain.sh
├── jobs/
│   ├── active/
│   ├── completed/
│   └── failed/
├── sessions/
│   └── archive/
├── logs/
├── data/
│   └── task-patterns.json
├── whatsapp-bot.js
├── heartbeat.json
├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md
└── package.json
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `/claude <task>` | One-shot task (queued, parallel) |
| `/chat <message>` | Continue conversation session |
| `/endchat` | End current session |
| `/status` | Check bot status |
| `schedule at <time> <task>` | Schedule a task |
| `schedule list` | List scheduled tasks |
| `schedule remove <id>` | Remove a schedule |

---

## Success Metrics

- **Uptime**: Heartbeat gaps < 1 minute
- **Task completion rate**: > 95%
- **Queue depth**: Rarely > 5 pending
- **Skill creation**: 1+ new skills per week from patterns
- **Self-maintenance**: Daily commits from optimization

---

## Final Verification Checklist

**Before marking implementation complete, use `superpowers:verification-before-completion` to verify:**

- [ ] Bot starts without errors: `node whatsapp-bot.js`
- [ ] Heartbeat file created: `cat heartbeat.json`
- [ ] Logs are written: `ls logs/`
- [ ] Job queue directories exist: `ls jobs/`
- [ ] Session directory exists: `ls sessions/`
- [ ] Skills directory populated: `ls .claude/skills/`
- [ ] Self-maintenance script executable: `./scripts/self-maintain.sh`
- [ ] Cron jobs set: `crontab -l | grep BROKKR`
- [ ] WhatsApp commands work: Send `/status` via WhatsApp
- [ ] Git is clean: `git status`

**Use `superpowers:requesting-code-review` for final review before deployment.**

---

*Document created: 2025-01-30*
*Last updated: 2025-01-30*
*Author: Claude (Opus 4.5) for Brokkr Agent*
