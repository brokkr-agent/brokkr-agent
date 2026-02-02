// tests/lib/calendar-add-alarm.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - Add Alarm Script', () => {
  const scriptPath = path.join(scriptsDir, 'add-alarm.scpt');
  const createEventPath = path.join(scriptsDir, 'create-event.scpt');

  // Store UIDs of events we create so we can clean them up
  const createdEventUIDs = [];

  // Helper to create a test event and track its UID
  const createTestEvent = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${createEventPath}" '${jsonParams}'`, { encoding: 'utf8' });
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
    test('adds alarm to event and returns valid JSON', () => {
      // First create an event
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Alarm Event',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      // Add alarm to the event
      const alarmParams = { uid: eventUID, minutes: -15 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });

      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('error');
    });

    test('returns success true and alarm details', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Alarm Event 2',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: -30 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data).toHaveProperty('uid');
      expect(parsed.data.uid).toBe(eventUID);
      expect(parsed.data).toHaveProperty('alarmAdded');
      expect(parsed.data.alarmAdded).toBe(true);
      expect(parsed.data).toHaveProperty('triggerMinutes');
      expect(parsed.data.triggerMinutes).toBe(-30);
      expect(parsed.error).toBeNull();
    });

    test('handles 0 minutes (at event time)', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Alarm At Event Time',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: 0 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.triggerMinutes).toBe(0);
    });
  });

  describe('Alarm types', () => {
    test('adds display alarm (default type)', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Display Alarm',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      // No type specified, should default to display
      const alarmParams = { uid: eventUID, minutes: -15 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.alarmAdded).toBe(true);
    });

    test('adds display alarm with explicit type', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Explicit Display Alarm',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: -15, type: 'display' };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.alarmAdded).toBe(true);
    });

    test('adds sound alarm', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Sound Alarm',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: -10, type: 'sound' };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.data.alarmAdded).toBe(true);
    });

    test('adds email alarm', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Email Alarm',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: -60, type: 'email' };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      // Email alarms may not be supported by all accounts, so we accept success or a specific error
      if (parsed.success) {
        expect(parsed.data.alarmAdded).toBe(true);
      } else {
        // Email alarm might not be available for this calendar type
        expect(parsed.error).toBeDefined();
      }
    });
  });

  describe('Error handling', () => {
    test('returns error for missing uid', () => {
      const alarmParams = { minutes: -15 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('uid');
    });

    test('returns error for missing minutes', () => {
      const alarmParams = { uid: 'some-fake-uid' };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('minutes');
    });

    test('returns error for non-existent event uid', () => {
      const alarmParams = { uid: 'non-existent-event-12345', minutes: -15 };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });

    test('returns error for invalid alarm type', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Invalid Alarm Type',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      const alarmParams = { uid: eventUID, minutes: -15, type: 'invalid_type' };
      const jsonParams = JSON.stringify(alarmParams);
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('type');
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

  describe('Multiple alarms', () => {
    test('can add multiple alarms to same event', () => {
      const dates = getTestDates();
      const createResult = createTestEvent({
        summary: 'Test Multiple Alarms',
        startDate: dates.startDate,
        endDate: dates.endDate
      });

      expect(createResult.success).toBe(true);
      const eventUID = createResult.data.uid;

      // Add first alarm (15 minutes before)
      const alarm1Params = { uid: eventUID, minutes: -15 };
      const result1 = execSync(`osascript "${scriptPath}" '${JSON.stringify(alarm1Params)}'`, { encoding: 'utf8' });
      const parsed1 = JSON.parse(result1);
      expect(parsed1.success).toBe(true);

      // Add second alarm (1 hour before)
      const alarm2Params = { uid: eventUID, minutes: -60 };
      const result2 = execSync(`osascript "${scriptPath}" '${JSON.stringify(alarm2Params)}'`, { encoding: 'utf8' });
      const parsed2 = JSON.parse(result2);
      expect(parsed2.success).toBe(true);
    });
  });
});
