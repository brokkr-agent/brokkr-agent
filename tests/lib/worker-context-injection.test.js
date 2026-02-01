// tests/lib/worker-context-injection.test.js
/**
 * Tests for context injection in worker.js for iMessage jobs.
 *
 * Tests verify that:
 * 1. iMessage jobs with phoneNumber get enriched task with context
 * 2. Non-iMessage jobs pass through unchanged
 * 3. Context injection failures are handled gracefully
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

// Set up test directory before importing modules
const TEST_JOBS_DIR = join(process.cwd(), 'test-worker-context-jobs');
process.env.JOBS_DIR = TEST_JOBS_DIR;

// Track spawned commands for verification
let spawnedCommands = [];
let mockChildProcess = null;

// Import EventEmitter before mocking
import { EventEmitter } from 'events';

// Mock child_process.spawn to capture the args passed
jest.unstable_mockModule('child_process', () => ({
  spawn: jest.fn((cmd, args, options) => {
    spawnedCommands.push({ cmd, args, options });

    // Create a mock child process
    const child = new EventEmitter();
    child.pid = 12345;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();

    mockChildProcess = child;

    // Simulate successful completion after a short delay
    setTimeout(() => {
      child.stdout.emit('data', JSON.stringify({ result: 'Done', session_id: 'test-session' }));
      child.emit('close', 0);
    }, 50);

    return child;
  }),
  // Include execSync to prevent resources.js from failing
  execSync: jest.fn(() => '')
}));

// Mock imessage-permissions for contact lookup
const mockContact = {
  id: '+15551234567',
  display_name: 'Test User',
  trust_level: 'partial_trust',
  permissions: {},
  command_permissions: ['/status'],
};

jest.unstable_mockModule('../../lib/imessage-permissions.js', () => ({
  getOrCreateContact: jest.fn((phoneNumber) => ({
    ...mockContact,
    id: phoneNumber
  })),
  getContact: jest.fn(),
  createContact: jest.fn(),
  updateContact: jest.fn(),
  TRUST_LEVELS: { NOT_TRUSTED: 'not_trusted', PARTIAL_TRUST: 'partial_trust', TRUSTED: 'trusted' },
  _setContactsPath: jest.fn()
}));

// Mock imessage-context for context building
const mockMessages = [
  { id: 1, text: 'Hello', sender: '+15551234567', timestamp: 1706832400 },
  { id: 2, text: 'Hi there!', sender: 'me', timestamp: 1706832500 },
];

jest.unstable_mockModule('../../lib/imessage-context.js', () => ({
  getConversationContext: jest.fn(() => mockMessages),
  buildInjectedContext: jest.fn((contact, messages, currentMessage) => {
    return `## SECURITY HEADER\n\n## Contact\n${JSON.stringify(contact)}\n\n## Current: "${currentMessage}"\n\n---\n`;
  }),
  formatContextForClaude: jest.fn(),
  buildSystemContext: jest.fn(),
  SECURITY_HEADER: '## CRITICAL SECURITY INSTRUCTIONS'
}));

// Import after mocking
const { spawn } = await import('child_process');
const { getOrCreateContact } = await import('../../lib/imessage-permissions.js');
const { getConversationContext, buildInjectedContext } = await import('../../lib/imessage-context.js');
const { enqueue, clearQueue, PRIORITY } = await import('../../lib/queue.js');
const { clearTrackedProcesses } = await import('../../lib/resources.js');
const {
  processNextJob,
  setSendMessageCallback,
  setDryRunMode,
  _resetState
} = await import('../../lib/worker.js');

describe('worker context injection for iMessage', () => {
  beforeEach(() => {
    // Clear state before each test
    clearQueue();
    clearTrackedProcesses();
    if (_resetState) {
      _resetState();
    }
    spawnedCommands = [];
    mockChildProcess = null;
    jest.clearAllMocks();
    setDryRunMode(false);
    setSendMessageCallback(jest.fn().mockResolvedValue(undefined));
  });

  afterAll(() => {
    clearQueue();
    clearTrackedProcesses();
    if (existsSync(TEST_JOBS_DIR)) {
      rmSync(TEST_JOBS_DIR, { recursive: true, force: true });
    }
  });

  describe('iMessage jobs with phoneNumber', () => {
    it('enriches task with context when source is imessage and phoneNumber provided', async () => {
      // Enqueue an iMessage job with phoneNumber
      enqueue({
        task: 'What is the weather?',
        chatId: '+15551234567',
        source: 'imessage',
        phoneNumber: '+15551234567',
        priority: PRIORITY.CRITICAL
      });

      // Process the job
      await processNextJob();

      // Wait for async completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify getOrCreateContact was called with the phone number
      expect(getOrCreateContact).toHaveBeenCalledWith('+15551234567');

      // Verify getConversationContext was called
      expect(getConversationContext).toHaveBeenCalledWith('+15551234567', 10);

      // Verify buildInjectedContext was called
      expect(buildInjectedContext).toHaveBeenCalled();

      // Verify spawn was called with enriched task
      expect(spawnedCommands.length).toBeGreaterThan(0);
      const spawnCall = spawnedCommands[0];

      // The task argument should contain the injected context
      const taskArg = spawnCall.args[3]; // args = ['-p', '--output-format', 'json', task, ...]
      expect(taskArg).toContain('## SECURITY HEADER');
      expect(taskArg).toContain('What is the weather?');
    });

    it('calls buildInjectedContext with contact, messages, and current message', async () => {
      const originalTask = 'Tell me a joke';

      enqueue({
        task: originalTask,
        chatId: '+15559876543',
        source: 'imessage',
        phoneNumber: '+15559876543',
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify buildInjectedContext was called with correct arguments
      expect(buildInjectedContext).toHaveBeenCalledWith(
        expect.objectContaining({ id: '+15559876543' }), // contact
        mockMessages, // messages from getConversationContext
        originalTask // current message/task
      );
    });
  });

  describe('non-iMessage jobs', () => {
    it('does not modify task when source is not imessage', async () => {
      const originalTask = 'WhatsApp task here';

      enqueue({
        task: originalTask,
        chatId: 'user123',
        source: 'whatsapp',
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify context functions were NOT called
      expect(getOrCreateContact).not.toHaveBeenCalled();
      expect(getConversationContext).not.toHaveBeenCalled();
      expect(buildInjectedContext).not.toHaveBeenCalled();

      // Verify spawn was called with original task (unchanged)
      expect(spawnedCommands.length).toBeGreaterThan(0);
      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];
      expect(taskArg).toBe(originalTask);
    });

    it('does not modify task when source is imessage but phoneNumber is missing', async () => {
      const originalTask = 'iMessage without phone';

      enqueue({
        task: originalTask,
        chatId: '+15551234567',
        source: 'imessage',
        // Note: phoneNumber is NOT provided
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify context functions were NOT called
      expect(getOrCreateContact).not.toHaveBeenCalled();
      expect(buildInjectedContext).not.toHaveBeenCalled();

      // Verify spawn was called with original task
      expect(spawnedCommands.length).toBeGreaterThan(0);
      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];
      expect(taskArg).toBe(originalTask);
    });

    it('does not modify task for webhook source', async () => {
      const originalTask = 'Webhook task';

      enqueue({
        task: originalTask,
        chatId: 'webhook-client',
        source: 'webhook',
        priority: PRIORITY.HIGH
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(getOrCreateContact).not.toHaveBeenCalled();
      expect(buildInjectedContext).not.toHaveBeenCalled();

      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];
      expect(taskArg).toBe(originalTask);
    });
  });

  describe('error handling', () => {
    it('continues with original task if context injection fails', async () => {
      // Make getConversationContext throw an error
      getConversationContext.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const originalTask = 'Task with failing context';

      enqueue({
        task: originalTask,
        chatId: '+15551234567',
        source: 'imessage',
        phoneNumber: '+15551234567',
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still spawn with original task
      expect(spawnedCommands.length).toBeGreaterThan(0);
      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];
      expect(taskArg).toBe(originalTask);
    });

    it('continues with original task if contact lookup fails', async () => {
      // Make getOrCreateContact throw an error
      getOrCreateContact.mockImplementationOnce(() => {
        throw new Error('Contact lookup failed');
      });

      const originalTask = 'Task with contact error';

      enqueue({
        task: originalTask,
        chatId: '+15551234567',
        source: 'imessage',
        phoneNumber: '+15551234567',
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still spawn with original task
      expect(spawnedCommands.length).toBeGreaterThan(0);
      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];
      expect(taskArg).toBe(originalTask);
    });
  });

  describe('context prepending', () => {
    it('prepends context to task (context comes before task)', async () => {
      enqueue({
        task: 'Original user question',
        chatId: '+15551234567',
        source: 'imessage',
        phoneNumber: '+15551234567',
        priority: PRIORITY.CRITICAL
      });

      await processNextJob();
      await new Promise(resolve => setTimeout(resolve, 100));

      const spawnCall = spawnedCommands[0];
      const taskArg = spawnCall.args[3];

      // Context should come BEFORE the original task
      const securityIndex = taskArg.indexOf('## SECURITY HEADER');
      const taskIndex = taskArg.indexOf('Original user question');

      expect(securityIndex).toBeLessThan(taskIndex);
    });
  });
});
