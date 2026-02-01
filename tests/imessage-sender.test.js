// tests/imessage-sender.test.js
import { describe, it, expect } from '@jest/globals';
import {
  formatMessageForAppleScript,
  buildSendScript,
  chunkMessage,
  sendMessage,
  safeSendMessage,
  MAX_MESSAGE_LENGTH,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
} from '../lib/imessage-sender.js';

describe('iMessage Sender Module', () => {
  describe('formatMessageForAppleScript', () => {
    it('should escape double quotes', () => {
      const input = 'He said "hello"';
      const expected = 'He said \\"hello\\"';
      expect(formatMessageForAppleScript(input)).toBe(expected);
    });

    it('should escape backslashes', () => {
      const input = 'path\\to\\file';
      const expected = 'path\\\\to\\\\file';
      expect(formatMessageForAppleScript(input)).toBe(expected);
    });

    it('should escape backslashes before quotes', () => {
      // Backslashes must be escaped first, then quotes
      const input = 'test\\"value';
      const expected = 'test\\\\\\"value';
      expect(formatMessageForAppleScript(input)).toBe(expected);
    });

    it('should preserve newlines as-is for AppleScript', () => {
      const input = 'line1\nline2';
      const expected = 'line1\nline2';
      expect(formatMessageForAppleScript(input)).toBe(expected);
    });

    it('should return empty string for null input', () => {
      expect(formatMessageForAppleScript(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(formatMessageForAppleScript(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(formatMessageForAppleScript('')).toBe('');
    });

    it('should handle message with all special characters', () => {
      const input = 'Say "hi" \\ and\n"bye"';
      // Backslashes escaped first: Say "hi" \\ and\n"bye"
      // Then quotes: Say \"hi\" \\ and\n\"bye\"
      const expected = 'Say \\"hi\\" \\\\ and\n\\"bye\\"';
      expect(formatMessageForAppleScript(input)).toBe(expected);
    });
  });

  describe('buildSendScript', () => {
    it('should generate valid AppleScript for sending a message', () => {
      const phoneNumber = '+12069090025';
      const message = 'Hello';
      const script = buildSendScript(phoneNumber, message);

      expect(script).toContain('tell application "Messages"');
      expect(script).toContain('set targetService to 1st account whose service type = iMessage');
      expect(script).toContain('set targetBuddy to participant "+12069090025" of targetService');
      expect(script).toContain('send "Hello" to targetBuddy');
      expect(script).toContain('end tell');
    });

    it('should escape message content in the script', () => {
      const phoneNumber = '+12069090025';
      const message = 'He said "hello"';
      const script = buildSendScript(phoneNumber, message);

      // The message should be escaped in the AppleScript
      expect(script).toContain('send "He said \\"hello\\"" to targetBuddy');
    });

    it('should handle phone numbers without plus sign', () => {
      const phoneNumber = '12069090025';
      const message = 'Test';
      const script = buildSendScript(phoneNumber, message);

      expect(script).toContain('participant "12069090025"');
    });

    it('should handle empty message', () => {
      const phoneNumber = '+12069090025';
      const message = '';
      const script = buildSendScript(phoneNumber, message);

      expect(script).toContain('send "" to targetBuddy');
    });

    it('should handle multiline messages', () => {
      const phoneNumber = '+12069090025';
      const message = 'Line 1\nLine 2';
      const script = buildSendScript(phoneNumber, message);

      // Newlines preserved in the script
      expect(script).toContain('send "Line 1\nLine 2" to targetBuddy');
    });
  });

  describe('chunkMessage', () => {
    it('should return single chunk for message under limit', () => {
      const message = 'Short message';
      const chunks = chunkMessage(message);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Short message');
    });

    it('should export MAX_MESSAGE_LENGTH constant as 4000', () => {
      expect(MAX_MESSAGE_LENGTH).toBe(4000);
    });

    it('should split long messages at word boundaries', () => {
      // Create a message that's longer than limit
      const words = [];
      for (let i = 0; i < 500; i++) {
        words.push('word' + i);
      }
      const message = words.join(' '); // ~3500+ chars

      const chunks = chunkMessage(message, 100); // Use small limit for test

      // Each chunk should be <= limit
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }

      // Chunks should not end with space
      for (const chunk of chunks) {
        expect(chunk.endsWith(' ')).toBe(false);
      }
    });

    it('should handle very long words by forcing break', () => {
      // A word longer than the limit
      const longWord = 'a'.repeat(150);
      const message = longWord;

      const chunks = chunkMessage(message, 100);

      // Should be broken into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be <= limit
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(100);
      }
      // Reassembled should equal original
      expect(chunks.join('')).toBe(message);
    });

    it('should return empty array for empty message', () => {
      expect(chunkMessage('')).toEqual([]);
      expect(chunkMessage(null)).toEqual([]);
      expect(chunkMessage(undefined)).toEqual([]);
    });

    it('should preserve newlines within chunks', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const chunks = chunkMessage(message);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should split at newline when possible', () => {
      // Create message with newlines that together exceed limit
      const line = 'x'.repeat(60);
      const message = `${line}\n${line}\n${line}`;

      const chunks = chunkMessage(message, 100);

      // Should split at newlines
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('sendMessage', () => {
    it('should export retry configuration constants', () => {
      expect(DEFAULT_RETRY_COUNT).toBe(3);
      expect(DEFAULT_RETRY_DELAY_MS).toBe(2000);
    });

    it('should return success object when executor succeeds', async () => {
      // Mock executor that always succeeds
      const mockExecutor = () => 'Message sent';

      const result = await sendMessage('+12069090025', 'Hello', { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.messagesSent).toBe(1);
    });

    it('should call executor with generated AppleScript', async () => {
      let capturedScript = null;
      const mockExecutor = (script) => {
        capturedScript = script;
        return 'OK';
      };

      await sendMessage('+12069090025', 'Test message', { executor: mockExecutor });

      expect(capturedScript).toContain('tell application "Messages"');
      expect(capturedScript).toContain('participant "+12069090025"');
      expect(capturedScript).toContain('send "Test message"');
    });

    it('should retry on failure up to max attempts', async () => {
      let attempts = 0;
      const mockExecutor = () => {
        attempts++;
        throw new Error('AppleScript error');
      };

      const result = await sendMessage('+12069090025', 'Hello', {
        executor: mockExecutor,
        retryCount: 3,
        retryDelayMs: 10, // Fast for testing
      });

      expect(result.success).toBe(false);
      expect(attempts).toBe(3);
      expect(result.error).toContain('AppleScript error');
    });

    it('should succeed after retry if executor eventually succeeds', async () => {
      let attempts = 0;
      const mockExecutor = () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return 'Success';
      };

      const result = await sendMessage('+12069090025', 'Hello', {
        executor: mockExecutor,
        retryCount: 3,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(2);
    });

    it('should chunk long messages and send multiple', async () => {
      let sentChunks = [];
      const mockExecutor = (script) => {
        // Extract message from script
        const match = script.match(/send "(.+)" to targetBuddy/s);
        if (match) {
          sentChunks.push(match[1]);
        }
        return 'OK';
      };

      // Create long message
      const longMessage = 'word '.repeat(1000);

      const result = await sendMessage('+12069090025', longMessage, {
        executor: mockExecutor,
        maxChunkLength: 100,
      });

      expect(result.success).toBe(true);
      expect(sentChunks.length).toBeGreaterThan(1);
      expect(result.messagesSent).toBe(sentChunks.length);
    });

    it('should stop sending chunks on first failure after retries exhausted', async () => {
      let sentChunks = 0;
      const mockExecutor = () => {
        sentChunks++;
        if (sentChunks === 2) {
          throw new Error('Network error');
        }
        return 'OK';
      };

      const longMessage = 'word '.repeat(100);

      const result = await sendMessage('+12069090025', longMessage, {
        executor: mockExecutor,
        maxChunkLength: 50,
        retryCount: 1,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.messagesSent).toBe(1); // First chunk succeeded
    });

    it('should handle empty message', async () => {
      const mockExecutor = () => 'OK';

      const result = await sendMessage('+12069090025', '', { executor: mockExecutor });

      expect(result.success).toBe(true);
      expect(result.messagesSent).toBe(0);
    });
  });

  describe('safeSendMessage', () => {
    it('should send message when dryRun is false', async () => {
      let sentMessage = null;
      const mockExecutor = (script) => {
        const match = script.match(/send "(.+)" to targetBuddy/s);
        if (match) sentMessage = match[1];
        return 'OK';
      };

      const result = await safeSendMessage('+12069090025', 'Hello world', {
        dryRun: false,
        executor: mockExecutor,
      });

      expect(result.success).toBe(true);
      expect(sentMessage).toBe('Hello world');
    });

    it('should prepend [DRY-RUN] prefix in dry-run mode', async () => {
      let sentMessage = null;
      const mockExecutor = (script) => {
        const match = script.match(/send "(.+)" to targetBuddy/s);
        if (match) sentMessage = match[1];
        return 'OK';
      };

      const result = await safeSendMessage('+12069090025', 'Hello world', {
        dryRun: true,
        executor: mockExecutor,
      });

      expect(result.success).toBe(true);
      expect(sentMessage).toContain('[DRY-RUN]');
      expect(sentMessage).toContain('Hello world');
    });

    it('should include original message after prefix in dry-run mode', async () => {
      let sentMessage = null;
      const mockExecutor = (script) => {
        const match = script.match(/send "(.+)" to targetBuddy/s);
        if (match) sentMessage = match[1];
        return 'OK';
      };

      await safeSendMessage('+12069090025', 'Test message', {
        dryRun: true,
        executor: mockExecutor,
      });

      // Should have format: [DRY-RUN] Test message
      expect(sentMessage).toBe('[DRY-RUN] Test message');
    });

    it('should pass through all options to sendMessage', async () => {
      let attempts = 0;
      const mockExecutor = () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'OK';
      };

      await safeSendMessage('+12069090025', 'Test', {
        dryRun: false,
        executor: mockExecutor,
        retryCount: 3,
        retryDelayMs: 10,
      });

      expect(attempts).toBe(2); // Verifies retry options were passed through
    });

    it('should use default dryRun=false when not specified', async () => {
      let sentMessage = null;
      const mockExecutor = (script) => {
        const match = script.match(/send "(.+)" to targetBuddy/s);
        if (match) sentMessage = match[1];
        return 'OK';
      };

      await safeSendMessage('+12069090025', 'No prefix', { executor: mockExecutor });

      // Should NOT have dry-run prefix
      expect(sentMessage).toBe('No prefix');
      expect(sentMessage).not.toContain('[DRY-RUN]');
    });
  });
});
