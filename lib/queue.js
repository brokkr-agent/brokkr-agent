// lib/queue.js
import { writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Priority levels for job scheduling
export const PRIORITY = {
  CRITICAL: 100,  // WhatsApp /claude, /<session>
  HIGH: 75,       // Webhooks
  NORMAL: 50,     // Cron jobs
  LOW: 25         // Self-maintenance
};

// Allow override via environment variable for testing
const BASE_JOBS_DIR = process.env.JOBS_DIR || join(process.cwd(), 'jobs');
const JOBS_DIR = BASE_JOBS_DIR;
const ACTIVE_DIR = join(JOBS_DIR, 'active');
const COMPLETED_DIR = join(JOBS_DIR, 'completed');
const FAILED_DIR = join(JOBS_DIR, 'failed');

// Ensure directories exist
function ensureDirectories() {
  [JOBS_DIR, ACTIVE_DIR, COMPLETED_DIR, FAILED_DIR].forEach(dir => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });
}

ensureDirectories();

/**
 * Add a job to the queue with priority
 * @param {Object} job - Job object with task, chatId, source, and optional priority
 * @returns {string|null} Job ID or null if duplicate detected
 */
export function enqueue(job) {
  ensureDirectories();

  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;

  const fullJob = {
    id,
    task: job.task,
    chatId: job.chatId,
    priority: job.priority ?? PRIORITY.NORMAL,
    source: job.source || 'unknown',
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    result: null,
    error: null,
    retryCount: 0,
    ...job,  // Allow additional fields to be passed through
    id,  // Ensure id is not overwritten
    status: 'pending',  // Ensure status is not overwritten
    createdAt: new Date().toISOString()  // Ensure createdAt is not overwritten
  };

  // Set priority after spread to ensure it defaults correctly
  fullJob.priority = job.priority ?? PRIORITY.NORMAL;

  const jobFile = join(JOBS_DIR, `${id}.json`);
  writeFileSync(jobFile, JSON.stringify(fullJob, null, 2));

  return id;
}

/**
 * Get the next job to process (highest priority, oldest first)
 * @returns {Object|null} Next job or null if queue is empty
 */
export function getNextJob() {
  const jobs = getPendingJobs();
  return jobs.length > 0 ? jobs[0] : null;
}

/**
 * Get all pending jobs sorted by priority DESC, then createdAt ASC
 * @returns {Array} Array of pending jobs
 */
