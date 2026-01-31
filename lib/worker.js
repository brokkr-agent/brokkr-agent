// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getNextJob, getActiveJob, PRIORITY } from './queue.js';
import { getSessionByCode, updateSessionActivity, updateSessionClaudeId, createSession } from './sessions.js';
import { shouldCleanup, fullCleanup, trackProcess, untrackProcess } from './resources.js';

const WORKSPACE = process.cwd();
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max

let currentSessionCode = null;
let currentProcess = null;
let sendMessageCallback = null;

/**
 * Set the callback function for sending messages back to the user
 * @param {Function} fn - Callback function that takes (chatId, message)
 */
export function setSendMessageCallback(fn) {
  sendMessageCallback = fn;
}

/**
 * Get the current session code being processed
 * @returns {string|null} Current session code or null
 */
export function getCurrentSessionCode() {
  return currentSessionCode;
}

/**
 * Check if a job is currently being processed
 * @returns {boolean} True if processing, false otherwise
 */
export function isProcessing() {
  return currentProcess !== null;
}

/**
 * Get the current task text being processed
 * @returns {string|null} Current task text or null if no active job
 */
export function getCurrentTask() {
  const job = getActiveJob();
  return job ? job.task : null;
}

/**
 * Send a message via the callback
 * @param {string} chatId - Chat ID to send message to
 * @param {string} message - Message to send
 */
async function sendMessage(chatId, message) {
  if (sendMessageCallback) {
    try {
      await sendMessageCallback(chatId, message);
    } catch (err) {
      console.error('[Worker] Failed to send message:', err.message);
    }
  }
}

/**
 * Process the next job from the queue
 * @returns {Promise<boolean>} True if job was processed, false if no job or already processing
 */
export async function processNextJob() {
  // Already processing - prevent concurrent execution
  if (currentProcess) return false;

  const job = getNextJob();
  if (!job) return false;

  // Check if we need cleanup when switching sessions
  const needsCleanup = shouldCleanup({
    currentSessionCode,
    incomingSessionCode: job.sessionCode || null,
    hasActiveProcess: false // Process ended if we're here
  });

  if (needsCleanup) {
    fullCleanup();
  }

  // Mark job as active
  markActive(job.id);

  // Build Claude command args
  const args = ['-p', job.task, '--dangerously-skip-permissions'];

  // Add --resume if continuing session with existing Claude session ID
  if (job.sessionCode) {
    const session = getSessionByCode(job.sessionCode);
    if (session?.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }
  }

  console.log(`[Worker] Starting job ${job.id}: ${job.task.slice(0, 50)}...`);

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: WORKSPACE,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;
    currentSessionCode = job.sessionCode || null;
    trackProcess(child.pid);

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up 30 minute timeout
    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 5000);
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();

      // Try to capture Claude session ID from output
      // Claude CLI outputs session ID in format like "session_id: abc123" or "session-id: abc123"
      const sessionMatch = stdout.match(/session[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i);
      if (sessionMatch && job.sessionCode) {
        updateSessionClaudeId(job.sessionCode, sessionMatch[1]);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      clearTimeout(timeout);
      untrackProcess(child.pid);
      currentProcess = null;

      // Combine output and strip ANSI codes
      const result = (stdout || stderr || 'Done (no output)')
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI codes

      if (killed) {
        markFailed(job.id, 'Task timed out after 30 minutes');
        await sendMessage(job.chatId, `Task timed out: ${job.task.slice(0, 50)}...`);
      } else if (code !== 0) {
        markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
        await sendMessage(job.chatId, result);
      } else {
        markCompleted(job.id, result);

        // Update session activity timestamp
        if (job.sessionCode) {
          updateSessionActivity(job.sessionCode);
        }

        await sendMessage(job.chatId, result);
      }

      console.log(`[Worker] Finished job ${job.id} (code: ${code})`);
      resolve(true);
    });

    child.on('error', async (err) => {
      clearTimeout(timeout);
      untrackProcess(child.pid);
      currentProcess = null;

      markFailed(job.id, err.message);
      await sendMessage(job.chatId, `Error: ${err.message}`);

      resolve(false);
    });
  });
}

/**
 * Kill the current running process
 */
export function killCurrentProcess() {
  if (currentProcess) {
    try {
      currentProcess.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        try { currentProcess?.kill('SIGKILL'); } catch {}
      }, 5000);
    } catch {}
    currentProcess = null;
  }
}

/**
 * Reset internal state (for testing only)
 */
export function _resetState() {
  currentSessionCode = null;
  currentProcess = null;
  sendMessageCallback = null;
}
