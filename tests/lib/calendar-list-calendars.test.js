// tests/lib/calendar-list-calendars.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('Calendar - List Calendars Script', () => {
  const scriptPath = path.join(process.cwd(), '.claude/skills/calendar/scripts/list-calendars.scpt');

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

  test('calendars have required properties if any exist', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data && parsed.data.length > 0) {
      const calendar = parsed.data[0];
      expect(calendar).toHaveProperty('name');
      expect(typeof calendar.name).toBe('string');
      expect(calendar).toHaveProperty('type');
      expect(typeof calendar.type).toBe('string');
      expect(calendar).toHaveProperty('writable');
      expect(typeof calendar.writable).toBe('boolean');
    }
  });

  test('success is true when no error occurs', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
  });

  test('all calendars have valid type values', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    const validTypes = ['Local', 'CalDAV', 'Exchange', 'Subscription', 'Birthday', 'iCloud', 'Unknown'];

    if (parsed.data && parsed.data.length > 0) {
      parsed.data.forEach(calendar => {
        expect(validTypes).toContain(calendar.type);
      });
    }
  });
});
