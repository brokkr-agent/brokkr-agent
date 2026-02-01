// tests/notification-db.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getDbPath,
  macTimeToUnix,
  unixToMacTime,
  getAppIdentifier,
  getRecentNotifications,
  getNotificationsForApp,
  checkDatabaseAccess
} from '../lib/notification-db.js';

// Mac Absolute Time epoch offset (January 1, 2001 00:00:00 UTC)
const MAC_EPOCH_OFFSET = 978307200;

describe('Notification Database Module', () => {
  describe('getDbPath', () => {
    it('should return path containing com.apple.notificationcenter/db2/db', () => {
      const dbPath = getDbPath();
      expect(dbPath).toContain('com.apple.notificationcenter/db2/db');
    });

    it('should return a string path', () => {
      const dbPath = getDbPath();
      expect(typeof dbPath).toBe('string');
    });
  });

  describe('macTimeToUnix', () => {
    it('should return 978307200 when given 0 (Mac epoch)', () => {
      expect(macTimeToUnix(0)).toBe(978307200);
    });

    it('should return 1769904000 when given 791596800', () => {
      // 791596800 Mac time = 791596800 + 978307200 = 1769904000 Unix time
      expect(macTimeToUnix(791596800)).toBe(1769904000);
    });

    it('should handle negative Mac time values', () => {
      // Before Mac epoch (before Jan 1, 2001)
      expect(macTimeToUnix(-100)).toBe(978307100);
    });

    it('should handle current time approximately', () => {
      // Current Unix time should be roughly 25 years after Mac epoch
      const now = Date.now() / 1000;
      const macNow = now - MAC_EPOCH_OFFSET;
      expect(macTimeToUnix(macNow)).toBeCloseTo(now, 0);
    });
  });

  describe('unixToMacTime', () => {
    it('should return 0 when given Mac epoch Unix timestamp', () => {
      expect(unixToMacTime(978307200)).toBe(0);
    });

    it('should return 791596800 when given 1769904000', () => {
      expect(unixToMacTime(1769904000)).toBe(791596800);
    });

    it('should be the inverse of macTimeToUnix', () => {
      const macTime = 500000000;
      expect(unixToMacTime(macTimeToUnix(macTime))).toBe(macTime);
    });
  });

  describe('getAppIdentifier', () => {
    it('should return imessage for com.apple.MobileSMS', () => {
      expect(getAppIdentifier('com.apple.MobileSMS')).toBe('imessage');
    });

    it('should return mail for com.apple.mail', () => {
      expect(getAppIdentifier('com.apple.mail')).toBe('mail');
    });

    it('should return calendar for com.apple.iCal', () => {
      expect(getAppIdentifier('com.apple.iCal')).toBe('calendar');
    });

    it('should return facetime for com.apple.FaceTime', () => {
      expect(getAppIdentifier('com.apple.FaceTime')).toBe('facetime');
    });

    it('should return reminders for com.apple.reminders', () => {
      expect(getAppIdentifier('com.apple.reminders')).toBe('reminders');
    });

    it('should return original bundle ID for unknown apps', () => {
      expect(getAppIdentifier('com.example.app')).toBe('com.example.app');
    });

    it('should return original bundle ID for third-party apps', () => {
      expect(getAppIdentifier('com.spotify.client')).toBe('com.spotify.client');
    });
  });

  describe('checkDatabaseAccess', () => {
    it('should return an object with accessible property', async () => {
      const result = await checkDatabaseAccess();
      expect(result).toHaveProperty('accessible');
      expect(typeof result.accessible).toBe('boolean');
    });

    it('should return path in result', async () => {
      const result = await checkDatabaseAccess();
      expect(result).toHaveProperty('path');
      expect(typeof result.path).toBe('string');
    });

    it('should return error if not accessible', async () => {
      const result = await checkDatabaseAccess();
      if (!result.accessible) {
        expect(result).toHaveProperty('error');
      }
    });
  });

  describe('getRecentNotifications', () => {
    it('should return an array', async () => {
      const result = await getRecentNotifications();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const limit = 5;
      const result = await getRecentNotifications(null, limit);
      expect(result.length).toBeLessThanOrEqual(limit);
    });

    it('should filter by sinceUnixTime when provided', async () => {
      const futureTime = Date.now() / 1000 + 86400; // Tomorrow
      const result = await getRecentNotifications(futureTime);
      expect(result.length).toBe(0);
    });

    it('should return objects with expected properties', async () => {
      const result = await getRecentNotifications(null, 1);
      if (result.length > 0) {
        const notification = result[0];
        expect(notification).toHaveProperty('rec_id');
        expect(notification).toHaveProperty('bundle_id');
        expect(notification).toHaveProperty('delivered_date');
        expect(notification).toHaveProperty('presented');
      }
    });
  });

  describe('getNotificationsForApp', () => {
    it('should return an array', async () => {
      const result = await getNotificationsForApp('imessage');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept friendly app identifiers', async () => {
      // Should not throw when using friendly names
      await expect(getNotificationsForApp('imessage')).resolves.not.toThrow();
      await expect(getNotificationsForApp('mail')).resolves.not.toThrow();
      await expect(getNotificationsForApp('calendar')).resolves.not.toThrow();
    });

    it('should respect limit parameter', async () => {
      const limit = 3;
      const result = await getNotificationsForApp('imessage', null, limit);
      expect(result.length).toBeLessThanOrEqual(limit);
    });

    it('should filter by sinceUnixTime when provided', async () => {
      const futureTime = Date.now() / 1000 + 86400; // Tomorrow
      const result = await getNotificationsForApp('imessage', futureTime);
      expect(result.length).toBe(0);
    });
  });
});
