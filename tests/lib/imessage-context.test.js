// tests/lib/imessage-context.test.js
/**
 * Tests for the iMessage context retrieval module.
 *
 * This module retrieves conversation history from chat.db and formats it for Claude.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock imessage-reader module
jest.unstable_mockModule('../../lib/imessage-reader.js', () => ({
  getRecentMessages: jest.fn(() => [
    { id: 3, text: 'Latest message', timestamp: 1706832600, sender: '+15551234567' },
    { id: 2, text: 'Previous message', timestamp: 1706832500, sender: 'me' },
    { id: 1, text: 'First message', timestamp: 1706832400, sender: '+15551234567' },
  ]),
}));

// Import after mocking
const { getRecentMessages } = await import('../../lib/imessage-reader.js');
const {
  getConversationContext,
  formatContextForClaude,
  buildSystemContext,
} = await import('../../lib/imessage-context.js');

describe('imessage-context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConversationContext', () => {
    it('returns messages in chronological order (oldest first)', () => {
      const context = getConversationContext('+15551234567', 10);

      expect(context).toHaveLength(3);
      expect(context[0].text).toBe('First message');
      expect(context[1].text).toBe('Previous message');
      expect(context[2].text).toBe('Latest message');
    });

    it('calls getRecentMessages with correct parameters', () => {
      getConversationContext('+15551234567', 20);

      expect(getRecentMessages).toHaveBeenCalledWith('+15551234567', 20);
    });

    it('uses default limit of 20 when not specified', () => {
      getConversationContext('+15551234567');

      expect(getRecentMessages).toHaveBeenCalledWith('+15551234567', 20);
    });

    it('handles empty message list', () => {
      getRecentMessages.mockReturnValueOnce([]);

      const context = getConversationContext('+15551234567', 10);

      expect(context).toEqual([]);
    });
  });

  describe('formatContextForClaude', () => {
    it('formats messages as conversation transcript', () => {
      const messages = [
        { text: 'Hello', sender: '+15551234567', timestamp: 1706832400 },
        { text: 'Hi there!', sender: 'me', timestamp: 1706832500 },
      ];

      const formatted = formatContextForClaude(messages, '+15551234567');

      expect(formatted).toContain('Contact: Hello');
      expect(formatted).toContain('Brokkr: Hi there!');
    });

    it('includes display name if provided', () => {
      const messages = [
        { text: 'Hello', sender: '+15551234567', timestamp: 1706832400 },
      ];

      const formatted = formatContextForClaude(messages, '+15551234567', 'Sarah');

      expect(formatted).toContain('Sarah: Hello');
    });

    it('includes timestamp in format [time]', () => {
      const messages = [
        { text: 'Hello', sender: '+15551234567', timestamp: 1706832400 },
      ];

      const formatted = formatContextForClaude(messages, '+15551234567');

      // Should contain a time in brackets
      expect(formatted).toMatch(/\[\d{1,2}:\d{2}(?:\s?[AP]M)?\]/i);
    });

    it('handles empty message list', () => {
      const formatted = formatContextForClaude([], '+15551234567');

      expect(formatted).toBe('');
    });

    it('uses Contact for messages from the phone number', () => {
      const messages = [
        { text: 'Test', sender: '+15551234567', timestamp: 1706832400 },
      ];

      const formatted = formatContextForClaude(messages, '+15551234567');

      expect(formatted).toContain('Contact: Test');
      expect(formatted).not.toContain('Brokkr: Test');
    });

    it('uses Brokkr for messages with sender=me', () => {
      const messages = [
        { text: 'My response', sender: 'me', timestamp: 1706832400 },
      ];

      const formatted = formatContextForClaude(messages, '+15551234567');

      expect(formatted).toContain('Brokkr: My response');
    });
  });

  describe('buildSystemContext', () => {
    it('includes Brokkr identity intro', () => {
      const contact = { phone: '+15551234567', trustLevel: 'known' };
      const messages = [];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('Brokkr');
    });

    it('includes contact phone number', () => {
      const contact = { phone: '+15551234567', trustLevel: 'known' };
      const messages = [];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('+15551234567');
    });

    it('includes contact trust level', () => {
      const contact = { phone: '+15551234567', trustLevel: 'trusted' };
      const messages = [];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('trusted');
    });

    it('includes contact name if available', () => {
      const contact = { phone: '+15551234567', trustLevel: 'known', displayName: 'Sarah' };
      const messages = [];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('Sarah');
    });

    it('includes response_style if set', () => {
      const contact = {
        phone: '+15551234567',
        trustLevel: 'known',
        responseStyle: 'formal',
      };
      const messages = [];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('formal');
    });

    it('includes formatted conversation if messages provided', () => {
      const contact = { phone: '+15551234567', trustLevel: 'known' };
      const messages = [
        { text: 'Hello', sender: '+15551234567', timestamp: 1706832400 },
        { text: 'Hi!', sender: 'me', timestamp: 1706832500 },
      ];

      const context = buildSystemContext(contact, messages);

      expect(context).toContain('Hello');
      expect(context).toContain('Hi!');
    });

    it('handles contact without optional fields', () => {
      const contact = { phone: '+15551234567', trustLevel: 'unknown' };
      const messages = [];

      // Should not throw
      const context = buildSystemContext(contact, messages);

      expect(context).toBeTruthy();
      expect(context).toContain('+15551234567');
    });
  });
});
