// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getNextJob, getActiveJob, PRIORITY, cancelPendingJob, cancelActiveJob, findPendingJobBySessionCode } from './queue.js';
import { getSessionByCode, updateSessionActivity, updateSessionClaudeId, createSession } from './sessions.js';
import { shouldCleanup, trackProcess, untrackProcess, cleanupTrackedProcesses } from './resources.js';
import { sendCallback, buildCallbackPayload } from './callback.js';
import { getOrCreateContact } from './imessage-permissions.js';
import { getConversationContext, buildInjectedContext } from './imessage-context.js';

const WORKSPACE = process.cwd();
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max
const FORCE_KILL_DELAY_MS = 5000; // Time to wait before SIGKILL after SIGTERM
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB max for stdout buffer
const MAX_ERROR_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB max for stderr buffer
const TOMMY_PHONE = '+12069090025'; // Owner phone number for notifications

let currentSessionCode = null;
let currentProcess = null;
let currentJob = null; // Track current job for message routing
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
 * @param {Object} jobMeta - Optional job metadata for routing (source, phoneNumber, etc.)
 */
async function sendMessage(chatId, message, jobMeta = null) {
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
      // Pass job metadata (source, etc.) to allow proper routing
      const meta = jobMeta || currentJob || {};
      await sendMessageCallback(chatId, message, { source: meta.source, phoneNumber: meta.phoneNumber });
    } catch (err) {
      console.error('[Worker] Failed to send message:', err.message);
    }
  }
}

/**
 * Notify owner (Tommy) about an interaction if contact has notify_owner: true
 * @param {Object} job - The job that was processed
 * @param {string} result - The response that was sent
 */
