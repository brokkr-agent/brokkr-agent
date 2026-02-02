// tests/lib/calendar-list-events.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - List Today Events Script', () => {
  const scriptPath = path.join(scriptsDir, 'list-today.scpt');

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  test('returns valid JSON', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    expect(() => JSON.parse(result)).not.toThrow();
  });

  test('has success field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('success');
    expect(typeof parsed.success).toBe('boolean');
  });

  test('has data field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('data');
  });

  test('has error field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
  });

  test('data is an array', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test('events have required properties if any exist', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data && parsed.data.length > 0) {
      const event = parsed.data[0];
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
      expect(event).toHaveProperty('allDay');
      expect(typeof event.allDay).toBe('boolean');
      expect(event).toHaveProperty('calendar');
      expect(typeof event.calendar).toBe('string');
    }
  });

  test('success is true when no error occurs', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
  });
});

describe('Calendar - List Week Events Script', () => {
  const scriptPath = path.join(scriptsDir, 'list-week.scpt');

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  test('returns valid JSON', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    expect(() => JSON.parse(result)).not.toThrow();
  });

  test('has success field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('success');
    expect(typeof parsed.success).toBe('boolean');
  });

  test('has data field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('data');
  });

  test('has error field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
  });

  test('data is an array', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test('events have required properties if any exist', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data && parsed.data.length > 0) {
      const event = parsed.data[0];
      expect(event).toHaveProperty('uid');
      expect(event).toHaveProperty('summary');
      expect(event).toHaveProperty('startDate');
      expect(event).toHaveProperty('endDate');
      expect(event).toHaveProperty('location');
      expect(event).toHaveProperty('notes');
      expect(event).toHaveProperty('allDay');
      expect(event).toHaveProperty('calendar');
    }
  });

  test('success is true when no error occurs', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
  });
});

describe('Calendar - List Events (Custom Date Range) Script', () => {
  const scriptPath = path.join(scriptsDir, 'list-events.scpt');

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  test('returns valid JSON with no arguments (defaults to today)', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    expect(() => JSON.parse(result)).not.toThrow();
  });

  test('has success field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('success');
    expect(typeof parsed.success).toBe('boolean');
  });

  test('has data field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('data');
  });

  test('has error field in response', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('error');
  });

  test('data is an array', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test('accepts date range arguments', () => {
    // Get today's date and a week from now in YYYY-MM-DD format
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startDate = today.toISOString().split('T')[0];
    const endDate = nextWeek.toISOString().split('T')[0];

    const result = execSync(`osascript "${scriptPath}" "${startDate}" "${endDate}"`, { encoding: 'utf8' });
    expect(() => JSON.parse(result)).not.toThrow();

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test('events have required properties if any exist', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data && parsed.data.length > 0) {
      const event = parsed.data[0];
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
      expect(event).toHaveProperty('allDay');
      expect(typeof event.allDay).toBe('boolean');
      expect(event).toHaveProperty('calendar');
      expect(typeof event.calendar).toBe('string');
    }
  });

  test('startDate is in ISO 8601 format if events exist', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data && parsed.data.length > 0) {
      const event = parsed.data[0];
      // ISO 8601 format: YYYY-MM-DDTHH:MM:SS
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
      expect(event.startDate).toMatch(iso8601Regex);
      expect(event.endDate).toMatch(iso8601Regex);
    }
  });

  test('success is true when no error occurs', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
  });
});