export function getPendingJobs() {
  ensureDirectories();

  try {
    const files = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
    const jobs = files.map(f => {
      try {
        return JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(j => j !== null);

    // Sort by priority DESC, then createdAt ASC
    return jobs.sort((a, b) => {
      // Higher priority first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Older jobs first when same priority
      return a.createdAt.localeCompare(b.createdAt);
    });
  } catch {
    return [];
  }
}

/**
 * Move a job from pending to active
 * @param {string} id - Job ID
 */
export function markActive(id) {
  ensureDirectories();

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

/**
 * Move a job from active to completed
 * @param {string} id - Job ID
 * @param {*} result - Result of the job
 */
export function markCompleted(id, result) {
  ensureDirectories();

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

/**
 * Move a job from active to failed
 * @param {string} id - Job ID
 * @param {*} error - Error information
 */
export function markFailed(id, error) {
  ensureDirectories();

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

/**
 * Get the currently active job (if any)
 * @returns {Object|null} Active job or null
 */
export function getActiveJob() {
  ensureDirectories();

  try {
    const files = readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) return null;

    // Return the first active job (there should only be one in single-worker mode)
    return JSON.parse(readFileSync(join(ACTIVE_DIR, files[0]), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Get count of pending jobs
 * @returns {number} Number of pending jobs
 */
export function getQueueDepth() {
  ensureDirectories();

  try {
    return readdirSync(JOBS_DIR).filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/**
 * Clean up old completed/failed jobs
 * @param {number} maxAgeMs - Maximum age in milliseconds
 */
export function expireOldJobs(maxAgeMs) {
  ensureDirectories();

  const now = Date.now();

  // Clean up completed jobs
  try {
    const completedFiles = readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json'));
    for (const f of completedFiles) {
      try {
        const job = JSON.parse(readFileSync(join(COMPLETED_DIR, f), 'utf-8'));
        const completedTime = new Date(job.completedAt || job.createdAt).getTime();
        if (now - completedTime >= maxAgeMs) {
          unlinkSync(join(COMPLETED_DIR, f));
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  // Clean up failed jobs
  try {
    const failedFiles = readdirSync(FAILED_DIR).filter(f => f.endsWith('.json'));
    for (const f of failedFiles) {
      try {
        const job = JSON.parse(readFileSync(join(FAILED_DIR, f), 'utf-8'));
        const failedTime = new Date(job.failedAt || job.createdAt).getTime();
        if (now - failedTime >= maxAgeMs) {
          unlinkSync(join(FAILED_DIR, f));
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

/**
 * Clear all jobs from all directories (for testing)
 */
export function clearQueue() {
  const dirs = [JOBS_DIR, ACTIVE_DIR, COMPLETED_DIR, FAILED_DIR];

  for (const dir of dirs) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          try {
            unlinkSync(join(dir, f));
          } catch {
            // Ignore errors when deleting files
          }
        }
      } catch {
        // Ignore errors when reading directory
      }
    }
  }

  // Ensure directories exist after clearing
  ensureDirectories();
}

/**
 * Get count of active jobs
 * @returns {number} Number of active jobs
 */
export function getActiveCount() {
  ensureDirectories();

  try {
    return readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

/**
 * Get queue statistics
 * @returns {Object} Object with counts for each queue state
 */
export function getQueueStats() {
  ensureDirectories();

  return {
    pending: getQueueDepth(),
    active: getActiveCount(),
    completed: readdirSync(COMPLETED_DIR).filter(f => f.endsWith('.json')).length,
    failed: readdirSync(FAILED_DIR).filter(f => f.endsWith('.json')).length
  };
}

/**
 * Find a pending job by session code
 * @param {string} sessionCode - The session code to search for
 * @returns {Object|null} The job if found, null otherwise
 */
export function findPendingJobBySessionCode(sessionCode) {
  ensureDirectories();

  try {
    const files = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const job = JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8'));
        if (job.sessionCode === sessionCode) {
          return job;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return null;
}

/**
 * Cancel a pending job by removing it from the queue
 * @param {string} sessionCode - The session code of the job to cancel
 * @returns {Object|null} The cancelled job if found, null otherwise
 */
export function cancelPendingJob(sessionCode) {
  ensureDirectories();

  const job = findPendingJobBySessionCode(sessionCode);
  if (!job) return null;

  const jobFile = join(JOBS_DIR, `${job.id}.json`);
  const cancelledFile = join(FAILED_DIR, `${job.id}.json`);

  if (existsSync(jobFile)) {
    job.status = 'cancelled';
    job.cancelledAt = new Date().toISOString();
    job.error = 'Cancelled by user';
    writeFileSync(cancelledFile, JSON.stringify(job, null, 2));
    unlinkSync(jobFile);
    return job;
  }

  return null;
}

/**
 * Cancel an active job by moving it to failed
 * @param {string} sessionCode - The session code of the job to cancel
 * @returns {Object|null} The cancelled job if found, null otherwise
 */
export function cancelActiveJob(sessionCode) {
  ensureDirectories();

  try {
    const files = readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const job = JSON.parse(readFileSync(join(ACTIVE_DIR, f), 'utf-8'));
        if (job.sessionCode === sessionCode) {
          const src = join(ACTIVE_DIR, f);
          const dest = join(FAILED_DIR, f);

          job.status = 'cancelled';
          job.cancelledAt = new Date().toISOString();
          job.error = 'Cancelled by user';
          writeFileSync(dest, JSON.stringify(job, null, 2));
          unlinkSync(src);
          return job;
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return null;
}
