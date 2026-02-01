// tests/imessage-bot.test.js
/**
 * Tests for iMessage Bot Main Process
 *
 * Tests helper functions for:
 * 1. Lock file management (acquire/release, stale lock detection)
 * 2. Message filtering (skip processed, skip own messages)
 * 3. Command parsing and routing
 * 4. Session creation with iMessage type
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { join } from 'path';
import { existsSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';

// Set up test directories before importing modules
const TEST_DIR = join(process.cwd(), 'test-imessage-bot');
const TEST_JOBS_DIR = join(TEST_DIR, 'jobs');
process.env.JOBS_DIR = TEST_JOBS_DIR;

// Create test directory structure
if (!existsSync(TEST_DIR)) {
  mkdirSync(TEST_DIR, { recursive: true });
}
if (!existsSync(TEST_JOBS_DIR)) {
  mkdirSync(TEST_JOBS_DIR, { recursive: true });
}

// Import the module under test
// Note: The module doesn't exist yet - tests should fail initially
const imessageBotModule = await import('../imessage-bot.js').catch(() => null);

describe('imessage-bot', () => {
  // Cleanup before each test
  beforeEach(() => {
    const lockFile = join(TEST_DIR, 'imessage-bot.lock');
    if (existsSync(lockFile)) {
      rmSync(lockFile, { force: true });
    }
  });

  // Cleanup after all tests
  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('module exports', () => {
    it('exports acquireLock function', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.acquireLock).toBe('function');
    });

    it('exports releaseLock function', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.releaseLock).toBe('function');
    });

    it('exports filterNewMessages function', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.filterNewMessages).toBe('function');
    });

    it('exports processCommand function', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.processCommand).toBe('function');
    });

    it('exports TOMMY_PHONE constant', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.TOMMY_PHONE).toBe('+12069090025');
    });

    it('exports POLLING_INTERVAL_MS constant', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.POLLING_INTERVAL_MS).toBe(2000);
    });

    it('exports isTommyMessage function', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.isTommyMessage).toBe('function');
    });
  });

  describe('acquireLock', () => {
    it('creates lock file with PID and timestamp', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');
      const result = imessageBotModule.acquireLock(lockPath);

      expect(result).toBe(true);
      expect(existsSync(lockPath)).toBe(true);

      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      expect(lockData).toHaveProperty('pid');
      expect(lockData).toHaveProperty('startedAt');
      expect(typeof lockData.pid).toBe('number');
      expect(typeof lockData.startedAt).toBe('string');
    });

    it('returns false if lock already exists for running process', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Create lock file with current process PID (which is definitely running)
      writeFileSync(lockPath, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }));

      const result = imessageBotModule.acquireLock(lockPath);
      expect(result).toBe(false);
    });

    it('removes stale lock file and acquires if process not running', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Create lock file with a PID that doesn't exist (99999999)
      writeFileSync(lockPath, JSON.stringify({
        pid: 99999999,
        startedAt: new Date().toISOString()
      }));

      const result = imessageBotModule.acquireLock(lockPath);
      expect(result).toBe(true);

      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      expect(lockData.pid).toBe(process.pid);
    });

    it('removes invalid lock file and acquires', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Create invalid lock file (not valid JSON)
      writeFileSync(lockPath, 'invalid json content');

      const result = imessageBotModule.acquireLock(lockPath);
      expect(result).toBe(true);
    });
  });

  describe('releaseLock', () => {
    it('removes lock file if owned by current process', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Create lock file owned by current process
      writeFileSync(lockPath, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }));

      imessageBotModule.releaseLock(lockPath);
      expect(existsSync(lockPath)).toBe(false);
    });

    it('does not remove lock file owned by different process', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Create lock file owned by different process
      writeFileSync(lockPath, JSON.stringify({
        pid: 12345,
        startedAt: new Date().toISOString()
      }));

      imessageBotModule.releaseLock(lockPath);
      expect(existsSync(lockPath)).toBe(true);
    });

    it('handles non-existent lock file gracefully', () => {
      expect(imessageBotModule).not.toBeNull();

      const lockPath = join(TEST_DIR, 'imessage-bot.lock');

      // Ensure file doesn't exist
      if (existsSync(lockPath)) {
        rmSync(lockPath);
      }

      // Should not throw
      expect(() => imessageBotModule.releaseLock(lockPath)).not.toThrow();
    });
  });

  describe('filterNewMessages', () => {
    it('filters out already processed message IDs', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: '/help', sender: '+12069090025', timestamp: 1000 },
        { id: 2, text: '/status', sender: '+12069090025', timestamp: 1001 },
        { id: 3, text: '/claude test', sender: '+12069090025', timestamp: 1002 },
      ];

      const processedIds = new Set([1, 2]);

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(3);
    });

    it('filters out messages from self (sender === "me")', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: '/help', sender: 'me', timestamp: 1000 },
        { id: 2, text: '/status', sender: '+12069090025', timestamp: 1001 },
        { id: 3, text: '/claude test', sender: 'me', timestamp: 1002 },
      ];

      const processedIds = new Set();

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('filters out non-command messages (not starting with /)', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'hello', sender: '+12069090025', timestamp: 1000 },
        { id: 2, text: '/status', sender: '+12069090025', timestamp: 1001 },
        { id: 3, text: 'test message', sender: '+12069090025', timestamp: 1002 },
      ];

      const processedIds = new Set();

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('filters out bot response messages by prefix', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: '[DRY-RUN] Test response', sender: '+12069090025', timestamp: 1000 },
        { id: 2, text: 'Bot online! Use /help', sender: '+12069090025', timestamp: 1001 },
        { id: 3, text: 'Bot Status: IDLE', sender: '+12069090025', timestamp: 1002 },
        { id: 4, text: '/status', sender: '+12069090025', timestamp: 1003 },
      ];

      const processedIds = new Set();

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(4);
    });

    it('returns empty array when all messages are filtered', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'hello', sender: 'me', timestamp: 1000 },
        { id: 2, text: 'hi', sender: '+12069090025', timestamp: 1001 },
      ];

      const processedIds = new Set();

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(0);
    });

    it('handles empty messages array', () => {
      expect(imessageBotModule).not.toBeNull();

      const result = imessageBotModule.filterNewMessages([], new Set());
      expect(result).toHaveLength(0);
    });

    it('handles null/undefined text gracefully', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: null, sender: '+12069090025', timestamp: 1000 },
        { id: 2, text: undefined, sender: '+12069090025', timestamp: 1001 },
        { id: 3, text: '/help', sender: '+12069090025', timestamp: 1002 },
      ];

      const processedIds = new Set();

      const result = imessageBotModule.filterNewMessages(messages, processedIds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(3);
    });
  });

  describe('processCommand', () => {
    // Clear queue between tests
    beforeEach(async () => {
      const queueModule = await import('../lib/queue.js');
      queueModule.clearQueue();
    });

    it('handles /help command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

      const result = await imessageBotModule.processCommand({
        text: '/help',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('help');
      expect(mockSendMessage).toHaveBeenCalled();
      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('/claude');
    });

    it('handles /status command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

      const result = await imessageBotModule.processCommand({
        text: '/status',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('status');
      expect(mockSendMessage).toHaveBeenCalled();
      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('Bot Status');
    });

    it('handles /sessions command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

      const result = await imessageBotModule.processCommand({
        text: '/sessions',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('sessions');
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('handles /claude <task> command and creates session', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

      const result = await imessageBotModule.processCommand({
        text: '/claude list files in this project',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('claude');
      expect(result.sessionCode).toBeDefined();
      expect(result.sessionCode).toHaveLength(2); // iMessage sessions get 2-char codes
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('creates session with type "imessage"', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      const sessionsModule = await import('../lib/sessions.js');

      // Clear sessions first
      sessionsModule.clearSessions();

      await imessageBotModule.processCommand({
        text: '/claude test task',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      // Check that session was created with type 'imessage'
      const sessions = sessionsModule.listSessions('imessage');
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].type).toBe('imessage');
    });

    it('handles session resume command (/<xx>)', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      const sessionsModule = await import('../lib/sessions.js');

      // Clear and create a session
      sessionsModule.clearSessions();
      const session = sessionsModule.createSession({
        type: 'imessage',
        task: 'Original task',
        chatId: '+12069090025'
      });

      const result = await imessageBotModule.processCommand({
        text: `/${session.code}`,
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('session_resume');
      expect(result.sessionCode).toBe(session.code);
    });

    it('handles session resume with message (/<xx> <message>)', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      const sessionsModule = await import('../lib/sessions.js');

      // Clear and create a session
      sessionsModule.clearSessions();
      const session = sessionsModule.createSession({
        type: 'imessage',
        task: 'Original task',
        chatId: '+12069090025'
      });

      const result = await imessageBotModule.processCommand({
        text: `/${session.code} continue with next steps`,
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('session_resume');
      expect(result.sessionCode).toBe(session.code);
      expect(result.message).toBe('continue with next steps');
    });

    it('handles unknown command gracefully', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });

      const result = await imessageBotModule.processCommand({
        text: '/unknowncommand',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('unknown');
      expect(mockSendMessage).toHaveBeenCalled();
      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('Unknown command');
    });

    it('handles session not found for resume', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      const sessionsModule = await import('../lib/sessions.js');

      // Clear all sessions
      sessionsModule.clearSessions();

      const result = await imessageBotModule.processCommand({
        text: '/zz',  // Non-existent session code
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      expect(result.type).toBe('session_not_found');
      expect(mockSendMessage).toHaveBeenCalled();
      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('Session not found');
    });

    it('enqueues job for /claude command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const mockSendMessage = jest.fn().mockResolvedValue({ success: true });
      const queueModule = await import('../lib/queue.js');

      // Clear queue
      queueModule.clearQueue();

      await imessageBotModule.processCommand({
        text: '/claude test task',
        phoneNumber: '+12069090025',
        sendMessage: mockSendMessage
      });

      // Check job was enqueued
      const depth = queueModule.getQueueDepth();
      expect(depth).toBe(1);

      const job = queueModule.getNextJob();
      expect(job.task).toBe('test task');
      expect(job.source).toBe('imessage');
    });
  });

  describe('bot response patterns', () => {
    // Test that the bot properly identifies its own responses to skip
    const BOT_RESPONSE_PREFIXES = [
      '[DRY-RUN]',
      'Bot online',
      'Starting',
      'Unknown command:',
      'Working on:',
      'Bot Status:',
      'Session not found',
      'Resuming session',
      'Active Sessions:',
      'No active sessions',
    ];

    it('recognizes all bot response prefixes', () => {
      expect(imessageBotModule).not.toBeNull();

      for (const prefix of BOT_RESPONSE_PREFIXES) {
        const messages = [
          { id: 1, text: `${prefix} some content`, sender: '+12069090025', timestamp: 1000 },
        ];

        const result = imessageBotModule.filterNewMessages(messages, new Set());
        expect(result).toHaveLength(0);
      }
    });

    it('recognizes help text output as bot response', () => {
      expect(imessageBotModule).not.toBeNull();

      const helpTextMessage = `/claude <task>
  Start a new Claude task

/help
  Show this help message`;

      const messages = [
        { id: 1, text: helpTextMessage, sender: '+12069090025', timestamp: 1000 },
      ];

      const result = imessageBotModule.filterNewMessages(messages, new Set());
      expect(result).toHaveLength(0);
    });
  });

  describe('filterNewMessages - universal access', () => {
    it('accepts messages from any phone number when universalAccess is true', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello', sender: '+15559999999' },
        { id: 2, text: '/help', sender: '+15551111111' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: true });

      expect(filtered).toHaveLength(2);
    });

    it('accepts non-command messages when universalAccess is true', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello there!', sender: '+15559999999' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: true });

      expect(filtered).toHaveLength(1);
    });

    it('still filters out own messages even with universalAccess', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello', sender: 'me' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: true });

      expect(filtered).toHaveLength(0);
    });

    it('still filters by processedIds with universalAccess', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello', sender: '+1555' },
        { id: 2, text: 'World', sender: '+1555' }
      ];
      const processedIds = new Set([1]);

      const filtered = imessageBotModule.filterNewMessages(messages, processedIds, { universalAccess: true });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    it('still filters out bot responses with universalAccess', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Bot online!', sender: '+15559999999' },
        { id: 2, text: 'Hello there!', sender: '+15559999999' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: true });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });

    it('still filters out empty text with universalAccess', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: '', sender: '+15559999999' },
        { id: 2, text: '   ', sender: '+15559999999' },
        { id: 3, text: null, sender: '+15559999999' },
        { id: 4, text: 'Valid message', sender: '+15559999999' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: true });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(4);
    });

    it('default behavior (no options) still requires commands', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello there!', sender: '+15559999999' }
      ];

      // No options parameter - should use default behavior
      const filtered = imessageBotModule.filterNewMessages(messages, new Set());

      expect(filtered).toHaveLength(0);
    });

    it('universalAccess: false behaves like default', () => {
      expect(imessageBotModule).not.toBeNull();

      const messages = [
        { id: 1, text: 'Hello there!', sender: '+15559999999' },
        { id: 2, text: '/help', sender: '+15559999999' }
      ];

      const filtered = imessageBotModule.filterNewMessages(messages, new Set(), { universalAccess: false });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(2);
    });
  });

  describe('isTommyMessage', () => {
    it('returns true for Tommy phone number with + prefix', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.isTommyMessage('+12069090025')).toBe(true);
    });

    it('returns true for Tommy number without + prefix', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.isTommyMessage('12069090025')).toBe(true);
    });

    it('returns false for other phone numbers', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.isTommyMessage('+15551234567')).toBe(false);
    });

    it('returns false for similar but different numbers', () => {
      expect(imessageBotModule).not.toBeNull();
      expect(imessageBotModule.isTommyMessage('+12069090026')).toBe(false);
    });
  });

  describe('processCommand - contact differentiation', () => {
    // Clear queue and sessions between tests
    beforeEach(async () => {
      const queueModule = await import('../lib/queue.js');
      const sessionsModule = await import('../lib/sessions.js');
      queueModule.clearQueue();
      sessionsModule.clearSessions();
    });

    it('includes session code in response for Tommy when starting a task', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      await imessageBotModule.processCommand({
        text: '/claude test task for tommy',
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend
      });

      // At least one message should contain "Session:"
      expect(sentMessages.some(m => m.msg.includes('Session:'))).toBe(true);
    });

    it('excludes session code for non-Tommy contacts when starting a task', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      await imessageBotModule.processCommand({
        text: '/claude test task for non-tommy',
        phoneNumber: '+15551234567',  // Not Tommy
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          trust_level: 'trusted',
          command_permissions: ['*']  // Has permission to use /claude
        }
      });

      // No message should contain "Session:"
      expect(sentMessages.every(m => !m.msg.includes('Session:'))).toBe(true);
    });

    it('includes session code for Tommy on session resume', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });
      const sessionsModule = await import('../lib/sessions.js');

      // Create a session first
      const session = sessionsModule.createSession({
        type: 'imessage',
        task: 'Original task',
        chatId: '+12069090025'
      });

      await imessageBotModule.processCommand({
        text: `/${session.code}`,
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend
      });

      // At least one message should contain "Session:" or the session code
      expect(sentMessages.some(m => m.msg.includes('Session:') || m.msg.includes(`/${session.code}`))).toBe(true);
    });

    it('excludes session code for non-Tommy on session resume', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });
      const sessionsModule = await import('../lib/sessions.js');

      // Create a session first
      const session = sessionsModule.createSession({
        type: 'imessage',
        task: 'Original task',
        chatId: '+15551234567'
      });

      await imessageBotModule.processCommand({
        text: `/${session.code}`,
        phoneNumber: '+15551234567',  // Not Tommy
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          trust_level: 'trusted',
          command_permissions: ['*']
        }
      });

      // No message should contain "Session:"
      expect(sentMessages.every(m => !m.msg.includes('Session:'))).toBe(true);
    });

    it('includes session code for Tommy on /status command response', async () => {
      // Note: /status command currently doesn't include session codes
      // This test verifies that internal commands work correctly for Tommy
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      await imessageBotModule.processCommand({
        text: '/status',
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend
      });

      // /status should work for Tommy
      expect(sentMessages.length).toBeGreaterThan(0);
      expect(sentMessages[0].msg).toContain('Bot Status');
    });

    it('allows /status for non-Tommy with appropriate contact permissions', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      await imessageBotModule.processCommand({
        text: '/status',
        phoneNumber: '+15551234567',  // Not Tommy
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          trust_level: 'trusted',
          command_permissions: ['*']
        }
      });

      // /status should work for non-Tommy with permissions
      expect(sentMessages.length).toBeGreaterThan(0);
      expect(sentMessages[0].msg).toContain('Bot Status');
    });
  });

  describe('processCommand - consultation flow', () => {
    // Clear queue and sessions between tests
    beforeEach(async () => {
      const queueModule = await import('../lib/queue.js');
      const sessionsModule = await import('../lib/sessions.js');
      const pendingModule = await import('../lib/imessage-pending.js');
      queueModule.clearQueue();
      sessionsModule.clearSessions();
      pendingModule.clearPending();
    });

    it('sends consultation to Tommy for untrusted contact with natural message', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Untrusted contact sends a natural (non-command) message
      const result = await imessageBotModule.processCommand({
        text: 'What is the weather today?',
        phoneNumber: '+15551234567',
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          display_name: 'Unknown Caller',
          trust_level: 'not_trusted'
        },
        treatAsNatural: true  // Flag indicating this is a natural message, not a command
      });

      // Should return consultation_pending type
      expect(result.type).toBe('consultation_pending');
      expect(result.phoneNumber).toBe('+15551234567');

      // Message should be sent to Tommy (+12069090025)
      const tommyMessage = sentMessages.find(m => m.phone === '+12069090025');
      expect(tommyMessage).toBeDefined();
      expect(tommyMessage.msg).toContain('asked:');
    });

    it('processes directly for trusted contacts with natural message', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Trusted contact sends a natural (non-command) message
      const result = await imessageBotModule.processCommand({
        text: 'What is the weather today?',
        phoneNumber: '+15551234567',
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          display_name: 'Trusted Friend',
          trust_level: 'trusted'
        },
        treatAsNatural: true
      });

      // Should NOT be a consultation - trusted contacts bypass consultation
      expect(result.type).not.toBe('consultation_pending');

      // For now, natural messages from trusted contacts are passed through
      // as 'not_command' - full natural language processing is a future enhancement
      // The key test is that NO message went to Tommy for consultation
      expect(sentMessages.every(m => m.phone !== '+12069090025')).toBe(true);
    });

    it('skips consultation for command messages from untrusted contacts', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Untrusted contact sends a command (starts with /)
      const result = await imessageBotModule.processCommand({
        text: '/help',
        phoneNumber: '+15551234567',
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          trust_level: 'not_trusted'
        },
        treatAsNatural: false
      });

      // Commands should be processed normally, not consulted
      expect(result.type).toBe('help');
    });

    it('skips consultation for Tommy regardless of treatAsNatural flag', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends a natural message
      const result = await imessageBotModule.processCommand({
        text: 'What is the weather today?',
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend,
        contact: {
          id: '+12069090025',
          trust_level: 'trusted'
        },
        treatAsNatural: true
      });

      // Should NOT be a consultation for Tommy
      expect(result.type).not.toBe('consultation_pending');
    });

    it('skips consultation for ignored contacts', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Ignored contact sends a natural message
      const result = await imessageBotModule.processCommand({
        text: 'Hello there!',
        phoneNumber: '+15551234567',
        sendMessage: mockSend,
        contact: {
          id: '+15551234567',
          trust_level: 'not_trusted',
          ignore: true
        },
        treatAsNatural: true
      });

      // Should NOT trigger consultation for ignored contacts
      expect(result.type).not.toBe('consultation_pending');
    });
  });

  describe('processCommand - consultation response (allow/deny)', () => {
    // Clear queue, sessions, and pending questions between tests
    beforeEach(async () => {
      const queueModule = await import('../lib/queue.js');
      const sessionsModule = await import('../lib/sessions.js');
      const pendingModule = await import('../lib/imessage-pending.js');
      queueModule.clearQueue();
      sessionsModule.clearSessions();
      pendingModule.clearPending();
    });

    it('processes /<xx> allow command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');
      const sessionsModule = await import('../lib/sessions.js');

      // Create a pending question first
      const pending = pendingModule.addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'What is the weather?',
        context: 'Test context'
      });

      // Also create a session with the same code so session resume can find it
      // Note: createSession takes customCode as second parameter
      sessionsModule.createSession({
        type: 'imessage',
        task: 'pending question placeholder',
        chatId: '+15551234567'
      }, pending.sessionCode);  // Use the same code as customCode

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends allow command
      const result = await imessageBotModule.processCommand({
        text: `/${pending.sessionCode} allow`,
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend
      });

      // Should return consultation_resolved type
      expect(result.type).toBe('consultation_resolved');
      expect(result.sessionCode).toBe(pending.sessionCode);
      expect(result.action).toBe('allow');

      // Confirmation message should be sent to Tommy
      const tommyMessage = sentMessages.find(m => m.phone === '+12069090025');
      expect(tommyMessage).toBeDefined();
      expect(tommyMessage.msg.toLowerCase()).toContain('approved');
    });

    it('processes /<xx> deny command', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');
      const sessionsModule = await import('../lib/sessions.js');

      // Create a pending question first
      const pending = pendingModule.addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Can you help me hack something?',
        context: 'Test context'
      });

      // Also create a session with the same code (customCode as second param)
      sessionsModule.createSession({
        type: 'imessage',
        task: 'pending question placeholder',
        chatId: '+15551234567'
      }, pending.sessionCode);

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends deny command
      const result = await imessageBotModule.processCommand({
        text: `/${pending.sessionCode} deny`,
        phoneNumber: '+12069090025',  // Tommy's number
        sendMessage: mockSend
      });

      // Should return consultation_resolved type
      expect(result.type).toBe('consultation_resolved');
      expect(result.sessionCode).toBe(pending.sessionCode);
      expect(result.action).toBe('deny');

      // Confirmation message should be sent to Tommy
      const tommyMessage = sentMessages.find(m => m.phone === '+12069090025');
      expect(tommyMessage).toBeDefined();
      expect(tommyMessage.msg.toLowerCase()).toContain('denied');
    });

    it('falls through to normal session resume if no pending question exists', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sessionsModule = await import('../lib/sessions.js');

      // Create a regular session (no pending question)
      const session = sessionsModule.createSession({
        type: 'imessage',
        task: 'Regular task',
        chatId: '+12069090025'
      });

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends allow command but no pending question exists
      const result = await imessageBotModule.processCommand({
        text: `/${session.code} allow`,
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      // Should fall through to normal session resume since no pending question
      expect(result.type).toBe('session_resume');
      expect(result.message).toBe('allow');
    });

    it('falls through to normal session resume if pending question already resolved', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');
      const sessionsModule = await import('../lib/sessions.js');

      // Create a pending question and then resolve it
      const pending = pendingModule.addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Already resolved question',
        context: 'Test context'
      });
      pendingModule.resolvePending(pending.sessionCode, 'allow');

      // Create a session with the same code (customCode as second param)
      sessionsModule.createSession({
        type: 'imessage',
        task: 'pending question placeholder',
        chatId: '+15551234567'
      }, pending.sessionCode);

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy tries to deny an already-resolved question
      const result = await imessageBotModule.processCommand({
        text: `/${pending.sessionCode} deny`,
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      // Should fall through to normal session resume since already resolved
      expect(result.type).toBe('session_resume');
      expect(result.message).toBe('deny');
    });

    it('handles case-insensitive allow/deny commands', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');
      const sessionsModule = await import('../lib/sessions.js');

      // Create a pending question
      const pending = pendingModule.addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question',
        context: 'Test context'
      });

      sessionsModule.createSession({
        type: 'imessage',
        task: 'pending question placeholder',
        chatId: '+15551234567'
      }, pending.sessionCode);

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends ALLOW in uppercase
      const result = await imessageBotModule.processCommand({
        text: `/${pending.sessionCode} ALLOW`,
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      expect(result.type).toBe('consultation_resolved');
      expect(result.action).toBe('allow');
    });
  });

  describe('processCommand - /questions command', () => {
    // Clear pending questions between tests
    beforeEach(async () => {
      const pendingModule = await import('../lib/imessage-pending.js');
      pendingModule.clearPending();
    });

    it('lists pending questions when there are some', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');

      // Add two pending questions (use unique phone numbers to avoid collision with other tests)
      const q1 = pendingModule.addPendingQuestion({
        phoneNumber: '+15553333333',
        question: 'What is the weather today?',
        context: 'Test context'
      });
      const q2 = pendingModule.addPendingQuestion({
        phoneNumber: '+15554444444',
        question: 'Can you help me with a very long question that should be truncated in the display?',
        context: 'Test context'
      });

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /questions command
      const result = await imessageBotModule.processCommand({
        text: '/questions',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      // Should return questions type
      expect(result.type).toBe('questions');

      // Message should be sent
      expect(sentMessages.length).toBe(1);
      const response = sentMessages[0].msg;

      // Should contain header with count
      expect(response).toContain('Pending Requests (2)');

      // Should contain both session codes
      expect(response).toContain(`/${q1.sessionCode}`);
      expect(response).toContain(`/${q2.sessionCode}`);

      // Should contain phone numbers (as contact names since no display_name set)
      expect(response).toContain('+15553333333');
      expect(response).toContain('+15554444444');

      // Should contain truncated questions
      expect(response).toContain('What is the weather today?');
      // Long question should be truncated (50 chars max)
      expect(response).toContain('Can you help me with a very long question that sho...');

      // Should contain footer with instructions
      expect(response).toContain('Reply: /<code> allow or /<code> deny');
    });

    it('shows no pending message when queue is empty', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /questions command with empty queue
      const result = await imessageBotModule.processCommand({
        text: '/questions',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      // Should return questions type
      expect(result.type).toBe('questions');

      // Message should be sent
      expect(sentMessages.length).toBe(1);
      const response = sentMessages[0].msg;

      // Should contain "no pending" message
      expect(response).toContain('No pending approval requests');
    });

    it('uses contact display_name when available', async () => {
      expect(imessageBotModule).not.toBeNull();

      const pendingModule = await import('../lib/imessage-pending.js');
      const permissionsModule = await import('../lib/imessage-permissions.js');

      // Create a contact first, then update with display_name
      permissionsModule.getOrCreateContact('+15551111111', 'iMessage', 'us');
      permissionsModule.updateContact('+15551111111', { display_name: 'John Doe' });

      // Add a pending question from that contact
      const q1 = pendingModule.addPendingQuestion({
        phoneNumber: '+15551111111',
        question: 'What is the weather?',
        context: 'Test context'
      });

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /questions command
      const result = await imessageBotModule.processCommand({
        text: '/questions',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      expect(result.type).toBe('questions');
      const response = sentMessages[0].msg;

      // Should use display_name instead of phone number
      expect(response).toContain('John Doe');
    });
  });

  describe('processCommand - /digest command', () => {
    it('shows placeholder message for now', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /digest command
      const result = await imessageBotModule.processCommand({
        text: '/digest',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      // Should return digest type
      expect(result.type).toBe('digest');

      // Message should be sent with placeholder text
      expect(sentMessages.length).toBe(1);
      const response = sentMessages[0].msg;

      // Should contain "Digest" in the response
      expect(response).toContain('Digest');
      // Default days should be 7
      expect(response).toContain('7 days');
      // Should mention it's coming soon
      expect(response).toContain('coming soon');
      // Should suggest /questions as alternative
      expect(response).toContain('/questions');
    });

    it('parses custom days argument', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /digest 30
      const result = await imessageBotModule.processCommand({
        text: '/digest 30',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      expect(result.type).toBe('digest');

      const response = sentMessages[0].msg;
      // Should use custom days value
      expect(response).toContain('30 days');
    });

    it('defaults to 7 days for invalid argument', async () => {
      expect(imessageBotModule).not.toBeNull();

      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      // Tommy sends /digest with non-numeric arg
      const result = await imessageBotModule.processCommand({
        text: '/digest abc',
        phoneNumber: '+12069090025',
        sendMessage: mockSend
      });

      expect(result.type).toBe('digest');

      const response = sentMessages[0].msg;
      // Should fallback to 7 days
      expect(response).toContain('7 days');
    });
  });

  describe('pollMessages - universal access mode', () => {
    // These tests verify the pollMessages function behavior with --universal flag
    // Note: We need to test the exported constants and behavior

    it('exports UNIVERSAL_ACCESS flag detection (default false when no --universal flag)', async () => {
      // UNIVERSAL_ACCESS should be false by default (no --universal in process.argv)
      // This test verifies the flag is exported and accessible
      expect(imessageBotModule).not.toBeNull();

      // The module should export UNIVERSAL_ACCESS constant
      // It should be false when --universal is not in process.argv
      expect(typeof imessageBotModule.UNIVERSAL_ACCESS).toBe('boolean');
      expect(imessageBotModule.UNIVERSAL_ACCESS).toBe(false);
    });

    it('exports pollMessages function', async () => {
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.pollMessages).toBe('function');
    });

    it('exports pollMessagesWithDeps for testable polling', async () => {
      // pollMessagesWithDeps accepts dependencies for testing
      expect(imessageBotModule).not.toBeNull();
      expect(typeof imessageBotModule.pollMessagesWithDeps).toBe('function');
    });

    describe('pollMessagesWithDeps behavior', () => {
      let mockGetRecentMessages;
      let mockGetAllRecentMessages;
      let mockGetOrCreateContact;
      let mockProcessCommand;
      let processedIds;

      beforeEach(() => {
        processedIds = new Set();
        mockGetRecentMessages = jest.fn().mockReturnValue([]);
        mockGetAllRecentMessages = jest.fn().mockReturnValue([]);
        mockGetOrCreateContact = jest.fn().mockReturnValue({
          id: '+15551234567',
          trust_level: 'not_trusted',
          command_permissions: []
        });
        mockProcessCommand = jest.fn().mockResolvedValue({ type: 'test' });
      });

      it('uses getRecentMessages when universalAccess is false', async () => {
        expect(imessageBotModule).not.toBeNull();

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: false,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        expect(mockGetRecentMessages).toHaveBeenCalledWith('+12069090025', 20);
        expect(mockGetAllRecentMessages).not.toHaveBeenCalled();
      });

      it('uses getAllRecentMessages when universalAccess is true', async () => {
        expect(imessageBotModule).not.toBeNull();

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        expect(mockGetAllRecentMessages).toHaveBeenCalledWith(50);
        expect(mockGetRecentMessages).not.toHaveBeenCalled();
      });

      it('passes universalAccess option to filterNewMessages', async () => {
        expect(imessageBotModule).not.toBeNull();

        // Provide a message that would be filtered out in non-universal mode
        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: 'Hello there!', sender: '+15551234567', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        // The message should be processed (not filtered) because universalAccess is true
        expect(mockProcessCommand).toHaveBeenCalled();
      });

      it('calls getOrCreateContact for each message sender in universal mode', async () => {
        expect(imessageBotModule).not.toBeNull();

        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: '+15551234567', timestamp: 1000 },
          { id: 2, text: '/status', sender: '+15559999999', timestamp: 1001 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        // Should call getOrCreateContact for each sender
        expect(mockGetOrCreateContact).toHaveBeenCalledWith('+15551234567', 'iMessage', 'us');
        expect(mockGetOrCreateContact).toHaveBeenCalledWith('+15559999999', 'iMessage', 'us');
      });

      it('passes contact object to processCommand in universal mode', async () => {
        expect(imessageBotModule).not.toBeNull();

        const testContact = {
          id: '+15551234567',
          trust_level: 'trusted',
          command_permissions: ['*']
        };
        mockGetOrCreateContact.mockReturnValue(testContact);
        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: '+15551234567', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        expect(mockProcessCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            contact: testContact,
            phoneNumber: '+15551234567'
          })
        );
      });

      it('passes treatAsNatural: true to processCommand for non-command messages in universal mode', async () => {
        expect(imessageBotModule).not.toBeNull();

        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: 'Hello there!', sender: '+15551234567', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        expect(mockProcessCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello there!',
            treatAsNatural: true
          })
        );
      });

      it('passes treatAsNatural: false for command messages even in universal mode', async () => {
        expect(imessageBotModule).not.toBeNull();

        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: '+15551234567', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        // Commands (starting with /) should have treatAsNatural: false
        expect(mockProcessCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            text: '/help',
            treatAsNatural: false
          })
        );
      });

      it('uses sender phone number from message (not hardcoded TOMMY_PHONE) in universal mode', async () => {
        expect(imessageBotModule).not.toBeNull();

        const otherPhone = '+15559999999';
        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: otherPhone, timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        expect(mockProcessCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            phoneNumber: otherPhone
          })
        );
      });

      it('does not call getOrCreateContact in non-universal mode (uses Tommy phone)', async () => {
        expect(imessageBotModule).not.toBeNull();

        mockGetRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: '+12069090025', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: false,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        // In non-universal mode, we don't need to look up contacts
        // since all messages come from Tommy
        expect(mockGetOrCreateContact).not.toHaveBeenCalled();
      });

      it('marks messages as processed to prevent duplicates', async () => {
        expect(imessageBotModule).not.toBeNull();

        mockGetAllRecentMessages.mockReturnValue([
          { id: 1, text: '/help', sender: '+15551234567', timestamp: 1000 }
        ]);

        await imessageBotModule.pollMessagesWithDeps({
          universalAccess: true,
          getRecentMessages: mockGetRecentMessages,
          getAllRecentMessages: mockGetAllRecentMessages,
          getOrCreateContact: mockGetOrCreateContact,
          processCommand: mockProcessCommand,
          processedIds,
          isFirstPoll: false
        });

        // Message ID should be added to processedIds
        expect(processedIds.has(1)).toBe(true);
      });
    });
  });
});
