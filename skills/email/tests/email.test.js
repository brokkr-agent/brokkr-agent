// skills/email/tests/email.test.js
// Unit tests for EmailHandler module
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock execSync before importing handler
const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync
}));

// Import after mocking
const { EmailHandler, emailHandler } = await import('../lib/email.js');

describe('EmailHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new EmailHandler();
    mockExecSync.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listInbox', () => {
    it('should return parsed messages from AppleScript output', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { id: 1, subject: 'Test', sender: 'test@example.com', date: '2026-02-01T10:00:00', read: false, flagged: false },
        { id: 2, subject: 'Hello', sender: 'hello@example.com', date: '2026-02-01T11:00:00', read: true, flagged: true }
      ]));

      const result = await handler.listInbox(10);

      expect(result).toHaveLength(2);
      expect(result[0].subject).toBe('Test');
      expect(result[0].read).toBe(false);
      expect(result[1].flagged).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('list-inbox.scpt'),
        expect.any(Object)
      );
    });

    it('should respect batch size limit', async () => {
      mockExecSync.mockReturnValue('[]');

      await handler.listInbox(100);

      // Should be capped to batch_size (50 from config)
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"50"'),
        expect.any(Object)
      );
    });
  });

  describe('readMessage', () => {
    it('should return message content', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        subject: 'Hello',
        content: 'Message body here',
        sender: 'sender@example.com',
        to: 'me@example.com',
        cc: '',
        date_sent: '2026-02-01T10:00:00',
        date_received: '2026-02-01T10:01:00',
        mailbox: 'INBOX',
        read: true,
        flagged: false,
        attachments: ''
      }));

      const result = await handler.readMessage(123);

      expect(result.content).toBe('Message body here');
      expect(result.subject).toBe('Hello');
      expect(result.sender).toBe('sender@example.com');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('read-message.scpt'),
        expect.any(Object)
      );
    });

    it('should throw on message not found', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        error: 'Message not found'
      }));

      await expect(handler.readMessage(999)).rejects.toThrow('Message not found');
    });
  });

  describe('compose', () => {
    it('should create draft when sendNow is false', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'draft',
        to: 'recipient@example.com',
        subject: 'Test Subject'
      }));

      const result = await handler.compose('recipient@example.com', 'Test Subject', 'Body', false);

      expect(result.status).toBe('draft');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('compose.scpt'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"false"'),
        expect.any(Object)
      );
    });

    it('should send when sendNow is true', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'sent',
        to: 'recipient@example.com',
        subject: 'Test Subject'
      }));

      const result = await handler.compose('recipient@example.com', 'Test Subject', 'Body', true);

      expect(result.status).toBe('sent');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"true"'),
        expect.any(Object)
      );
    });
  });

  describe('reply', () => {
    it('should create reply draft', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'draft',
        reply_to: 'sender@example.com',
        subject: 'Re: Original Subject',
        reply_all: false
      }));

      const result = await handler.reply(123, 'Thanks for your email', false, false);

      expect(result.status).toBe('draft');
      expect(result.reply_all).toBe(false);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('reply.scpt'),
        expect.any(Object)
      );
    });

    it('should support reply all', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'draft',
        reply_to: 'sender@example.com',
        subject: 'Re: Original Subject',
        reply_all: true
      }));

      const result = await handler.reply(123, 'Reply to all', true, false);

      expect(result.reply_all).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete message and return status', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'deleted',
        id: 123,
        subject: 'Deleted Email',
        from_mailbox: 'INBOX'
      }));

      const result = await handler.delete(123);

      expect(result.status).toBe('deleted');
      expect(result.id).toBe(123);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('delete.scpt'),
        expect.any(Object)
      );
    });
  });

  describe('search', () => {
    it('should return matching messages', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { id: 1, subject: 'Invoice 001', sender: 'vendor@example.com' },
        { id: 2, subject: 'Invoice 002', sender: 'vendor@example.com' }
      ]));

      const result = await handler.search('invoice');

      expect(result).toHaveLength(2);
      expect(result[0].subject).toBe('Invoice 001');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('search.scpt'),
        expect.any(Object)
      );
    });

    it('should pass field parameter', async () => {
      mockExecSync.mockReturnValue('[]');

      await handler.search('test', 'subject', 10);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"subject"'),
        expect.any(Object)
      );
    });
  });

  describe('flag', () => {
    it('should toggle flag by default', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        flagged: true,
        previous: false
      }));

      const result = await handler.flag(123);

      expect(result.flagged).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"toggle"'),
        expect.any(Object)
      );
    });

    it('should set specific flag value', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        flagged: false,
        previous: true
      }));

      const result = await handler.flag(123, false);

      expect(result.flagged).toBe(false);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('"false"'),
        expect.any(Object)
      );
    });
  });

  describe('markRead', () => {
    it('should mark message as read by default', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        read: true,
        previous: false
      }));

      const result = await handler.markRead(123);

      expect(result.read).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('mark-read.scpt'),
        expect.any(Object)
      );
    });

    it('should mark message as unread', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        read: false,
        previous: true
      }));

      const result = await handler.markRead(123, false);

      expect(result.read).toBe(false);
    });
  });

  describe('listFolders', () => {
    it('should return mailbox list', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { account: 'iCloud', name: 'INBOX', unread: 5, total: 100 },
        { account: 'iCloud', name: 'Sent', unread: 0, total: 50 }
      ]));

      const result = await handler.listFolders();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('INBOX');
      expect(result[0].unread).toBe(5);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('list-folders.scpt'),
        expect.any(Object)
      );
    });
  });

  describe('moveToFolder', () => {
    it('should move message to folder', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'moved',
        id: 123,
        from: 'INBOX',
        to: 'Archive'
      }));

      const result = await handler.moveToFolder(123, 'Archive');

      expect(result.status).toBe('moved');
      expect(result.to).toBe('Archive');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('move-to-folder.scpt'),
        expect.any(Object)
      );
    });
  });

  describe('getInboxSummary', () => {
    it('should return inbox summary with unread count', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { id: 1, subject: 'Unread 1', sender: 'a@example.com', date: '2026-02-01T10:00:00', read: false, flagged: false },
        { id: 2, subject: 'Read 1', sender: 'b@example.com', date: '2026-02-01T09:00:00', read: true, flagged: false },
        { id: 3, subject: 'Unread 2', sender: 'c@example.com', date: '2026-02-01T08:00:00', read: false, flagged: true }
      ]));

      const result = await handler.getInboxSummary();

      expect(result.unread).toBe(2);
      expect(result.total).toBe(3);
      expect(result.recent).toHaveLength(3);
      expect(result.recent[0].subject).toBe('Unread 1');
    });
  });

  describe('triageInbox', () => {
    it('should identify urgent messages by keyword', async () => {
      // First call: listInbox
      mockExecSync.mockReturnValueOnce(JSON.stringify([
        { id: 1, subject: 'URGENT: Action needed', sender: 'a@example.com', read: false, flagged: false },
        { id: 2, subject: 'Regular email', sender: 'b@example.com', read: false, flagged: false }
      ]));
      // Second call: flag for urgent message
      mockExecSync.mockReturnValueOnce(JSON.stringify({ id: 1, flagged: true, previous: false }));

      const result = await handler.triageInbox();

      expect(result.total_scanned).toBe(2);
      expect(result.urgent_count).toBe(1);
      expect(result.urgent_messages[0].id).toBe(1);
      expect(result.urgent_messages[0].reason).toBe('urgent_keyword');
    });

    it('should not flag already flagged messages', async () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify([
        { id: 1, subject: 'URGENT: Already flagged', sender: 'a@example.com', read: false, flagged: true }
      ]));

      const result = await handler.triageInbox();

      // Should only be one call (listInbox), not a second for flag
      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(result.urgent_count).toBe(1);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton emailHandler instance', () => {
      expect(emailHandler).toBeInstanceOf(EmailHandler);
    });
  });

  describe('error handling', () => {
    it('should throw on AppleScript execution error', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('osascript execution failed');
      });

      await expect(handler.listInbox()).rejects.toThrow('osascript execution failed');
    });

    it('should throw on malformed JSON response', async () => {
      mockExecSync.mockReturnValue('not valid json');

      await expect(handler.listInbox()).rejects.toThrow();
    });

    it('should throw on error property in response', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        error: 'Mail.app is not running'
      }));

      await expect(handler.listInbox()).rejects.toThrow('Mail.app is not running');
    });
  });
});
