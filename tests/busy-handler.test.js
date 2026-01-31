// tests/busy-handler.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the worker and queue modules
jest.unstable_mockModule('../lib/worker.js', () => ({
  isProcessing: jest.fn(),
  getCurrentTask: jest.fn(),
  getCurrentSessionCode: jest.fn()
}));

jest.unstable_mockModule('../lib/queue.js', () => ({
  getQueueDepth: jest.fn()
}));

// Import mocked modules
const { isProcessing, getCurrentTask, getCurrentSessionCode } = await import('../lib/worker.js');
const { getQueueDepth } = await import('../lib/queue.js');

// Import module under test after mocks are set up
const { getBusyMessage, shouldSendBusyMessage, getStatusMessage } = await import('../lib/busy-handler.js');

describe('busy-handler', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.resetAllMocks();
  });

  describe('getBusyMessage', () => {
    it('returns message with truncated task when task is longer than 50 chars', () => {
      const longTask = 'This is a very long task description that exceeds fifty characters limit';
      getCurrentTask.mockReturnValue(longTask);

      const message = getBusyMessage();

      expect(message).toContain('Working on:');
      expect(message).toContain(longTask.slice(0, 50));
      expect(message).toContain('...');
    });

    it('returns message with full task when task is 50 chars or less', () => {
      const shortTask = 'Short task';
      getCurrentTask.mockReturnValue(shortTask);

      const message = getBusyMessage();

      expect(message).toContain('Working on:');
      expect(message).toContain(shortTask);
      // Should not have trailing ... in the task part
      expect(message).toContain(`"${shortTask}"`);
    });

    it('returns message with "a task" when no current task', () => {
      getCurrentTask.mockReturnValue(null);

      const message = getBusyMessage();

      expect(message).toContain('Working on: "a task"');
    });

    it('includes queue position when provided and greater than 0', () => {
      getCurrentTask.mockReturnValue('Some task');

      const message = getBusyMessage(3);

      expect(message).toContain('queued (#3)');
      expect(message).toContain('will run next');
    });

    it('includes prioritized message when queue position is 0', () => {
      getCurrentTask.mockReturnValue('Some task');

      const message = getBusyMessage(0);

      expect(message).toContain('will be prioritized once complete');
    });

    it('includes prioritized message when queue position is null', () => {
      getCurrentTask.mockReturnValue('Some task');

      const message = getBusyMessage(null);

      expect(message).toContain('will be prioritized once complete');
    });

    it('includes prioritized message when queue position is not provided', () => {
      getCurrentTask.mockReturnValue('Some task');

      const message = getBusyMessage();

      expect(message).toContain('will be prioritized once complete');
    });
  });

  describe('shouldSendBusyMessage', () => {
    it('returns true when bot is processing', () => {
      isProcessing.mockReturnValue(true);

      expect(shouldSendBusyMessage()).toBe(true);
    });

    it('returns false when bot is not processing', () => {
      isProcessing.mockReturnValue(false);

      expect(shouldSendBusyMessage()).toBe(false);
    });
  });

  describe('getStatusMessage', () => {
    it('returns IDLE status when not processing', () => {
      isProcessing.mockReturnValue(false);
      getCurrentTask.mockReturnValue(null);
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain('Bot Status: IDLE');
      expect(message).toContain('Queue: 0 pending');
    });

    it('returns BUSY status when processing', () => {
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue('Current work');
      getQueueDepth.mockReturnValue(2);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain('Bot Status: BUSY');
      expect(message).toContain('Current:');
      expect(message).toContain('Queue: 2 pending');
    });

    it('includes current task when processing', () => {
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue('Working on something important');
      getQueueDepth.mockReturnValue(1);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain('Current: Working on something important');
    });

    it('truncates current task to 50 characters', () => {
      const longTask = 'This is a very long task description that exceeds fifty characters limit by a lot';
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue(longTask);
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain(`Current: ${longTask.slice(0, 50)}...`);
    });

    it('includes session code when processing with active session', () => {
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue('Task in session');
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue('abc123');

      const message = getStatusMessage();

      expect(message).toContain('Session: abc123');
    });

    it('does not include session when not processing', () => {
      isProcessing.mockReturnValue(false);
      getCurrentTask.mockReturnValue(null);
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue('abc123');

      const message = getStatusMessage();

      expect(message).not.toContain('Session:');
    });

    it('does not include session when session code is null', () => {
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue('Some task');
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).not.toContain('Session:');
    });

    it('does not include current task line when currentTask is null while processing', () => {
      // Edge case: processing flag is true but no task (shouldn't happen normally)
      isProcessing.mockReturnValue(true);
      getCurrentTask.mockReturnValue(null);
      getQueueDepth.mockReturnValue(0);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain('Bot Status: BUSY');
      expect(message).not.toContain('Current:');
    });

    it('displays queue depth correctly', () => {
      isProcessing.mockReturnValue(false);
      getCurrentTask.mockReturnValue(null);
      getQueueDepth.mockReturnValue(5);
      getCurrentSessionCode.mockReturnValue(null);

      const message = getStatusMessage();

      expect(message).toContain('Queue: 5 pending');
    });
  });
});
