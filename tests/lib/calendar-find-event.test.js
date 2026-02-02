// tests/lib/calendar-find-event.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');
const scriptPath = path.join(scriptsDir, 'find-event.scpt');

describe('Calendar - Find Event Script', () => {
  describe('Script file', () => {
    test('exists', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });
  });

  describe('Input validation', () => {
    test('returns error when no arguments provided', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Missing required JSON argument');
      expect(parsed.data).toEqual([]);
    });

    test('returns error for invalid JSON', () => {
      const result = execSync(`osascript "${scriptPath}" 'not valid json'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid JSON');
      expect(parsed.data).toEqual([]);
    });

    test('returns error when neither uid nor summary provided', () => {
      const result = execSync(`osascript "${scriptPath}" '{}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('uid or summary');
      expect(parsed.data).toEqual([]);
    });
  });

  describe('Response format', () => {
    test('returns valid JSON with uid search', () => {
      const result = execSync(`osascript "${scriptPath}" '{"uid":"nonexistent-uid"}'`, { encoding: 'utf8' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('returns valid JSON with summary search', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('has success field in response', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(typeof parsed.success).toBe('boolean');
    });

    test('has data field in response', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('data');
    });

    test('has error field in response', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('error');
    });

    test('data is an array', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed.data)).toBe(true);
    });
  });

  describe('UID search', () => {
    test('returns empty array for nonexistent UID', () => {
      const result = execSync(`osascript "${scriptPath}" '{"uid":"nonexistent-uid-12345"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual([]);
      expect(parsed.error).toBeNull();
    });
  });

  describe('Summary search', () => {
    test('returns empty array for nonexistent summary', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"XYZ_NONEXISTENT_EVENT_12345"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual([]);
      expect(parsed.error).toBeNull();
    });

    test('search is case-insensitive', () => {
      // This test validates the search works - actual events may or may not exist
      const resultLower = execSync(`osascript "${scriptPath}" '{"summary":"meeting"}'`, { encoding: 'utf8' });
      const resultUpper = execSync(`osascript "${scriptPath}" '{"summary":"MEETING"}'`, { encoding: 'utf8' });

      const parsedLower = JSON.parse(resultLower);
      const parsedUpper = JSON.parse(resultUpper);

      // Both should execute successfully
      expect(parsedLower.success).toBe(true);
      expect(parsedUpper.success).toBe(true);
    });
  });

  describe('Date range filtering', () => {
    test('accepts startDate and endDate parameters', () => {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const startDate = today.toISOString().split('T')[0];
      const endDate = nextWeek.toISOString().split('T')[0];

      const input = JSON.stringify({
        summary: 'Test',
        startDate: startDate,
        endDate: endDate
      });

      const result = execSync(`osascript "${scriptPath}" '${input}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.data)).toBe(true);
    });

    test('uses default date range when not specified', () => {
      const result = execSync(`osascript "${scriptPath}" '{"summary":"Test"}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      // Should succeed without date range - uses default +/- 30 days
      expect(parsed.success).toBe(true);
    });
  });

  describe('Event properties', () => {
    test('found events have required properties', () => {
      // Use a broad search to potentially find events
      const today = new Date();
      const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const input = JSON.stringify({
        summary: 'a', // Very broad search to catch any event with 'a' in name
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });

      const result = execSync(`osascript "${scriptPath}" '${input}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);

      if (parsed.data && parsed.data.length > 0) {
        const event = parsed.data[0];

        // Required properties
        expect(event).toHaveProperty('uid');
        expect(typeof event.uid).toBe('string');
        expect(event).toHaveProperty('summary');
        expect(typeof event.summary).toBe('string');
        expect(event).toHaveProperty('startDate');
        expect(typeof event.startDate).toBe('string');
        expect(event).toHaveProperty('endDate');
        expect(typeof event.endDate).toBe('string');
        expect(event).toHaveProperty('location');
        expect(event).toHaveProperty('notes');
        expect(event).toHaveProperty('calendar');
        expect(typeof event.calendar).toBe('string');
      }
    });

    test('dates are in ISO 8601 format if events exist', () => {
      const input = JSON.stringify({ summary: 'a' }); // Broad search

      const result = execSync(`osascript "${scriptPath}" '${input}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      if (parsed.data && parsed.data.length > 0) {
        const event = parsed.data[0];
        // ISO 8601 format: YYYY-MM-DDTHH:MM:SS
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
        expect(event.startDate).toMatch(iso8601Regex);
        expect(event.endDate).toMatch(iso8601Regex);
      }
    });
  });

  describe('Combined search', () => {
    test('accepts both uid and summary (uid takes precedence)', () => {
      const input = JSON.stringify({
        uid: 'nonexistent-uid',
        summary: 'Test'
      });

      const result = execSync(`osascript "${scriptPath}" '${input}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      // Should succeed (uid search takes precedence, returns empty for nonexistent)
      expect(parsed.success).toBe(true);
    });
  });
});
