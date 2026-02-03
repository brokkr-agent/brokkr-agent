/**
 * Reminders Skill - Node.js Wrapper Module
 *
 * This module provides Apple Reminders integration via AppleScript.
 * All functions call AppleScripts in .claude/skills/reminders/scripts/
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

/**
 * Execute an AppleScript and return parsed JSON result
 * @param {string} scriptName - Name of the script file (e.g., 'list-lists.scpt')
 * @param {string|null} arg - Optional JSON argument
 * @returns {Promise<any>} Parsed data from the script
 * @throws {Error} If script returns an error
 */
async function executeScript(scriptName, arg = null) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);

  let command = `osascript "${scriptPath}"`;
  if (arg !== null) {
    // Escape single quotes in the argument for shell
    const escapedArg = arg.replace(/'/g, "'\\''");
    command += ` '${escapedArg}'`;
  }

  try {
    const result = execSync(command, { encoding: 'utf8' });
    const parsed = JSON.parse(result.trim());

    if (!parsed.success) {
      throw new Error(parsed.error || 'Unknown error from AppleScript');
    }

    return parsed.data;
  } catch (error) {
    // If it's already an Error with a message from our parsing, rethrow
    if (error instanceof Error && error.message && !error.message.includes('Command failed')) {
      throw error;
    }
    // Otherwise, try to parse the error output
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout.trim());
        if (!parsed.success) {
          throw new Error(parsed.error || 'Unknown error from AppleScript');
        }
      } catch (parseError) {
        // Couldn't parse, throw original
      }
    }
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * List all reminder lists
 * @returns {Promise<Array<{name: string, id: string}>>} Array of list objects
 */
export async function listLists() {
  return executeScript('list-lists.scpt');
}

/**
 * List all reminders from all lists
 * @returns {Promise<Array<Object>>} Array of reminder objects
 */
export async function listAll() {
  const reminders = await executeScript('list-all.scpt');
  return reminders.map(normalizeReminder);
}

/**
 * List incomplete reminders from all lists
 * @returns {Promise<Array<Object>>} Array of incomplete reminder objects
 */
export async function listIncomplete() {
  const reminders = await executeScript('list-incomplete.scpt');
  return reminders.map(normalizeReminder);
}

/**
 * List reminders due within N days
 * @param {number} days - Number of days to look ahead (default: 7)
 * @returns {Promise<Array<Object>>} Array of reminder objects with due dates
 */
