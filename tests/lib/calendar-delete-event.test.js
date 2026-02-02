// tests/lib/calendar-delete-event.test.js
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const scriptsDir = path.join(process.cwd(), '.claude/skills/calendar/scripts');

describe('Calendar - Delete Event Script', () => {
  const scriptPath = path.join(scriptsDir, 'delete-event.scpt');
  const createScriptPath = path.join(scriptsDir, 'create-event.scpt');

  // Helper to create a test event for deletion
  const createTestEvent = (summary = 'Test Event - Delete Test') => {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() + 2);
    startDate.setMinutes(0);
    startDate.setSeconds(0);

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1);

    const formatISO = (d) => d.toISOString().slice(0, 19);

    const params = {
      summary,
      startDate: formatISO(startDate),
      endDate: formatISO(endDate)
    };

    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${createScriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  };

  // Helper to run delete script
  const deleteEvent = (params) => {
    const jsonParams = JSON.stringify(params);
    const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  };

  test('script file exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  describe('Basic functionality', () => {
    test('deletes event by UID and returns valid JSON', () => {
      // First create an event to delete
      const createResult = createTestEvent('Event To Delete - Basic');
      expect(createResult.success).toBe(true);

      const uid = createResult.data.uid;

      // Now delete it
      const deleteResult = deleteEvent({ uid });

      expect(deleteResult).toHaveProperty('success');
      expect(deleteResult).toHaveProperty('data');
      expect(deleteResult).toHaveProperty('error');
    });

    test('returns success true and deleted flag for valid UID', () => {
      // Create an event to delete
      const createResult = createTestEvent('Event To Delete - Success');
      expect(createResult.success).toBe(true);

      const uid = createResult.data.uid;

      // Delete it
      const deleteResult = deleteEvent({ uid });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data).toHaveProperty('uid');
      expect(deleteResult.data.uid).toBe(uid);
      expect(deleteResult.data).toHaveProperty('deleted');
      expect(deleteResult.data.deleted).toBe(true);
      expect(deleteResult.error).toBeNull();
    });

    test('deleting same event twice fails on second attempt', () => {
      // Create an event to delete
      const createResult = createTestEvent('Event To Delete - Twice');
      expect(createResult.success).toBe(true);

      const uid = createResult.data.uid;

      // Delete it first time
      const firstDelete = deleteEvent({ uid });
      expect(firstDelete.success).toBe(true);

      // Try to delete again - should fail
      const secondDelete = deleteEvent({ uid });
      expect(secondDelete.success).toBe(false);
      expect(secondDelete.error).toBeDefined();
      expect(secondDelete.error.toLowerCase()).toMatch(/not found|no event/);
    });
  });

  describe('Error handling', () => {
    test('returns error for missing UID', () => {
      const jsonParams = JSON.stringify({});
      const result = execSync(`osascript "${scriptPath}" '${jsonParams}'`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.toLowerCase()).toContain('uid');
    });

    test('returns error for empty UID', () => {
      const result = deleteEvent({ uid: '' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.toLowerCase()).toContain('uid');
    });

    test('returns error for non-existent event UID', () => {
      const result = deleteEvent({ uid: 'non-existent-uid-12345-xyz' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.toLowerCase()).toMatch(/not found|no event/);
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

  describe('Safety', () => {
    test('only deletes single event by exact UID match', () => {
      // Create two events with similar summaries
      const event1 = createTestEvent('Similar Event 1');
      const event2 = createTestEvent('Similar Event 2');

      expect(event1.success).toBe(true);
      expect(event2.success).toBe(true);

      // Delete only the first one
      const deleteResult = deleteEvent({ uid: event1.data.uid });
      expect(deleteResult.success).toBe(true);

      // Second event should still exist (verify by trying to delete it)
      const deleteSecond = deleteEvent({ uid: event2.data.uid });
      expect(deleteSecond.success).toBe(true);
    });
  });

  describe('Input validation', () => {
    test('rejects null UID', () => {
      const result = deleteEvent({ uid: null });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('handles UID with special characters in search', () => {
      // Try to delete with UID containing special characters
      // This should fail gracefully (not found), not crash
      const result = deleteEvent({ uid: 'test-uid-with-"quotes"-and-\\backslash' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
