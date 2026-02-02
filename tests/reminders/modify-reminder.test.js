// tests/reminders/modify-reminder.test.js
// Test suite for modify-reminder.scpt
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('Reminders - Modify Reminder', () => {
  const scriptPath = path.join(process.cwd(), '.claude/skills/reminders/scripts/modify-reminder.scpt');
  const createScriptPath = path.join(process.cwd(), '.claude/skills/reminders/scripts/create-reminder.scpt');
  const deleteScriptPath = path.join(process.cwd(), '.claude/skills/reminders/scripts/delete-reminder.scpt');
  let testReminderID = null;

  // Helper to create a test reminder
  function createTestReminder(name = 'Modifiable Reminder') {
    const result = execSync(
      `osascript "${createScriptPath}" '{"name":"${name}"}'`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    if (!parsed.success) {
      throw new Error(`Failed to create test reminder: ${parsed.error}`);
    }
    return parsed.data.id;
  }

  // Helper to delete a reminder by ID
  function deleteReminder(id) {
    try {
      execSync(
        `osascript "${deleteScriptPath}" '{"id":"${id}"}'`,
        { encoding: 'utf8' }
      );
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  beforeAll(() => {
    // Create a reminder for testing modifications
    testReminderID = createTestReminder('Modifiable Reminder');
  });

  afterAll(() => {
    // Cleanup: delete the test reminder
    if (testReminderID) {
      deleteReminder(testReminderID);
    }
  });

  it('should have the script file', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('should return error when no arguments provided', () => {
    const result = execSync(
      `osascript "${scriptPath}"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Usage:');
  });

  it('should return error when only one argument provided', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Usage:');
  });

  it('should return error when only two arguments provided', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "name"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Usage:');
  });

  it('should return error for invalid reminder ID', () => {
    const result = execSync(
      `osascript "${scriptPath}" "invalid-id-12345" "name" "New Title"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('should return error for invalid property', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "invalidProperty" "New Value"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid property');
  });

  it('should modify reminder name', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "name" "Updated Reminder Title"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe('Updated Reminder Title');
    expect(parsed.data.id).toBe(testReminderID);
  });

  it('should modify reminder body', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "body" "New notes for the reminder"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.body).toBe('New notes for the reminder');
  });

  it('should modify reminder priority', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "priority" "1"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.priority).toBe(1);
  });

  it('should modify reminder priority to medium (5)', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "priority" "5"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.priority).toBe(5);
  });

  it('should modify reminder priority to low (9)', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "priority" "9"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data.priority).toBe(9);
  });

  it('should modify reminder due-date', () => {
    // Set a due date in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateStr = futureDate.toISOString().split('.')[0]; // Remove milliseconds

    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "due-date" "${dateStr}"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    // Due date should be set (not empty)
    expect(parsed.data.dueDate).toBeTruthy();
  });

  it('should return complete reminder data after modification', () => {
    const result = execSync(
      `osascript "${scriptPath}" "${testReminderID}" "name" "Final Test Name"`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveProperty('id');
    expect(parsed.data).toHaveProperty('name');
    expect(parsed.data).toHaveProperty('completed');
    expect(parsed.data).toHaveProperty('list');
    expect(parsed.error).toBeNull();
  });
});