export async function listDue(days = 7) {
  // Calculate date range
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const startStr = formatDateForScript(startDate);
  const endStr = formatDateForScript(endDate);

  // list-due.scpt takes two date arguments (start, end)
  const scriptPath = path.join(SCRIPTS_DIR, 'list-due.scpt');
  const command = `osascript "${scriptPath}" "${startStr}" "${endStr}"`;

  try {
    const result = execSync(command, { encoding: 'utf8' });
    const parsed = JSON.parse(result.trim());

    if (!parsed.success) {
      throw new Error(parsed.error || 'Unknown error from AppleScript');
    }

    return parsed.data.map(normalizeReminder);
  } catch (error) {
    if (error instanceof Error && error.message && !error.message.includes('Command failed')) {
      throw error;
    }
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * Create a new reminder
 * @param {Object} options - Reminder options
 * @param {string} options.name - Reminder title (required)
 * @param {string} [options.listName] - Target list name
 * @param {string} [options.dueDate] - Due date in ISO 8601 format
 * @param {string} [options.body] - Notes/description
 * @param {number} [options.priority] - Priority (0=none, 1=high, 5=medium, 9=low)
 * @returns {Promise<Object>} Created reminder data
 * @throws {Error} If name is missing or creation fails
 */
export async function createReminder({ name, listName, dueDate, body, priority }) {
  if (!name || name.trim() === '') {
    throw new Error('Missing required field: name');
  }

  const params = { name };
  if (listName) params.list = listName;
  if (dueDate) params.dueDate = dueDate;
  if (body) params.body = body;
  if (priority !== undefined) params.priority = priority;

  const result = await executeScript('create-reminder.scpt', JSON.stringify(params));

  // Fetch the full reminder data using find
  try {
    const found = await findReminder('id', result.id);
    return found;
  } catch (e) {
    // If find fails, return what we have
    return result;
  }
}

/**
 * Find a reminder by id or name
 * @param {string} searchType - Either 'id' or 'name'
 * @param {string} searchValue - The value to search for
 * @returns {Promise<Object>} Found reminder object
 * @throws {Error} If search type is invalid or reminder not found
 */
export async function findReminder(searchType, searchValue) {
  if (searchType !== 'id' && searchType !== 'name') {
    throw new Error('Invalid search type. Must be "id" or "name"');
  }

  const params = {};
  params[searchType] = searchValue;

  const results = await executeScript('find-reminder.scpt', JSON.stringify(params));

  if (!results || results.length === 0) {
    throw new Error(`Reminder not found with ${searchType}: ${searchValue}`);
  }

  // Return the first match (for id search, there should only be one)
  return normalizeReminder(results[0]);
}

/**
 * Mark a reminder as complete
 * @param {string} id - Reminder ID
 * @returns {Promise<Object>} Updated reminder data with completed: true
 * @throws {Error} If reminder not found
 */
export async function completeReminder(id) {
  const result = await executeScript('complete-reminder.scpt', JSON.stringify({ id }));
  return { ...result, completed: true };
}

/**
 * Delete a reminder
 * @param {string} id - Reminder ID
 * @returns {Promise<{id: string, deleted: boolean}>} Deletion confirmation
 * @throws {Error} If reminder not found
 */
export async function deleteReminder(id) {
  return executeScript('delete-reminder.scpt', JSON.stringify({ id }));
}

/**
 * Modify a reminder property
 * @param {string} id - Reminder ID
 * @param {string} property - Property to modify ('name', 'body', 'priority', 'due-date')
 * @param {string} newValue - New value for the property
 * @returns {Promise<Object>} Updated reminder data
 * @throws {Error} If reminder not found or property invalid
 */
export async function modifyReminder(id, property, newValue) {
  // Validate property
  const validProperties = ['name', 'body', 'priority', 'due-date'];
  if (!validProperties.includes(property)) {
    throw new Error(`Invalid property: ${property}. Valid properties: ${validProperties.join(', ')}`);
  }

  // modify-reminder.scpt takes 3 positional arguments: id, property, value
  const scriptPath = path.join(SCRIPTS_DIR, 'modify-reminder.scpt');

  // Escape single quotes in arguments for shell safety (prevents shell injection)
  const escapedId = id.replace(/'/g, "'\\''");
  const escapedProperty = property.replace(/'/g, "'\\''");
  const escapedValue = newValue.replace(/'/g, "'\\''");
  const command = `osascript "${scriptPath}" '${escapedId}' '${escapedProperty}' '${escapedValue}'`;

  try {
    const result = execSync(command, { encoding: 'utf8' });
    const parsed = JSON.parse(result.trim());

    if (!parsed.success) {
      throw new Error(parsed.error || 'Unknown error from AppleScript');
    }

    return normalizeReminder(parsed.data);
  } catch (error) {
    // Check if it's a JSON response with error
    if (error.stdout) {
      try {
        const parsed = JSON.parse(error.stdout.trim());
        if (!parsed.success) {
          throw new Error(parsed.error || 'Unknown error from AppleScript');
        }
      } catch (parseError) {
        if (parseError.message && !parseError.message.includes('Unexpected')) {
          throw parseError;
        }
      }
    }
    if (error instanceof Error && error.message && !error.message.includes('Command failed')) {
      throw error;
    }
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * Normalize reminder object from AppleScript output
 * Maps listName -> list for consistency
 * @param {Object} reminder - Raw reminder from AppleScript
 * @returns {Object} Normalized reminder object
 */
function normalizeReminder(reminder) {
  return {
    id: reminder.id,
    name: reminder.name,
    body: reminder.body || '',
    completed: reminder.completed,
    dueDate: reminder.dueDate,
    priority: reminder.priority,
    list: reminder.listName || reminder.list
  };
}

/**
 * Format a Date object as YYYY-MM-DD for AppleScript
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDateForScript(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Legacy exports for backward compatibility
export const listReminders = listAll;
export const getLists = listLists;
export const updateReminder = modifyReminder;

// Default export with all functions
export default {
  listLists,
  listAll,
  listIncomplete,
  listDue,
  createReminder,
  findReminder,
  completeReminder,
  deleteReminder,
  modifyReminder,
  // Legacy aliases
  listReminders: listAll,
  getLists: listLists,
  updateReminder: modifyReminder
};
