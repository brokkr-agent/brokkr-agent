// tests/queue.test.js
import { jest } from '@jest/globals';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'fs';

// Set up test directory before importing queue module
const TEST_JOBS_DIR = join(process.cwd(), 'test-jobs');
process.env.JOBS_DIR = TEST_JOBS_DIR;

// Import queue module after setting env
const queueModule = await import('../lib/queue.js');
const {
  PRIORITY,
  enqueue,
  getNextJob,
  getPendingJobs,
  markActive,
  markCompleted,
  markFailed,
  getActiveJob,
  getQueueDepth,
  expireOldJobs,
  clearQueue
} = queueModule;

describe('Priority Queue', () => {
  beforeEach(() => {
    // Clear queue before each test
    clearQueue();
  });

  afterAll(() => {
    // Clean up test directory after all tests
    clearQueue();
    if (existsSync(TEST_JOBS_DIR)) {
      rmSync(TEST_JOBS_DIR, { recursive: true, force: true });
    }
  });

  describe('PRIORITY constants', () => {
    test('exports CRITICAL priority as 100', () => {
      expect(PRIORITY.CRITICAL).toBe(100);
    });

    test('exports HIGH priority as 75', () => {
      expect(PRIORITY.HIGH).toBe(75);
    });

    test('exports NORMAL priority as 50', () => {
      expect(PRIORITY.NORMAL).toBe(50);
    });

    test('exports LOW priority as 25', () => {
      expect(PRIORITY.LOW).toBe(25);
    });
  });

  describe('enqueue()', () => {
    test('creates job with default NORMAL priority', () => {
      const id = enqueue({
        task: 'Test task',
        chatId: 'user123',
        source: 'whatsapp'
      });

      expect(id).toBeTruthy();
      const jobs = getPendingJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].priority).toBe(PRIORITY.NORMAL);
    });

    test('accepts custom priority', () => {
      const id = enqueue({
        task: 'Critical task',
        chatId: 'user123',
        source: 'whatsapp',
        priority: PRIORITY.CRITICAL
      });

      expect(id).toBeTruthy();
      const jobs = getPendingJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].priority).toBe(PRIORITY.CRITICAL);
    });

    test('creates job with correct structure', () => {
      const id = enqueue({
        task: 'Test task',
        chatId: 'user123',
        source: 'whatsapp',
        priority: PRIORITY.HIGH
      });

      const jobs = getPendingJobs();
      const job = jobs[0];

      expect(job.id).toBe(id);
      expect(job.task).toBe('Test task');
      expect(job.chatId).toBe('user123');
      expect(job.source).toBe('whatsapp');
      expect(job.priority).toBe(PRIORITY.HIGH);
      expect(job.status).toBe('pending');
      expect(job.createdAt).toBeTruthy();
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
      expect(job.failedAt).toBeNull();
      expect(job.result).toBeNull();
      expect(job.error).toBeNull();
      expect(job.retryCount).toBe(0);
    });
  });

  describe('getNextJob()', () => {
    test('returns highest priority job first', () => {
      enqueue({ task: 'Low task', chatId: 'user1', source: 'cron', priority: PRIORITY.LOW });
      enqueue({ task: 'Critical task', chatId: 'user2', source: 'whatsapp', priority: PRIORITY.CRITICAL });
      enqueue({ task: 'Normal task', chatId: 'user3', source: 'cron', priority: PRIORITY.NORMAL });

      const nextJob = getNextJob();
      expect(nextJob.task).toBe('Critical task');
      expect(nextJob.priority).toBe(PRIORITY.CRITICAL);
    });

    test('returns older job when priorities are equal', async () => {
      enqueue({ task: 'First normal', chatId: 'user1', source: 'cron', priority: PRIORITY.NORMAL });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      enqueue({ task: 'Second normal', chatId: 'user2', source: 'cron', priority: PRIORITY.NORMAL });

      const nextJob = getNextJob();
      expect(nextJob.task).toBe('First normal');
    });

    test('returns null when queue is empty', () => {
      const nextJob = getNextJob();
      expect(nextJob).toBeNull();
    });
  });

  describe('getPendingJobs()', () => {
    test('returns jobs sorted by priority DESC, then createdAt ASC', async () => {
      enqueue({ task: 'Low 1', chatId: 'user1', source: 'cron', priority: PRIORITY.LOW });
      await new Promise(resolve => setTimeout(resolve, 5));
      enqueue({ task: 'High 1', chatId: 'user2', source: 'webhook', priority: PRIORITY.HIGH });
      await new Promise(resolve => setTimeout(resolve, 5));
      enqueue({ task: 'Low 2', chatId: 'user3', source: 'cron', priority: PRIORITY.LOW });
      await new Promise(resolve => setTimeout(resolve, 5));
      enqueue({ task: 'Critical 1', chatId: 'user4', source: 'whatsapp', priority: PRIORITY.CRITICAL });

      const jobs = getPendingJobs();

      expect(jobs.length).toBe(4);
      expect(jobs[0].task).toBe('Critical 1');
      expect(jobs[1].task).toBe('High 1');
      expect(jobs[2].task).toBe('Low 1');
      expect(jobs[3].task).toBe('Low 2');
    });

    test('returns empty array when no pending jobs', () => {
      const jobs = getPendingJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('markActive()', () => {
    test('moves job from pending to active directory', () => {
      const id = enqueue({ task: 'Test task', chatId: 'user1', source: 'whatsapp' });

      markActive(id);

      const pendingJobs = getPendingJobs();
      expect(pendingJobs.length).toBe(0);

      const activeJob = getActiveJob();
      expect(activeJob).toBeTruthy();
      expect(activeJob.id).toBe(id);
      expect(activeJob.status).toBe('active');
      expect(activeJob.startedAt).toBeTruthy();
    });
  });

  describe('markCompleted()', () => {
    test('moves job from active to completed directory', () => {
      const id = enqueue({ task: 'Test task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);

      markCompleted(id, 'Task completed successfully');

      const activeJob = getActiveJob();
      expect(activeJob).toBeNull();

      // Verify job is in completed directory
      const completedDir = join(TEST_JOBS_DIR, 'completed');
      const files = readdirSync(completedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      const completedJob = JSON.parse(readFileSync(join(completedDir, files[0]), 'utf-8'));
      expect(completedJob.id).toBe(id);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.completedAt).toBeTruthy();
      expect(completedJob.result).toBe('Task completed successfully');
    });
  });

  describe('markFailed()', () => {
    test('moves job from active to failed directory', () => {
      const id = enqueue({ task: 'Test task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);

      markFailed(id, 'Something went wrong');

      const activeJob = getActiveJob();
      expect(activeJob).toBeNull();

      // Verify job is in failed directory
      const failedDir = join(TEST_JOBS_DIR, 'failed');
      const files = readdirSync(failedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      const failedJob = JSON.parse(readFileSync(join(failedDir, files[0]), 'utf-8'));
      expect(failedJob.id).toBe(id);
      expect(failedJob.status).toBe('failed');
      expect(failedJob.failedAt).toBeTruthy();
      expect(failedJob.error).toBe('Something went wrong');
    });
  });

  describe('getActiveJob()', () => {
    test('returns currently active job', () => {
      const id = enqueue({ task: 'Active task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);

      const activeJob = getActiveJob();
      expect(activeJob).toBeTruthy();
      expect(activeJob.id).toBe(id);
      expect(activeJob.task).toBe('Active task');
    });

    test('returns null when no active job', () => {
      enqueue({ task: 'Pending task', chatId: 'user1', source: 'whatsapp' });

      const activeJob = getActiveJob();
      expect(activeJob).toBeNull();
    });
  });

  describe('getQueueDepth()', () => {
    test('returns count of pending jobs', () => {
      expect(getQueueDepth()).toBe(0);

      enqueue({ task: 'Task 1', chatId: 'user1', source: 'whatsapp' });
      expect(getQueueDepth()).toBe(1);

      enqueue({ task: 'Task 2', chatId: 'user2', source: 'whatsapp' });
      expect(getQueueDepth()).toBe(2);

      enqueue({ task: 'Task 3', chatId: 'user3', source: 'whatsapp' });
      expect(getQueueDepth()).toBe(3);
    });

    test('does not count active jobs', () => {
      const id = enqueue({ task: 'Task 1', chatId: 'user1', source: 'whatsapp' });
      enqueue({ task: 'Task 2', chatId: 'user2', source: 'whatsapp' });

      expect(getQueueDepth()).toBe(2);

      markActive(id);

      expect(getQueueDepth()).toBe(1);
    });
  });

  describe('expireOldJobs()', () => {
    test('cleans up old completed jobs', () => {
      const id = enqueue({ task: 'Old task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);
      markCompleted(id, 'Done');

      // Job should exist in completed
      const completedDir = join(TEST_JOBS_DIR, 'completed');
      let files = readdirSync(completedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      // Expire with 0ms max age should remove all completed jobs
      expireOldJobs(0);

      files = readdirSync(completedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(0);
    });

    test('cleans up old failed jobs', () => {
      const id = enqueue({ task: 'Failed task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);
      markFailed(id, 'Error');

      // Job should exist in failed
      const failedDir = join(TEST_JOBS_DIR, 'failed');
      let files = readdirSync(failedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);

      // Expire with 0ms max age should remove all failed jobs
      expireOldJobs(0);

      files = readdirSync(failedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(0);
    });

    test('does not remove jobs younger than maxAgeMs', () => {
      const id = enqueue({ task: 'Recent task', chatId: 'user1', source: 'whatsapp' });
      markActive(id);
      markCompleted(id, 'Done');

      // Expire with very large max age should keep all jobs
      expireOldJobs(24 * 60 * 60 * 1000); // 24 hours

      const completedDir = join(TEST_JOBS_DIR, 'completed');
      const files = readdirSync(completedDir).filter(f => f.endsWith('.json'));
      expect(files.length).toBe(1);
    });
  });

  describe('clearQueue()', () => {
    test('removes all jobs from all directories', () => {
      // Create jobs in different states
      const id1 = enqueue({ task: 'Pending', chatId: 'user1', source: 'whatsapp' });
      const id2 = enqueue({ task: 'Active', chatId: 'user2', source: 'whatsapp' });
      const id3 = enqueue({ task: 'Completed', chatId: 'user3', source: 'whatsapp' });
      const id4 = enqueue({ task: 'Failed', chatId: 'user4', source: 'whatsapp' });

      markActive(id2);
      markActive(id3);
      markCompleted(id3, 'Done');
      markActive(id4);
      markFailed(id4, 'Error');

      // Verify jobs exist
      expect(getQueueDepth()).toBe(1);
      expect(getActiveJob()).toBeTruthy();

      // Clear queue
      clearQueue();

      // Verify all cleared
      expect(getQueueDepth()).toBe(0);
      expect(getActiveJob()).toBeNull();
      expect(getPendingJobs()).toEqual([]);
    });
  });
});
