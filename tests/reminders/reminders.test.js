// tests/reminders/reminders.test.js
// Test suite for the Node.js wrapper module
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { execSync } from 'child_process';
import path from 'path';

// Import the reminders module
import * as reminders from '../../.claude/skills/reminders/lib/reminders.js';

describe('Reminders - Node.js Wrapper Module', () => {
  const scriptsPath = path.join(process.cwd(), '.claude/skills/reminders/scripts');
  let testReminderId = null;
  const testListName = 'Reminders'; // Default list

  // Helper to create test reminder directly via script
  function createTestReminderDirect(name) {
    const result = execSync(
      `osascript "${scriptsPath}/create-reminder.scpt" '{"name":"${name}"}'`,
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(result);
    if (!parsed.success) {
      throw new Error(`Failed to create test reminder: ${parsed.error}`);
    }
    return parsed.data.id;
  }

  // Helper to delete reminder directly
  function deleteReminderDirect(id) {
    try {
      execSync(
        `osascript "${scriptsPath}/delete-reminder.scpt" '{"id":"${id}"}'`,
        { encoding: 'utf8' }
      );
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  describe('Module exports', () => {
    it('should export listLists function', () => {
      expect(typeof reminders.listLists).toBe('function');
    });

    it('should export listAll function', () => {
      expect(typeof reminders.listAll).toBe('function');
    });

    it('should export listIncomplete function', () => {
      expect(typeof reminders.listIncomplete).toBe('function');
    });

    it('should export listDue function', () => {
      expect(typeof reminders.listDue).toBe('function');
    });

    it('should export createReminder function', () => {
      expect(typeof reminders.createReminder).toBe('function');
    });

    it('should export findReminder function', () => {
      expect(typeof reminders.findReminder).toBe('function');
    });

    it('should export completeReminder function', () => {
      expect(typeof reminders.completeReminder).toBe('function');
    });

    it('should export deleteReminder function', () => {
      expect(typeof reminders.deleteReminder).toBe('function');
    });

    it('should export modifyReminder function', () => {
      expect(typeof reminders.modifyReminder).toBe('function');
    });
  });

  describe('listLists()', () => {
    it('should return an array of list objects', async () => {
      const result = await reminders.listLists();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return lists with name and id properties', async () => {
      const result = await reminders.listLists();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('id');
    });

    it('should include the default Reminders list', async () => {
      const result = await reminders.listLists();
      const defaultList = result.find(list => list.name === 'Reminders');
      expect(defaultList).toBeDefined();
    });
  });

  describe('listAll()', () => {
    let tempReminderId = null;

    beforeAll(() => {
      // Create a test reminder to ensure we have at least one
      tempReminderId = createTestReminderDirect('List All Test Reminder');
    });

    afterAll(() => {
      if (tempReminderId) {
        deleteReminderDirect(tempReminderId);
      }
    });

    it('should return an array of reminders', async () => {
      const result = await reminders.listAll();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return reminders with required properties', async () => {
      const result = await reminders.listAll();
      expect(result.length).toBeGreaterThan(0);
      const reminder = result[0];
      expect(reminder).toHaveProperty('id');
      expect(reminder).toHaveProperty('name');
      expect(reminder).toHaveProperty('completed');
      expect(reminder).toHaveProperty('list');
    });
  });

  describe('listIncomplete()', () => {
    let tempReminderId = null;

    beforeAll(() => {
      // Create an incomplete test reminder
      tempReminderId = createTestReminderDirect('Incomplete Test Reminder');
    });

    afterAll(() => {
      if (tempReminderId) {
        deleteReminderDirect(tempReminderId);
      }
    });

    it('should return an array of incomplete reminders', async () => {
      const result = await reminders.listIncomplete();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should only return incomplete reminders', async () => {
      const result = await reminders.listIncomplete();
      for (const reminder of result) {
        expect(reminder.completed).toBe(false);
      }
    });
  });

  describe('listDue()', () => {
    it('should return an array', async () => {
      const result = await reminders.listDue(7);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept a days parameter', async () => {
      const result = await reminders.listDue(30);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should default to 7 days if no parameter provided', async () => {
      const result = await reminders.listDue();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createReminder()', () => {
    const createdIds = [];

    afterAll(() => {
      // Cleanup all created reminders
      for (const id of createdIds) {
        deleteReminderDirect(id);
      }
    });

    it('should create a reminder with just a name', async () => {
      const result = await reminders.createReminder({ name: 'Simple Test Reminder' });
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'Simple Test Reminder');
      createdIds.push(result.id);
    });

    it('should create a reminder with all options', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      const result = await reminders.createReminder({
        name: 'Full Options Reminder',
        listName: 'Reminders',
        dueDate: futureDate.toISOString(),
        body: 'Test notes for the reminder',
        priority: 1
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name', 'Full Options Reminder');
      expect(result.body).toBe('Test notes for the reminder');
      expect(result.priority).toBe(1);
      createdIds.push(result.id);
    });

    it('should throw error when name is missing', async () => {
      await expect(reminders.createReminder({})).rejects.toThrow();
    });

    it('should throw error when name is empty', async () => {
      await expect(reminders.createReminder({ name: '' })).rejects.toThrow();
    });
  });

  describe('findReminder()', () => {
    let tempReminderId = null;
    const uniqueName = 'Unique Find Test ' + Date.now();

    beforeAll(() => {
      tempReminderId = createTestReminderDirect(uniqueName);
    });

    afterAll(() => {
      if (tempReminderId) {
        deleteReminderDirect(tempReminderId);
      }
    });

    it('should find reminder by id', async () => {
      const result = await reminders.findReminder('id', tempReminderId);
      expect(result).toHaveProperty('id', tempReminderId);
    });

    it('should find reminder by name', async () => {
      const result = await reminders.findReminder('name', uniqueName);
      expect(result).toHaveProperty('name', uniqueName);
      expect(result).toHaveProperty('id', tempReminderId);
    });

    it('should throw error for invalid search type', async () => {
      await expect(reminders.findReminder('invalid', 'value')).rejects.toThrow();
    });

    it('should throw error when reminder not found by id', async () => {
      await expect(reminders.findReminder('id', 'nonexistent-id-12345')).rejects.toThrow();
    });
  });

  describe('completeReminder()', () => {
    let tempReminderId = null;

    beforeAll(() => {
      tempReminderId = createTestReminderDirect('Complete Test Reminder');
    });

    afterAll(() => {
      if (tempReminderId) {
        deleteReminderDirect(tempReminderId);
      }
    });

    it('should mark a reminder as complete', async () => {
      const result = await reminders.completeReminder(tempReminderId);
      expect(result).toHaveProperty('completed', true);
    });

    it('should throw error for invalid reminder id', async () => {
      await expect(reminders.completeReminder('nonexistent-id-12345')).rejects.toThrow();
    });
  });

  describe('deleteReminder()', () => {
    let tempReminderId = null;

    beforeAll(() => {
      tempReminderId = createTestReminderDirect('Delete Test Reminder');
    });

    it('should delete a reminder', async () => {
      const result = await reminders.deleteReminder(tempReminderId);
      expect(result).toHaveProperty('deleted', true);
      tempReminderId = null; // Already deleted
    });

    it('should throw error for invalid reminder id', async () => {
      await expect(reminders.deleteReminder('nonexistent-id-12345')).rejects.toThrow();
    });
  });

  describe('modifyReminder()', () => {
    let tempReminderId = null;

    beforeAll(() => {
      tempReminderId = createTestReminderDirect('Modify Test Reminder');
    });

    afterAll(() => {
      if (tempReminderId) {
        deleteReminderDirect(tempReminderId);
      }
    });

    it('should modify reminder name', async () => {
      const result = await reminders.modifyReminder(tempReminderId, 'name', 'Modified Name');
      expect(result).toHaveProperty('name', 'Modified Name');
    });

    it('should modify reminder body', async () => {
      const result = await reminders.modifyReminder(tempReminderId, 'body', 'New body text');
      expect(result).toHaveProperty('body', 'New body text');
    });

    it('should modify reminder priority', async () => {
      const result = await reminders.modifyReminder(tempReminderId, 'priority', '5');
      expect(result).toHaveProperty('priority', 5);
    });

    it('should modify reminder due-date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateStr = futureDate.toISOString().split('.')[0];

      const result = await reminders.modifyReminder(tempReminderId, 'due-date', dateStr);
      expect(result).toHaveProperty('dueDate');
      expect(result.dueDate).toBeTruthy();
    });

    it('should throw error for invalid reminder id', async () => {
      await expect(reminders.modifyReminder('nonexistent-id', 'name', 'Test')).rejects.toThrow();
    });

    it('should throw error for invalid property', async () => {
      await expect(reminders.modifyReminder(tempReminderId, 'invalidProp', 'value')).rejects.toThrow();
    });
  });
});
