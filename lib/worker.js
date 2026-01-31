// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getPendingJobs, getActiveCount, recoverStaleJobs } from './queue.js';
import { updateSession } from './sessions.js';
import { recordTaskPattern } from './skill-detector.js';

const MAX_WORKERS = 3;
const TASK_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes max per task
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
        markFailed(job.id, 'Task timed out after 60 minutes');
        await sendResult(job.chatId, `Task timed out: ${job.task.slice(0, 50)}...`);
        recordTaskPattern(job.task, false);
      } else if (code !== 0) {
        markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
        await sendResult(job.chatId, result);
        recordTaskPattern(job.task, false);
      } else {
        markCompleted(job.id, result.slice(0, 10000));
        await sendResult(job.chatId, result);
        recordTaskPattern(job.task, true);

        // Update session timestamp after Claude responds (for /chat jobs)
        if (job.type === 'chat') {
          updateSession(job.chatId, job.sessionId || job.id);
        }
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
