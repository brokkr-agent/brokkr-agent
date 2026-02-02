// tests/lib/calendar-modify-event.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - Modify Event Script', () => {
  const scriptPath = path.join(scriptsDir, 'modify-event.scpt');
  const createScriptPath = path.join(scriptsDir, 'create-event.scpt');
  const deleteScriptPath = path.join(scriptsDir, 'delete-event.scpt');

  // Store UIDs of events we create so we can clean them up
  const createdEventUIDs = [];

  // Helper to create a test event and track its UID
  const createTestEvent = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${createScriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    if (parsed.success && parsed.data && parsed.data.uid) {
      createdEventUIDs.push({ uid: parsed.data.uid, calendar: params.calendar || 'Home' });
    }
    return parsed;
  };

  // Helper to modify an event
  const modifyEvent = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  };

  // Get test dates (1 hour from now)
  const getTestDates = () => {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + 2); // +2 hours to avoid conflicts
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
    test('modifies event summary and returns valid JSON', () => {
      // First create an event
      const dates = getTestDates();
      const createParams = {
        summary: 'Original Title - Modify Test',
        startDate: dates.startDate,
        endDate: dates.endDate
      };
      const created = createTestEvent(createParams);
      expect(created.success).toBe(true);

      // Now modify it
      const modifyParams = {
        uid: created.data.uid,
        summary: 'Modified Title - Modify Test'
      };
      const result = modifyEvent(modifyParams);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('error');

      if (result.success) {
        expect(result.data).toHaveProperty('uid');
        expect(result.data).toHaveProperty('modified');
        expect(result.data.modified).toContain('summary');
        // Track the new UID if it changed
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('returns uid in response', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Test Event - UID Check',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        summary: 'Modified Event - UID Check'
      });

      if (result.success) {
        expect(result.data).toHaveProperty('uid');
        expect(typeof result.data.uid).toBe('string');
        expect(result.data.uid.length).toBeGreaterThan(0);
        // Track the new UID if it changed
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('returns list of modified fields', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Test Event - Modified Fields',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        summary: 'New Summary',
        location: 'New Location'
      });

      if (result.success) {
        expect(result.data).toHaveProperty('modified');
        expect(Array.isArray(result.data.modified)).toBe(true);
        expect(result.data.modified).toContain('summary');
        expect(result.data.modified).toContain('location');
        // Track the new UID if it changed
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });
  });

  describe('Updatable fields', () => {
    test('updates summary field', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Original Summary',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        summary: 'Updated Summary'
      });

      if (result.success) {
        expect(result.data.modified).toContain('summary');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('updates location field', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Location Test Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        location: 'Original Location'
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        location: 'New Location'
      });

      if (result.success) {
        expect(result.data.modified).toContain('location');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('updates notes field', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Notes Test Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        notes: 'Original notes'
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        notes: 'Updated notes'
      });

      if (result.success) {
        expect(result.data.modified).toContain('notes');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('updates startDate and endDate', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Date Change Test',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      // New dates (3 hours later)
      const newStart = new Date(dates.startDate);
      newStart.setHours(newStart.getHours() + 3);
      const newEnd = new Date(dates.endDate);
      newEnd.setHours(newEnd.getHours() + 3);

      const formatISO = (d) => d.toISOString().slice(0, 19);

      const result = modifyEvent({
        uid: created.data.uid,
        startDate: formatISO(newStart),
        endDate: formatISO(newEnd)
      });

      if (result.success) {
        expect(result.data.modified).toContain('startDate');
        expect(result.data.modified).toContain('endDate');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('updates allDay field', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'AllDay Test Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        allDay: false
      });
      expect(created.success).toBe(true);

      // Convert to all-day event
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const formatDate = (d) => d.toISOString().slice(0, 10);

      const result = modifyEvent({
        uid: created.data.uid,
        startDate: formatDate(today),
        endDate: formatDate(tomorrow),
        allDay: true
      });

      if (result.success) {
        expect(result.data.modified).toContain('allDay');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('updates multiple fields at once', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Multi-Update Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        location: 'Original Place',
        notes: 'Original Notes'
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        summary: 'Updated Multi-Update Event',
        location: 'New Place',
        notes: 'New Notes'
      });

      if (result.success) {
        expect(result.data.modified.length).toBeGreaterThanOrEqual(3);
        expect(result.data.modified).toContain('summary');
        expect(result.data.modified).toContain('location');
        expect(result.data.modified).toContain('notes');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });
  });

  describe('Error handling', () => {
    test('returns error for missing uid', () => {
      const result = modifyEvent({
        summary: 'New Summary'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.toLowerCase()).toMatch(/uid|required/);
    });

    test('returns error for event not found', () => {
      const result = modifyEvent({
        uid: 'nonexistent-uid-12345',
        summary: 'New Summary'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.toLowerCase()).toMatch(/not found|cannot find|no event/);
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

    test('returns error when no fields to update provided', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'No Changes Event',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid
        // No fields to update
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.toLowerCase()).toMatch(/no fields|nothing to update|fields to update/);
    });
  });

  describe('Special characters handling', () => {
    test('handles special characters in summary', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Special Chars Event',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        summary: 'Event with "quotes" and \\backslash'
      });

      if (result.success) {
        expect(result.data.modified).toContain('summary');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });

    test('handles newlines in notes', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Newline Notes Event',
        startDate: dates.startDate,
        endDate: dates.endDate
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        notes: 'Line 1\nLine 2\nLine 3'
      });

      if (result.success) {
        expect(result.data.modified).toContain('notes');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });
  });

  describe('Calendar specification', () => {
    test('can specify calendar to search in', () => {
      const dates = getTestDates();
      const created = createTestEvent({
        summary: 'Calendar Specific Event',
        startDate: dates.startDate,
        endDate: dates.endDate,
        calendar: 'Home'
      });
      expect(created.success).toBe(true);

      const result = modifyEvent({
        uid: created.data.uid,
        calendar: 'Home',
        summary: 'Modified Calendar Specific Event'
      });

      if (result.success) {
        expect(result.data.modified).toContain('summary');
        if (result.data.uid !== created.data.uid) {
          createdEventUIDs.push({ uid: result.data.uid, calendar: 'Home' });
        }
      }
    });
  });
});
