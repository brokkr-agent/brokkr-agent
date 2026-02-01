// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getNextJob, getActiveJob, PRIORITY } from './queue.js';
import { getSessionByCode, updateSessionActivity, updateSessionClaudeId, createSession } from './sessions.js';
import { shouldCleanup, trackProcess, untrackProcess, cleanupTrackedProcesses } from './resources.js';

const WORKSPACE = process.cwd();
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max
const FORCE_KILL_DELAY_MS = 5000; // Time to wait before SIGKILL after SIGTERM
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB max for stdout buffer
const MAX_ERROR_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB max for stderr buffer

let currentSessionCode = null;
let currentProcess = null;
let sendMessageCallback = null;
let isStarting = false; // Guard flag for race condition prevention
let dryRunMode = false; // When true, jobs are simulated, not executed

/**
 * Set dry-run mode - when enabled, jobs are simulated instead of executed
 * @param {boolean} enabled - Whether dry-run mode is enabled
 */
export function setDryRunMode(enabled) {
  dryRunMode = enabled;
}

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
  // Validate inputs before calling callback
  if (!chatId || typeof chatId !== 'string') {
    console.error('[Worker] sendMessage: invalid chatId');
    return;
  }
  if (!message || typeof message !== 'string') {
    console.error('[Worker] sendMessage: invalid message');
    return;
  }
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
  // Already processing or starting - prevent concurrent execution (race condition fix)
  if (currentProcess || isStarting) return false;

  // Set starting flag immediately to prevent race conditions
  isStarting = true;

  const job = getNextJob();
  if (!job) {
    isStarting = false;
    return false;
  }

  // Check if we need cleanup when switching sessions
  const needsCleanup = shouldCleanup({
    currentSessionCode,
    incomingSessionCode: job.sessionCode || null,
    hasActiveProcess: false // Process ended if we're here
  });

  if (needsCleanup) {
    // Only cleanup tracked Claude processes, NOT Chrome (which WhatsApp uses)
    cleanupTrackedProcesses();
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

  // In dry-run mode, simulate the job instead of actually executing
  if (dryRunMode) {
    return new Promise(async (resolve) => {
      isStarting = false;
      currentSessionCode = job.sessionCode || null;

      // Simulate a brief delay
      await new Promise(r => setTimeout(r, 100));

      const result = `[DRY-RUN] Would execute: ${job.task}`;
      markCompleted(job.id, result);

      if (job.sessionCode) {
        updateSessionActivity(job.sessionCode);
      }

      await sendMessage(job.chatId, result);
      console.log(`[Worker] Finished job ${job.id} (dry-run)`);

      // Clear current process state
      currentProcess = null;
      resolve(true);
    });
  }

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: WORKSPACE,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;
    isStarting = false; // Process spawned, clear starting flag
    currentSessionCode = job.sessionCode || null;
    trackProcess(child.pid);

    let stdout = '';
    let stderr = '';
    let killed = false;
    let cleanedUp = false; // Guard flag to prevent double cleanup

    // Helper function to perform cleanup only once
    const doCleanup = () => {
      if (cleanedUp) return false;
      cleanedUp = true;
      clearTimeout(timeout);
      untrackProcess(child.pid);
      currentProcess = null;
      return true;
    };

    // Set up 30 minute timeout
    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Force kill after configured delay if SIGTERM doesn't work
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, FORCE_KILL_DELAY_MS);
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      // Prevent memory leak: enforce maximum buffer size
      if (stdout.length + chunk.length <= MAX_OUTPUT_SIZE) {
        stdout += chunk;
      } else if (stdout.length < MAX_OUTPUT_SIZE) {
        // Partial append to reach exactly MAX_OUTPUT_SIZE
        stdout += chunk.slice(0, MAX_OUTPUT_SIZE - stdout.length);
      }
      // Else: buffer is full, discard new data

      // Try to capture Claude session ID from output
      // Claude CLI outputs session ID in format like "session_id: abc123" or "session-id: abc123"
      const sessionMatch = stdout.match(/session[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i);
      if (sessionMatch && job.sessionCode) {
        updateSessionClaudeId(job.sessionCode, sessionMatch[1]);
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      // Prevent memory leak: enforce maximum buffer size
      if (stderr.length + chunk.length <= MAX_ERROR_OUTPUT_SIZE) {
        stderr += chunk;
      } else if (stderr.length < MAX_ERROR_OUTPUT_SIZE) {
        // Partial append to reach exactly MAX_ERROR_OUTPUT_SIZE
        stderr += chunk.slice(0, MAX_ERROR_OUTPUT_SIZE - stderr.length);
      }
      // Else: buffer is full, discard new data
    });

    child.on('close', async (code) => {
      if (!doCleanup()) return; // Already cleaned up, skip

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
      if (!doCleanup()) return; // Already cleaned up, skip

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
      // Force kill after configured delay if SIGTERM doesn't work
      setTimeout(() => {
        try { currentProcess?.kill('SIGKILL'); } catch {}
      }, FORCE_KILL_DELAY_MS);
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
  isStarting = false;
  dryRunMode = false;
}
