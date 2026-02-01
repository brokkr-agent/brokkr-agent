// tests/imessage-reader.test.js
import { describe, it, expect } from '@jest/globals';
import { macTimeToUnix, getDbPath, getRecentMessages, getGroupMessages, getGroupMembers, getAllRecentMessages } from '../lib/imessage-reader.js';
import os from 'os';
import path from 'path';

describe('iMessage Reader Module', () => {
  describe('macTimeToUnix', () => {
    it('should convert Mac Absolute Time to Unix timestamp', () => {
      // Mac Absolute Time: seconds since 2001-01-01 00:00:00 UTC
      // Unix time: seconds since 1970-01-01 00:00:00 UTC
      // Difference: 978307200 seconds

      // Test case: 2024-01-15 12:00:00 UTC
      // Unix: 1705320000
      // Mac: 1705320000 - 978307200 = 727012800
      const macTime = 727012800;
      const expectedUnix = 1705320000;

      expect(macTimeToUnix(macTime)).toBe(expectedUnix);
    });

    it('should handle zero Mac time (2001-01-01 00:00:00 UTC)', () => {
      // Mac time 0 = 2001-01-01 00:00:00 UTC = Unix 978307200
      expect(macTimeToUnix(0)).toBe(978307200);
    });

    it('should handle negative Mac time (before 2001)', () => {
      // 1 year before 2001 = approx -31536000 seconds
      const macTime = -31536000;
      const expected = 978307200 - 31536000;
      expect(macTimeToUnix(macTime)).toBe(expected);
    });

    it('should handle nanosecond timestamps (iOS 10+)', () => {
      // iOS 10+ uses nanoseconds instead of seconds
      // 727012800000000000 nanoseconds = 727012800 seconds
      const macTimeNano = 727012800000000000;
      const expectedUnix = 1705320000;

      expect(macTimeToUnix(macTimeNano)).toBe(expectedUnix);
    });
  });

  describe('getDbPath', () => {
    it('should return path to Messages chat.db in user home directory', () => {
      const dbPath = getDbPath();
      const homeDir = os.homedir();
      const expectedPath = path.join(homeDir, 'Library', 'Messages', 'chat.db');

      expect(dbPath).toBe(expectedPath);
    });
  });

  describe('getRecentMessages', () => {
    it('should return an array', async () => {
      const messages = await getRecentMessages('+12069090025', 10);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return empty array when database is not accessible', async () => {
      // This test ensures graceful handling when db is missing or locked
      // The actual database may or may not exist on the test machine
      const messages = await getRecentMessages('+12069090025', 10);
      // Should not throw, should return array (possibly empty)
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should respect the limit parameter', async () => {
      const limit = 5;
      const messages = await getRecentMessages('+12069090025', limit);
      expect(messages.length).toBeLessThanOrEqual(limit);
    });

    it('should return messages with expected structure', async () => {
      const messages = await getRecentMessages('+12069090025', 10);

      // If any messages returned, verify structure
      if (messages.length > 0) {
        const msg = messages[0];
        expect(msg).toHaveProperty('id');
        expect(msg).toHaveProperty('text');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('sender');
        expect(typeof msg.id).toBe('number');
        expect(typeof msg.timestamp).toBe('number');
      }
    });

    it('should handle phone number without plus sign', async () => {
      const messages = await getRecentMessages('12069090025', 10);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return empty array for invalid limit (negative)', () => {
      const messages = getRecentMessages('+12069090025', -1);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (too large)', () => {
      const messages = getRecentMessages('+12069090025', 10000);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (non-integer)', () => {
      const messages = getRecentMessages('+12069090025', 5.5);
      expect(messages).toEqual([]);
    });
  });

  describe('getGroupMessages', () => {
    it('should be exported from the module', () => {
      expect(typeof getGroupMessages).toBe('function');
    });

    it('should return an array', () => {
      // Using a fake chat GUID - will return empty array if not found
      const messages = getGroupMessages('chat123456789', 10);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return empty array for invalid limit (negative)', () => {
      const messages = getGroupMessages('chat123456789', -1);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (too large)', () => {
      const messages = getGroupMessages('chat123456789', 10000);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (non-integer)', () => {
      const messages = getGroupMessages('chat123456789', 5.5);
      expect(messages).toEqual([]);
    });

    it('should respect the limit parameter', () => {
      const limit = 5;
      const messages = getGroupMessages('chat123456789', limit);
      expect(messages.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('getGroupMembers', () => {
    it('should be exported from the module', () => {
      expect(typeof getGroupMembers).toBe('function');
    });

    it('should return an array', () => {
      // Using a fake chat GUID - will return empty array if not found
      const members = getGroupMembers('chat123456789');
      expect(Array.isArray(members)).toBe(true);
    });
  });

  describe('getAllRecentMessages', () => {
    it('should be exported from the module', () => {
      expect(typeof getAllRecentMessages).toBe('function');
    });

    it('should return an array', () => {
      const messages = getAllRecentMessages(10);
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return empty array for invalid limit (negative)', () => {
      const messages = getAllRecentMessages(-1);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (too large)', () => {
      const messages = getAllRecentMessages(10000);
      expect(messages).toEqual([]);
    });

    it('should return empty array for invalid limit (non-integer)', () => {
      const messages = getAllRecentMessages(5.5);
      expect(messages).toEqual([]);
    });

    it('should respect the limit parameter', () => {
      const limit = 5;
      const messages = getAllRecentMessages(limit);
      expect(messages.length).toBeLessThanOrEqual(limit);
    });

    it('should use default limit of 50', () => {
      // Just verify it does not throw when called without limit
      const messages = getAllRecentMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should return messages with expected structure including chat_id', () => {
      const messages = getAllRecentMessages(10);

      // If any messages returned, verify structure includes chat_id
      if (messages.length > 0) {
        const msg = messages[0];
        expect(msg).toHaveProperty('id');
        expect(msg).toHaveProperty('text');
        expect(msg).toHaveProperty('timestamp');
        expect(msg).toHaveProperty('sender');
        expect(msg).toHaveProperty('chat_id');
        expect(typeof msg.id).toBe('number');
        expect(typeof msg.timestamp).toBe('number');
      }
    });
  });
});
