/**
 * Calendar Skill - Node.js Wrapper Module
 *
 * Provides Apple Calendar integration via AppleScript.
 * All functions invoke the corresponding .scpt files in ../scripts/
 *
 * Status: IMPLEMENTED
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');

/**
 * Execute an AppleScript and return parsed JSON result
 * @param {string} scriptName - Name of the script file (e.g., 'list-calendars.scpt')
 * @param {Object|null} params - Parameters to pass as JSON
 * @returns {Object} Parsed result with success, data, and error fields
 */
function executeScript(scriptName, params = null) {
  const scriptPath = join(SCRIPTS_DIR, scriptName);

  try {
    let command = `osascript "${scriptPath}"`;
    if (params !== null) {
      const jsonParams = JSON.stringify(params).replace(/'/g, "'\\''");
      command += ` '${jsonParams}'`;
    }

    const output = execSync(command, {
      encoding: 'utf8',
      timeout: 30000 // 30 second timeout
    });

    return JSON.parse(output.trim());
  } catch (error) {
    // If it's an exec error, try to parse the output anyway
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout.trim());
      } catch (e) {
        // Fall through to error response
      }
    }

    return {
      success: false,
      data: null,
      error: error.message || String(error)
    };
  }
}

/**
 * Format a Date object to ISO 8601 string
 * @param {Date} date - Date object
 * @returns {string} ISO 8601 formatted string (YYYY-MM-DDTHH:MM:SS)
 */
function formatDate(date) {
  if (!(date instanceof Date)) {
    return date; // Assume it's already a string
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * List all calendars
 * @returns {Object} Result with calendars array
 */
export function listCalendars() {
  return executeScript('list-calendars.scpt');
}

/**
 * List today's events
 * @returns {Object} Result with events array
 */
export function listToday() {
  return executeScript('list-today.scpt');
}

/**
 * List this week's events
 * @returns {Object} Result with events array
 */
export function listWeek() {
  return executeScript('list-week.scpt');
}

/**
 * List events in a date range
 * @param {Date|string} startDate - Start of date range
 * @param {Date|string} endDate - End of date range
 * @returns {Object} Result with events array
 */
export function listEvents(startDate, endDate) {
  return executeScript('list-events.scpt', {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  });
}

/**
 * Create a new calendar event
 * @param {Object} event - Event details
 * @param {string} event.summary - Event title (required)
 * @param {Date|string} event.startDate - Event start time (required)
 * @param {Date|string} event.endDate - Event end time (required)
 * @param {string} [event.calendar] - Target calendar name
 * @param {string} [event.location] - Event location
 * @param {string} [event.notes] - Event notes/description
 * @param {boolean} [event.allDay] - All-day event flag
 * @returns {Object} Result with created event uid and summary
 */
export function createEvent(event) {
  const params = {
    summary: event.summary,
    startDate: formatDate(event.startDate),
    endDate: formatDate(event.endDate)
  };

  if (event.calendar) params.calendar = event.calendar;
  if (event.location) params.location = event.location;
  if (event.notes) params.notes = event.notes;
  if (event.allDay !== undefined) params.allDay = event.allDay;

  return executeScript('create-event.scpt', params);
}

/**
 * Find events by UID or summary
 * @param {Object} query - Search criteria
 * @param {string} [query.uid] - Event UID (exact match)
 * @param {string} [query.summary] - Summary text (partial match)
 * @param {Date|string} [query.startDate] - Search range start
 * @param {Date|string} [query.endDate] - Search range end
 * @returns {Object} Result with matching events array
 */
export function findEvent(query) {
  const params = {};

  if (query.uid) params.uid = query.uid;
  if (query.summary) params.summary = query.summary;
  if (query.startDate) params.startDate = formatDate(query.startDate);
  if (query.endDate) params.endDate = formatDate(query.endDate);

  return executeScript('find-event.scpt', params);
}

/**
 * Modify an existing calendar event
 * Note: Due to AppleScript limitations, this uses delete-and-recreate.
 * The event UID will change.
 *
 * @param {string} uid - Event UID to modify
 * @param {Object} updates - Fields to update
 * @param {string} [updates.summary] - New title
 * @param {Date|string} [updates.startDate] - New start time
 * @param {Date|string} [updates.endDate] - New end time
 * @param {string} [updates.location] - New location
 * @param {string} [updates.notes] - New notes
 * @param {boolean} [updates.allDay] - All-day flag
 * @returns {Object} Result with new uid and modified fields
 */
export function modifyEvent(uid, updates) {
  const params = { uid };

  if (updates.summary !== undefined) params.summary = updates.summary;
  if (updates.startDate !== undefined) params.startDate = formatDate(updates.startDate);
  if (updates.endDate !== undefined) params.endDate = formatDate(updates.endDate);
  if (updates.location !== undefined) params.location = updates.location;
  if (updates.notes !== undefined) params.notes = updates.notes;
  if (updates.allDay !== undefined) params.allDay = updates.allDay;

  return executeScript('modify-event.scpt', params);
}

/**
 * Delete a calendar event
 * @param {string} uid - Event UID to delete
 * @returns {Object} Result with deleted status
 */
export function deleteEvent(uid) {
  return executeScript('delete-event.scpt', { uid });
}

/**
 * Check for scheduling conflicts
 * @param {Date|string} startDate - Proposed start time
 * @param {Date|string} endDate - Proposed end time
 * @param {Object} [options] - Additional options
 * @param {string[]} [options.excludeCalendars] - Calendars to skip
 * @param {boolean} [options.includeAllDay] - Include all-day events
 * @returns {Object} Result with hasConflicts and conflicts array
 */
export function checkConflicts(startDate, endDate, options = {}) {
  const params = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };

  if (options.excludeCalendars) params.excludeCalendars = options.excludeCalendars;
  if (options.includeAllDay !== undefined) params.includeAllDay = options.includeAllDay;

  return executeScript('check-conflicts.scpt', params);
}

/**
 * Add an alarm to an event
 * @param {string} uid - Event UID
 * @param {number} minutes - Minutes before event (negative) or after start
 * @param {string} [type='display'] - Alarm type: 'display', 'sound', or 'email'
 * @returns {Object} Result with alarmAdded status
 */
export function addAlarm(uid, minutes, type = 'display') {
  return executeScript('add-alarm.scpt', { uid, minutes, type });
}

/**
 * Handle a calendar notification/reminder
 * @param {Object} notification - Notification data from monitor
 * @returns {Object} Action recommendation
 */
export function handleNotification(notification) {
  // Extract relevant info from notification
  const summary = notification.summary || notification.title || '';
  const notes = notification.notes || notification.body || '';

  // Check for agent tags
  const hasAgentTag = /\[AGENT\]|\[BROKKR\]/i.test(summary + notes);

  // Determine action
  if (hasAgentTag) {
    return {
      success: true,
      data: {
        action: 'queue',
        priority: 'NORMAL',
        reason: 'Agent tag detected in event'
      },
      error: null
    };
  }

  // Default: log but don't queue
  return {
    success: true,
    data: {
      action: 'log',
      reason: 'No agent tag, notification logged'
    },
    error: null
  };
}

// Default export with all functions
export default {
  listCalendars,
  listToday,
  listWeek,
  listEvents,
  createEvent,
  findEvent,
  modifyEvent,
  deleteEvent,
  checkConflicts,
  addAlarm,
  handleNotification
};
