// tests/lib/calendar-check-conflicts.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - Check Conflicts Script', () => {
  const scriptPath = path.join(scriptsDir, 'check-conflicts.scpt');

  // Helper to get test date strings
  const getTestDates = (hoursFromNow = 1, durationHours = 1) => {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + hoursFromNow);
    startDate.setMinutes(0);
    startDate.setSeconds(0);
    startDate.setMilliseconds(0);

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + durationHours);

    // Format as ISO 8601 without milliseconds
    const formatISO = (d) => d.toISOString().slice(0, 19);

    return {
      startDate: formatISO(startDate),
      endDate: formatISO(endDate)
    };
  };

  // Helper to run the script
  const runScript = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  };

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  describe('Basic functionality', () => {
    test('returns valid JSON with required fields', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');
    });

    test('has hasConflicts boolean in data', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
      expect(typeof result.data.hasConflicts).toBe('boolean');
    });

    test('has conflicts array in data', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('conflicts');
      expect(Array.isArray(result.data.conflicts)).toBe(true);
    });

    test('conflicts array is empty when hasConflicts is false', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      if (!result.data.hasConflicts) {
        expect(result.data.conflicts).toHaveLength(0);
      }
    });

    test('conflicts array has items when hasConflicts is true', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      if (result.data.hasConflicts) {
        expect(result.data.conflicts.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Conflict event structure', () => {
    test('conflicting events have required properties if any exist', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      if (result.data.conflicts && result.data.conflicts.length > 0) {
        const conflict = result.data.conflicts[0];
        expect(conflict).toHaveProperty('uid');
        expect(typeof conflict.uid).toBe('string');
        expect(conflict).toHaveProperty('summary');
        expect(typeof conflict.summary).toBe('string');
        expect(conflict).toHaveProperty('startDate');
        expect(typeof conflict.startDate).toBe('string');
        expect(conflict).toHaveProperty('endDate');
        expect(typeof conflict.endDate).toBe('string');
        expect(conflict).toHaveProperty('calendar');
        expect(typeof conflict.calendar).toBe('string');
      }
    });

    test('conflict dates are in ISO 8601 format', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      if (result.data.conflicts && result.data.conflicts.length > 0) {
        const conflict = result.data.conflicts[0];
        // ISO 8601 format: YYYY-MM-DDTHH:MM:SS
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
        expect(conflict.startDate).toMatch(iso8601Regex);
        expect(conflict.endDate).toMatch(iso8601Regex);
      }
    });
  });

  describe('Optional parameters', () => {
    test('accepts excludeCalendars parameter', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate,
        excludeCalendars: ['Holidays', 'Birthdays']
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
      expect(result.data).toHaveProperty('conflicts');
    });

    test('accepts includeAllDay parameter', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate,
        includeAllDay: true
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
    });

    test('by default excludes all-day events', () => {
      const dates = getTestDates();
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      // All-day events should not appear unless includeAllDay is true
      if (result.data.conflicts && result.data.conflicts.length > 0) {
        result.data.conflicts.forEach(conflict => {
          // If allDay property exists, it should be false by default
          if (conflict.allDay !== undefined) {
            expect(conflict.allDay).toBe(false);
          }
        });
      }
    });
  });

  describe('Error handling', () => {
    test('returns error for missing startDate', () => {
      const dates = getTestDates();
      const params = {
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
        startDate: dates.startDate
      };

      const jsonParams = JSON.stringify(params);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('endDate');
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

  describe('Date range handling', () => {
    test('accepts dates in the past', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const endDate = new Date(pastDate);
      endDate.setHours(endDate.getHours() + 1);

      const formatISO = (d) => d.toISOString().slice(0, 19);

      const params = {
        startDate: formatISO(pastDate),
        endDate: formatISO(endDate)
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
    });

    test('accepts dates in the future', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate);
      endDate.setHours(endDate.getHours() + 1);

      const formatISO = (d) => d.toISOString().slice(0, 19);

      const params = {
        startDate: formatISO(futureDate),
        endDate: formatISO(endDate)
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
    });

    test('handles multi-hour time slots', () => {
      const dates = getTestDates(2, 4); // 2 hours from now, 4 hour duration
      const params = {
        startDate: dates.startDate,
        endDate: dates.endDate
      };

      const result = runScript(params);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('hasConflicts');
    });
  });
});
