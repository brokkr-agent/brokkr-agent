// tests/cancel.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { enqueue, clearQueue, PRIORITY, findPendingJobBySessionCode, cancelPendingJob, cancelActiveJob, markActive, getActiveJob } from '../lib/queue.js';
import { cancelJob, _resetState } from '../lib/worker.js';

describe('Cancel Job Functionality', () => {
  beforeEach(() => {
    clearQueue();
    _resetState();
  });

  afterEach(() => {
    clearQueue();
  });

  describe('findPendingJobBySessionCode', () => {
    it('should find a pending job by session code', () => {
      enqueue({
        task: 'test task',
        chatId: 'test-chat',
        sessionCode: 'k7',
        priority: PRIORITY.CRITICAL
      });

      const job = findPendingJobBySessionCode('k7');
      expect(job).not.toBeNull();
      expect(job.sessionCode).toBe('k7');
      expect(job.task).toBe('test task');
    });

    it('should return null for non-existent session code', () => {
      enqueue({
        task: 'test task',
        chatId: 'test-chat',
        sessionCode: 'k7',
        priority: PRIORITY.CRITICAL
      });

      const job = findPendingJobBySessionCode('xx');
      expect(job).toBeNull();
    });

    it('should return null when queue is empty', () => {
      const job = findPendingJobBySessionCode('k7');
      expect(job).toBeNull();
    });
  });

  describe('cancelPendingJob', () => {
    it('should cancel a pending job and move to failed', () => {
      enqueue({
        task: 'test task',
        chatId: 'test-chat',
        sessionCode: 'k7',
        priority: PRIORITY.CRITICAL
      });

      const cancelled = cancelPendingJob('k7');
      expect(cancelled).not.toBeNull();
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.error).toBe('Cancelled by user');
      expect(cancelled.cancelledAt).toBeDefined();

      // Job should no longer be pending
      const stillPending = findPendingJobBySessionCode('k7');
      expect(stillPending).toBeNull();
    });

    it('should return null for non-existent session code', () => {
      const cancelled = cancelPendingJob('xx');
      expect(cancelled).toBeNull();
    });
  });

  describe('cancelActiveJob', () => {
    it('should cancel an active job and move to failed', () => {
      const jobId = enqueue({
        task: 'test task',
        chatId: 'test-chat',
        sessionCode: 'abc',
        priority: PRIORITY.HIGH
      });

      // Mark the job as active
      markActive(jobId);

      // Verify it's active
      const activeJob = getActiveJob();
      expect(activeJob).not.toBeNull();
      expect(activeJob.sessionCode).toBe('abc');

      // Cancel it
      const cancelled = cancelActiveJob('abc');
      expect(cancelled).not.toBeNull();
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.error).toBe('Cancelled by user');

      // Job should no longer be active
      const stillActive = getActiveJob();
      expect(stillActive).toBeNull();
    });

    it('should return null for non-existent active job', () => {
      const cancelled = cancelActiveJob('xxx');
      expect(cancelled).toBeNull();
    });
  });

  describe('cancelJob (worker)', () => {
    it('should cancel a pending job successfully', () => {
      enqueue({
        task: 'test task',
        chatId: 'test-chat',
        sessionCode: 'k7',
        priority: PRIORITY.CRITICAL
      });

      const result = cancelJob('k7');
      expect(result.success).toBe(true);
      expect(result.status).toBe('pending_cancelled');
      expect(result.message).toContain('Removed from queue');
    });

    it('should return not found for non-existent session', () => {
      const result = cancelJob('zz');
      expect(result.success).toBe(false);
      expect(result.status).toBe('not_found');
      expect(result.message).toContain('No pending or active job found');
    });

    it('should handle active job cancellation', () => {
      const jobId = enqueue({
        task: 'long running task',
        chatId: 'test-chat',
        sessionCode: 'xy',
        priority: PRIORITY.CRITICAL
      });

      // Mark as active (simulating worker picking it up)
      markActive(jobId);

      // Cancel should work on active job
      const result = cancelJob('xy');
      expect(result.success).toBe(true);
      expect(result.status).toBe('active_cancelled');
      expect(result.message).toContain('Cancelled active job');
    });
  });
});
