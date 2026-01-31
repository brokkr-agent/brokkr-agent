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
