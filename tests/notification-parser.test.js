// tests/notification-parser.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  parseNotificationData,
  extractNotificationContent,
  formatNotificationForDisplay,
  parseNotificationRecord
} from '../lib/notification-parser.js';

describe('Notification Parser Module', () => {
  describe('parseNotificationData', () => {
    it('should return null for empty data', () => {
      expect(parseNotificationData(null)).toBeNull();
      expect(parseNotificationData(undefined)).toBeNull();
      expect(parseNotificationData(Buffer.alloc(0))).toBeNull();
    });

    it('should parse valid binary plist data using plutil CLI', async () => {
      // Create a simple binary plist for testing
      // This uses the plutil command to create a binary plist from XML
      const { execSync } = await import('child_process');
      const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      const tempXml = join(tmpdir(), `test-plist-${Date.now()}.xml`);
      const tempBinary = join(tmpdir(), `test-plist-${Date.now()}.plist`);

      try {
        // Create a test plist with notification-like structure
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>titl</key>
  <string>Test Title</string>
  <key>body</key>
  <string>Test Body</string>
  <key>subt</key>
  <string>Test Subtitle</string>
</dict>
</plist>`;
        writeFileSync(tempXml, xmlContent);
        execSync(`plutil -convert binary1 -o "${tempBinary}" "${tempXml}"`);

        const binaryData = readFileSync(tempBinary);
        const result = parseNotificationData(binaryData);

        expect(result).not.toBeNull();
        expect(result.titl).toBe('Test Title');
        expect(result.body).toBe('Test Body');
        expect(result.subt).toBe('Test Subtitle');
      } finally {
        try { unlinkSync(tempXml); } catch {}
        try { unlinkSync(tempBinary); } catch {}
      }
    });

    it('should handle invalid binary data gracefully', () => {
      const invalidData = Buffer.from('not a valid plist');
      const result = parseNotificationData(invalidData);

      // Should return null or object with rawText fallback, not throw
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('extractNotificationContent', () => {
    it('should return empty strings for null input', () => {
      const result = extractNotificationContent(null);
      expect(result).toEqual({ title: '', body: '', subtitle: '' });
    });

    it('should return empty strings for undefined input', () => {
      const result = extractNotificationContent(undefined);
      expect(result).toEqual({ title: '', body: '', subtitle: '' });
    });

    it('should extract title from titl key', () => {
      const plist = { titl: 'Hello World' };
      const result = extractNotificationContent(plist);
      expect(result.title).toBe('Hello World');
    });

    it('should extract body from body key', () => {
      const plist = { body: 'This is the message' };
      const result = extractNotificationContent(plist);
      expect(result.body).toBe('This is the message');
    });

    it('should extract subtitle from subt key', () => {
      const plist = { subt: 'From John' };
      const result = extractNotificationContent(plist);
      expect(result.subtitle).toBe('From John');
    });

    it('should extract sender from srce key', () => {
      const plist = { srce: 'john@example.com' };
      const result = extractNotificationContent(plist);
      expect(result.sender).toBe('john@example.com');
    });

    it('should extract threadId from thrd key', () => {
      const plist = { thrd: 'thread-123' };
      const result = extractNotificationContent(plist);
      expect(result.threadId).toBe('thread-123');
    });

    it('should extract category from catg key', () => {
      const plist = { catg: 'MESSAGE' };
      const result = extractNotificationContent(plist);
      expect(result.category).toBe('MESSAGE');
    });

    it('should handle nested req.* paths', () => {
      const plist = {
        req: {
          titl: 'Nested Title',
          body: 'Nested Body',
          subt: 'Nested Subtitle'
        }
      };
      const result = extractNotificationContent(plist);
      expect(result.title).toBe('Nested Title');
      expect(result.body).toBe('Nested Body');
      expect(result.subtitle).toBe('Nested Subtitle');
    });

    it('should prefer top-level keys over nested req keys', () => {
      const plist = {
        titl: 'Top Level Title',
        req: {
          titl: 'Nested Title'
        }
      };
      const result = extractNotificationContent(plist);
      expect(result.title).toBe('Top Level Title');
    });

    it('should return undefined for missing optional fields', () => {
      const plist = { titl: 'Only Title' };
      const result = extractNotificationContent(plist);
      expect(result.sender).toBeUndefined();
      expect(result.threadId).toBeUndefined();
      expect(result.category).toBeUndefined();
    });
  });

  describe('formatNotificationForDisplay', () => {
    it('should format notification with app name and time', () => {
      const notification = {
        app: 'Messages',
        content: { title: 'John', body: 'Hello!' },
        delivered: 1738368000 // Unix timestamp
      };
      const result = formatNotificationForDisplay(notification);

      expect(result).toContain('[Messages]');
      expect(result).toContain('John');
      expect(result).toContain('Hello!');
    });

    it('should show unknown for missing delivered time', () => {
      const notification = {
        app: 'Mail',
        content: { title: 'Subject', body: 'Email body' },
        delivered: null
      };
      const result = formatNotificationForDisplay(notification);

      expect(result).toContain('[Mail]');
      expect(result).toContain('unknown');
    });

    it('should handle notification with subtitle', () => {
      const notification = {
        app: 'Calendar',
        content: { title: 'Meeting', subtitle: 'Room 101', body: 'Daily standup' },
        delivered: 1738368000
      };
      const result = formatNotificationForDisplay(notification);

      expect(result).toContain('Meeting');
      expect(result).toContain('Room 101');
      expect(result).toContain('Daily standup');
    });

    it('should handle notification with empty content', () => {
      const notification = {
        app: 'Unknown App',
        content: { title: '', body: '', subtitle: '' },
        delivered: 1738368000
      };
      const result = formatNotificationForDisplay(notification);

      expect(result).toContain('[Unknown App]');
    });
  });

  describe('parseNotificationRecord', () => {
    it('should combine parseNotificationData and extractNotificationContent', async () => {
      // Create a real binary plist for testing
      const { execSync } = await import('child_process');
      const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      const tempXml = join(tmpdir(), `test-record-${Date.now()}.xml`);
      const tempBinary = join(tmpdir(), `test-record-${Date.now()}.plist`);

      try {
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>titl</key>
  <string>Record Title</string>
  <key>body</key>
  <string>Record Body</string>
</dict>
</plist>`;
        writeFileSync(tempXml, xmlContent);
        execSync(`plutil -convert binary1 -o "${tempBinary}" "${tempXml}"`);

        const binaryData = readFileSync(tempBinary);

        const record = {
          rec_id: 123,
          app: 'Messages',
          bundleId: 'com.apple.MobileSMS',
          data: binaryData,
          delivered: 1738368000,
          presented: true
        };

        const result = parseNotificationRecord(record);

        expect(result.id).toBe(123);
        expect(result.app).toBe('Messages');
        expect(result.bundleId).toBe('com.apple.MobileSMS');
        expect(result.content.title).toBe('Record Title');
        expect(result.content.body).toBe('Record Body');
        expect(result.delivered).toBe(1738368000);
        expect(result.presented).toBe(true);
        expect(result.raw).not.toBeNull();
      } finally {
        try { unlinkSync(tempXml); } catch {}
        try { unlinkSync(tempBinary); } catch {}
      }
    });

    it('should handle null data gracefully', () => {
      const record = {
        rec_id: 456,
        app: 'Calendar',
        bundleId: 'com.apple.iCal',
        data: null,
        delivered: 1738368000,
        presented: false
      };

      const result = parseNotificationRecord(record);

      expect(result.id).toBe(456);
      expect(result.app).toBe('Calendar');
      expect(result.content).toEqual({ title: '', body: '', subtitle: '' });
      expect(result.raw).toBeNull();
    });

    it('should include raw plist in result', async () => {
      const { execSync } = await import('child_process');
      const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');

      const tempXml = join(tmpdir(), `test-raw-${Date.now()}.xml`);
      const tempBinary = join(tmpdir(), `test-raw-${Date.now()}.plist`);

      try {
        const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>customKey</key>
  <string>Custom Value</string>
</dict>
</plist>`;
        writeFileSync(tempXml, xmlContent);
        execSync(`plutil -convert binary1 -o "${tempBinary}" "${tempXml}"`);

        const binaryData = readFileSync(tempBinary);

        const record = {
          rec_id: 789,
          app: 'Custom',
          bundleId: 'com.example.app',
          data: binaryData,
          delivered: 1738368000,
          presented: true
        };

        const result = parseNotificationRecord(record);

        expect(result.raw).toHaveProperty('customKey', 'Custom Value');
      } finally {
        try { unlinkSync(tempXml); } catch {}
        try { unlinkSync(tempBinary); } catch {}
      }
    });
  });
});
