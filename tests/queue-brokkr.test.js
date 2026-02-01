// tests/queue-brokkr.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { enqueue, clearQueue, findJobByBrokkrTaskId, updateJobMessages, getPendingJobs, markActive, getActiveJob } from '../lib/queue.js';

describe('BrokkrMVP Queue Extensions', () => {
  beforeEach(() => {
    clearQueue();
  });

  afterEach(() => {
    clearQueue();
  });

  describe('enqueue with BrokkrMVP fields', () => {
    it('should store brokkrTaskId and inputData', () => {
      const jobId = enqueue({
        task: 'Research equipment',
        chatId: null,
        sessionCode: 'abc',
        source: 'webhook',
        priority: 75,
        brokkrTaskId: '550e8400-e29b-41d4-a716-446655440000',
        taskType: 'equipment_research',
        inputData: { equipment_type: 'laser_cutter' },
        responseSchema: { type: 'object' },
        messages: []
      });

      const jobs = getPendingJobs();
      expect(jobs.length).toBe(1);
      expect(jobs[0].brokkrTaskId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(jobs[0].taskType).toBe('equipment_research');
      expect(jobs[0].inputData.equipment_type).toBe('laser_cutter');
    });
  });

  describe('findJobByBrokkrTaskId', () => {
    it('should find pending job by BrokkrMVP task ID', () => {
      enqueue({
        task: 'Task 1',
        sessionCode: 'aaa',
        source: 'webhook',
        brokkrTaskId: 'uuid-1'
      });
      enqueue({
        task: 'Task 2',
        sessionCode: 'bbb',
        source: 'webhook',
        brokkrTaskId: 'uuid-2'
      });

      const job = findJobByBrokkrTaskId('uuid-2');
      expect(job).not.toBeNull();
      expect(job.task).toBe('Task 2');
      expect(job.brokkrTaskId).toBe('uuid-2');
    });

    it('should find active job by BrokkrMVP task ID', () => {
      const jobId = enqueue({
        task: 'Active task',
        sessionCode: 'ccc',
        source: 'webhook',
        brokkrTaskId: 'uuid-active'
      });
      markActive(jobId);

      const job = findJobByBrokkrTaskId('uuid-active');
      expect(job).not.toBeNull();
      expect(job.status).toBe('active');
    });

    it('should return null for non-existent task ID', () => {
      const job = findJobByBrokkrTaskId('non-existent');
      expect(job).toBeNull();
    });
  });

  describe('updateJobMessages', () => {
    it('should update messages and re-queue active job', () => {
      const jobId = enqueue({
        task: 'Clarification task',
        sessionCode: 'ddd',
        source: 'webhook',
        brokkrTaskId: 'uuid-clarify',
        messages: [{ role: 'agent', content: 'What size?' }]
      });
      markActive(jobId);

      // Verify it's active
      let activeJob = getActiveJob();
      expect(activeJob.brokkrTaskId).toBe('uuid-clarify');

      // Update with clarification
      const newMessages = [
        { role: 'agent', content: 'What size?' },
        { role: 'user', content: '3mm' }
      ];
      const updated = updateJobMessages('uuid-clarify', newMessages);

      expect(updated).toBe(true);

      // Should be back in pending queue
      const pendingJob = findJobByBrokkrTaskId('uuid-clarify');
      expect(pendingJob.status).toBe('pending');
      expect(pendingJob.messages.length).toBe(2);
      expect(pendingJob.messages[1].content).toBe('3mm');

      // Should no longer be active
      activeJob = getActiveJob();
      expect(activeJob).toBeNull();
    });

    it('should return false for non-existent task ID', () => {
      const result = updateJobMessages('non-existent', []);
      expect(result).toBe(false);
    });
  });
});
