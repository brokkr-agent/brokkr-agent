/**
 * Notification Database Reader
 *
 * Reads notifications from the macOS Notification Center SQLite database.
 * This is a placeholder - full implementation in docs/plans/2026-02-01-apple-notification-integration-plan.md
 *
 * @module notifications
 */

import { execSync } from 'child_process';
// import Database from 'better-sqlite3';

// Mac Absolute Time epoch offset (seconds between 1970-01-01 and 2001-01-01)
const MAC_EPOCH_OFFSET = 978307200;

// App bundle ID to friendly name mapping
const APP_IDENTIFIERS = {
  'com.apple.MobileSMS': 'imessage',
  'com.apple.mobilesms': 'imessage',
  'com.apple.mail': 'mail',
  'com.apple.Mail': 'mail',
  'com.apple.iCal': 'calendar',
  'com.apple.ical': 'calendar',
  'com.apple.CalendarNotification': 'calendar',
  'com.apple.FaceTime': 'facetime',
  'com.apple.facetime': 'facetime',
  'com.apple.reminders': 'reminders',
  'com.apple.Reminders': 'reminders'
};

/**
 * Get the path to the notification database
 * @returns {string} Database file path
 */
export function getDbPath() {
  try {
    const darwinDir = execSync('getconf DARWIN_USER_DIR', { encoding: 'utf-8' }).trim();
    return `${darwinDir}/com.apple.notificationcenter/db2/db`;
  } catch (err) {
    console.error('[NotificationDB] Failed to get DARWIN_USER_DIR:', err.message);
    throw new Error('Cannot determine notification database path');
  }
}

/**
 * Convert Mac Absolute Time to Unix timestamp
 * @param {number} macTime - Seconds since 2001-01-01
 * @returns {number} Unix timestamp (seconds since 1970-01-01)
 */
export function macTimeToUnix(macTime) {
  return macTime + MAC_EPOCH_OFFSET;
}

/**
 * Convert Unix timestamp to Mac Absolute Time
 * @param {number} unixTime - Unix timestamp
 * @returns {number} Mac Absolute Time
 */
export function unixToMacTime(unixTime) {
  return unixTime - MAC_EPOCH_OFFSET;
}

/**
 * Get friendly app identifier from bundle ID
 * @param {string} bundleId - App bundle identifier
 * @returns {string} Friendly identifier or original bundle ID
 */
export function getAppIdentifier(bundleId) {
  return APP_IDENTIFIERS[bundleId] || bundleId;
}

/**
 * Get recent notifications from the database
 * PLACEHOLDER - requires better-sqlite3 dependency
 *
 * @param {number} sinceUnixTime - Unix timestamp to fetch notifications after
 * @param {number} limit - Maximum notifications to return
 * @returns {Array<{rec_id: number, app: string, bundleId: string, data: Buffer, delivered: number}>}
 */
export function getRecentNotifications(sinceUnixTime = 0, limit = 50) {
  // TODO: Implement with better-sqlite3
  // See docs/plans/2026-02-01-apple-notification-integration-plan.md Task 1
  console.log('[NotificationDB] getRecentNotifications - PLACEHOLDER');
  return [];
}

/**
 * Get notifications for a specific app
 * @param {string} appIdentifier - App identifier (e.g., 'imessage', 'mail')
 * @param {number} sinceUnixTime - Unix timestamp to fetch after
 * @param {number} limit - Maximum notifications
 * @returns {Array} Notifications for the app
 */
export function getNotificationsForApp(appIdentifier, sinceUnixTime = 0, limit = 20) {
  const notifications = getRecentNotifications(sinceUnixTime, limit * 2);
  return notifications.filter(n => n.app === appIdentifier).slice(0, limit);
}

/**
 * Check if database is accessible
 * @returns {{accessible: boolean, path: string, error?: string}}
 */
export function checkDatabaseAccess() {
  try {
    const dbPath = getDbPath();
    // TODO: Implement actual database check with better-sqlite3
    return {
      accessible: false,
      path: dbPath,
      error: 'better-sqlite3 not installed - run: npm install better-sqlite3'
    };
  } catch (err) {
    return {
      accessible: false,
      path: 'unknown',
      error: err.message
    };
  }
}

export default {
  getDbPath,
  macTimeToUnix,
  unixToMacTime,
  getAppIdentifier,
  getRecentNotifications,
  getNotificationsForApp,
  checkDatabaseAccess
};