async function notifyOwnerIfNeeded(job, result) {
  // Only for iMessage jobs with a phone number (not Tommy)
  if (job.source !== 'imessage' || !job.phoneNumber || job.phoneNumber === TOMMY_PHONE) {
    return;
  }

  try {
    const contact = getOrCreateContact(job.phoneNumber);

    // Check if owner notification is enabled for this contact
    if (!contact.notify_owner) {
      return;
    }

    // Build notification message
    const contactName = contact.display_name || job.phoneNumber;
    const notification = `📱 Interaction with ${contactName}:\n\nTheir message: "${job.task}"\n\nBrokkr's response: "${result.slice(0, 500)}${result.length > 500 ? '...' : ''}"`;

    // Send notification to Tommy
    await sendMessage(TOMMY_PHONE, notification);
    console.log(`[Worker] Sent owner notification for interaction with ${contactName}`);
  } catch (err) {
    console.error('[Worker] Failed to send owner notification:', err.message);
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

  // Mark job as active and track current job for routing
  markActive(job.id);
  currentJob = job;

  // Build Claude command args
  // Use --output-format json to capture session_id for resume functionality

  // Inject context for iMessage jobs
  let enrichedTask = job.task;
  if (job.source === 'imessage' && job.phoneNumber) {
    try {
      const contact = getOrCreateContact(job.phoneNumber);
      const messages = getConversationContext(job.phoneNumber, 10);
      const context = buildInjectedContext(contact, messages, job.task);
      enrichedTask = context + job.task;
      console.log(`[Worker] Injected iMessage context for ${job.phoneNumber}`);
    } catch (err) {
      console.error(`[Worker] Failed to inject context: ${err.message}`);
      // Continue with original task if context injection fails
    }
  }

  const args = ['-p', '--output-format', 'json', enrichedTask, '--dangerously-skip-permissions'];

  // Add --resume if continuing session with existing Claude session ID
  if (job.sessionCode) {
    const session = getSessionByCode(job.sessionCode);
    if (session?.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }
  }

  const taskPreview = typeof job.task === 'string'
    ? job.task.slice(0, 50)
    : JSON.stringify(job.task).slice(0, 50);
  console.log(`[Worker] Starting job ${job.id}: ${taskPreview}...`);

  // In dry-run mode, simulate the job instead of actually executing
  if (dryRunMode) {
    return new Promise(async (resolve) => {
      isStarting = false;
      currentSessionCode = job.sessionCode || null;

      // Simulate a brief delay
      await new Promise(r => setTimeout(r, 100));

      // Build result message (safeSendMessage will add [DRY-RUN] prefix)
      const sessionInfo = job.sessionCode ? ` Session: /${job.sessionCode}` : '';
      const result = `Would execute: ${job.task}${sessionInfo}`;
      markCompleted(job.id, result);

      if (job.sessionCode) {
        updateSessionActivity(job.sessionCode);
      }

      await sendMessage(job.chatId, result);
      console.log(`[Worker] Finished job ${job.id} (dry-run)`);

      // Clear current process state
      currentProcess = null;
      currentJob = null;
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

    // Progress callback for BrokkrMVP tasks
    let progressInterval = null;
    if (job.brokkrTaskId) {
      progressInterval = setInterval(async () => {
        const elapsed = Date.now() - new Date(job.startedAt || Date.now()).getTime();
        if (elapsed > 30000) { // Only send after 30 seconds
          await sendCallback(job.brokkrTaskId, buildCallbackPayload({
            status: 'processing',
            messages: [{ role: 'agent', content: `Processing... (${Math.floor(elapsed / 1000)}s elapsed)` }],
            sessionCode: job.sessionCode
          }), 0, job.callbackUrl);
        }
      }, 30000);
    }

    let stdout = '';
    let stderr = '';
    let killed = false;
    let cleanedUp = false; // Guard flag to prevent double cleanup

    // Helper function to perform cleanup only once
    const doCleanup = () => {
      if (cleanedUp) return false;
      cleanedUp = true;
      clearTimeout(timeout);
      if (progressInterval) clearInterval(progressInterval);
      untrackProcess(child.pid);
      currentProcess = null;
      currentJob = null;
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
      // Note: Session ID extraction happens in close handler after JSON is complete
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

      // Calculate duration for usage tracking
      const durationMs = Date.now() - new Date(job.startedAt || Date.now()).getTime();

      // Parse JSON output from Claude CLI
      let result = 'Done (no output)';
      let claudeSessionId = null;

      try {
        const jsonOutput = JSON.parse(stdout);
        // Extract result text from JSON
        result = jsonOutput.result || jsonOutput.error || 'Done';
        // Extract session ID for resume functionality
        claudeSessionId = jsonOutput.session_id;

        // Store Claude session ID for future resume
        if (claudeSessionId && job.sessionCode) {
          updateSessionClaudeId(job.sessionCode, claudeSessionId);
          console.log(`[Worker] Captured session ID: ${claudeSessionId} for session ${job.sessionCode}`);
        }
      } catch {
        // Not valid JSON - use raw output (fallback for errors)
        result = (stdout || stderr || 'Done (no output)')
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI codes
      }

      if (killed) {
        markFailed(job.id, 'Task timed out after 30 minutes');
        const timeoutPreview = typeof job.task === 'string'
          ? job.task.slice(0, 50)
          : JSON.stringify(job.task).slice(0, 50);
        await sendMessage(job.chatId, `Task timed out: ${timeoutPreview}...`);

        // Send callback for BrokkrMVP tasks
        if (job.brokkrTaskId) {
          await sendCallback(job.brokkrTaskId, buildCallbackPayload({
            status: 'failed',
            errorMessage: 'Task timed out after 30 minutes',
            sessionCode: job.sessionCode,
            usage: { model_id: 'claude-sonnet-4-20250514', duration_ms: durationMs }
          }), 0, job.callbackUrl);
        }
      } else if (code !== 0) {
        markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
        await sendMessage(job.chatId, result);

        // Send callback for BrokkrMVP tasks
        if (job.brokkrTaskId) {
          await sendCallback(job.brokkrTaskId, buildCallbackPayload({
            status: 'failed',
            errorMessage: `Exit code ${code}: ${result.slice(0, 200)}`,
            sessionCode: job.sessionCode,
            usage: { model_id: 'claude-sonnet-4-20250514', duration_ms: durationMs }
          }), 0, job.callbackUrl);
        }
      } else {
        markCompleted(job.id, result);

        // Update session activity timestamp
        if (job.sessionCode) {
          updateSessionActivity(job.sessionCode);
        }

        await sendMessage(job.chatId, result);

        // Notify owner if contact has notify_owner: true
        await notifyOwnerIfNeeded(job, result);

        // Send callback for BrokkrMVP tasks
        if (job.brokkrTaskId) {
          // Parse output data if possible
          let outputData = { raw_response: result };
          try {
            const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
              outputData = JSON.parse(jsonMatch[1]);
            }
          } catch { /* use raw_response */ }

          await sendCallback(job.brokkrTaskId, buildCallbackPayload({
            status: 'completed',
            outputData,
            messages: [{ role: 'agent', content: result.slice(0, 2000) }],
            sessionCode: job.sessionCode,
            usage: { model_id: 'claude-sonnet-4-20250514', duration_ms: durationMs }
          }), 0, job.callbackUrl);
        }
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
 * Cancel a job by session code
 * Handles both pending (removes from queue) and active (kills process) jobs
 * @param {string} sessionCode - The session code to cancel
 * @returns {Object} Result with success status and message
 */
export function cancelJob(sessionCode) {
  // First check if this is the currently active job
  const activeJob = getActiveJob();
  if (activeJob && activeJob.sessionCode === sessionCode) {
    // Kill the running process
    killCurrentProcess();
    // Mark as cancelled
    const cancelled = cancelActiveJob(sessionCode);
    if (cancelled) {
      return {
        success: true,
        status: 'active_cancelled',
        message: `Cancelled active job: ${cancelled.task.slice(0, 50)}...`,
        job: cancelled
      };
    }
  }

  // Check if it's a pending job
  const pendingJob = findPendingJobBySessionCode(sessionCode);
  if (pendingJob) {
    const cancelled = cancelPendingJob(sessionCode);
    if (cancelled) {
      return {
        success: true,
        status: 'pending_cancelled',
        message: `Removed from queue: ${cancelled.task.slice(0, 50)}...`,
        job: cancelled
      };
    }
  }

  // No job found with this session code
  return {
    success: false,
    status: 'not_found',
    message: `No pending or active job found for session /${sessionCode}`,
    job: null
  };
}

/**
 * Reset internal state (for testing only)
 */
export function _resetState() {
  currentSessionCode = null;
  currentProcess = null;
  currentJob = null;
  sendMessageCallback = null;
  isStarting = false;
  dryRunMode = false;
}
