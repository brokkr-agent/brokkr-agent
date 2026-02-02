// tests/lib/calendar-create-event.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - Create Event Script', () => {
  const scriptPath = path.join(scriptsDir, 'create-event.scpt');

  // Store UIDs of events we create so we can clean them up
  const createdEventUIDs = [];

  // Helper to create a test event and track its UID
  const createTestEvent = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    if (parsed.success && parsed.data && parsed.data.uid) {
      createdEventUIDs.push({ uid: parsed.data.uid, calendar: params.calendar || 'Home' });
    }
    return parsed;
  };

  // Get a date string for testing (1 hour from now)
  const getTestDates = () => {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + 1);
    startDate.setMinutes(0);
    startDate.setSeconds(0);
    startDate.setMilliseconds(0);

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1);

    // Format as ISO 8601 without milliseconds
    const formatISO = (d) => d.toISOString().slice(0, 19);

    return {
      startDate: formatISO(startDate),
      endDate: formatISO(endDate)
    };
  };

  afterAll(() => {
    // Clean up any events we created during tests
    // We'll use a delete script if available, otherwise just log
    const deleteScriptPath = path.join(scriptsDir, 'delete-event.scpt');

    if (existsSync(deleteScriptPath)) {
      createdEventUIDs.forEach(({ uid, calendar }) => {
        try {
          const params = JSON.stringify({ uid, calendar });
          execSync(`osascript "${deleteScriptPath}" '${params}'`, { encoding: 'utf8' });
        } catch (e) {
          // Ignore deletion errors in cleanup
        }
      });
    } else {
      if (createdEventUIDs.length > 0) {
        console.log('Note: Created events that may need manual cleanup:', createdEventUIDs.map(e => e.uid));
      }
    }
  });

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  describe('Basic functionality', () => {
    test('creates event with required fields and returns valid JSON', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Jest',
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = createTestEvent(params);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
    });

    test('returns success true and uid for valid event', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Valid',
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('uid');
      expect(typeof result.data.uid).toBe('string');
      expect(result.data.uid.length).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    test('returns summary in response', () => {
      const dates = getTestDates();
      const summary = 'Test Event - Summary Check';
      const params = {
        summary,
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('summary');
      expect(result.data.summary).toBe(summary);
    });
  });

  describe('Optional parameters', () => {
    test('creates event with location', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Location',
        startDate: dates.startDate,
        endDate: dates.endDate,
        location: 'Test Location 123'
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data.uid).toBeDefined();
    });

    test('creates event with notes', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Notes',
        startDate: dates.startDate,
        endDate: dates.endDate,
        notes: 'These are test notes for the event'
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data.uid).toBeDefined();
    });

    test('creates all-day event', () => {
      // For all-day events, use just the date portion
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const formatDate = (d) => d.toISOString().slice(0, 10);

      const params = {
        summary: 'Test All Day Event',
        startDate: formatDate(today),
        endDate: formatDate(tomorrow),
        allDay: true
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data.uid).toBeDefined();
    });

    test('creates event with specific calendar', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Specific Calendar',
        startDate: dates.startDate,
        endDate: dates.endDate,
        calendar: 'Home'  // Using Home calendar which typically exists
      };

      const result = createTestEvent(params);

      // May fail if Home calendar doesn't exist, which is acceptable
      if (result.success) {
        expect(result.data.uid).toBeDefined();
      } else {
        expect(result.error).toContain('Calendar');
      }
    });
  });

  describe('Error handling', () => {
    test('returns error for missing summary', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const jsonParams = JSON.stringify(params);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('summary');
    });

    test('returns error for missing startDate', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event',
        endDate: dates.endDate
      };

      const jsonParams = JSON.stringify(params);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('startDate');
    });

    test('returns error for missing endDate', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event',
        startDate: dates.startDate
      };

      const jsonParams = JSON.stringify(params);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('endDate');
    });

    test('returns error for non-existent calendar', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        calendar: 'NonExistentCalendar12345'
      };

      const jsonParams = JSON.stringify(params);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.toLowerCase()).toMatch(/calendar|not found/);
    });

    test('returns error for invalid JSON input', () => {
      const result = execSync(`osascript "${scriptPath}" 'not valid json'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    test('returns error when no arguments provided', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('Special characters handling', () => {
    test('handles special characters in summary', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event with "quotes" and \\backslash',
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data.uid).toBeDefined();
    });

    test('handles newlines in notes', () => {
      const dates = getTestDates();
      const params = {
        summary: 'Test Event - Multiline Notes',
        startDate: dates.startDate,
        endDate: dates.endDate,
        notes: 'Line 1\nLine 2\nLine 3'
      };

      const result = createTestEvent(params);

      expect(result.success).toBe(true);
      expect(result.data.uid).toBeDefined();
    });
  });
});
