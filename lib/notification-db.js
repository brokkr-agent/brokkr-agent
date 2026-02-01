// lib/notification-db.js
// Database reader module for macOS Notification Center database

import { execSync } from 'child_process';
import Database from 'better-sqlite3';

// Mac Absolute Time epoch offset (January 1, 2001 00:00:00 UTC)
const MAC_EPOCH_OFFSET = 978307200;

// Bundle ID to friendly name mappings
const APP_IDENTIFIERS = {
  'com.apple.MobileSMS': 'imessage',
  'com.apple.mail': 'mail',
  'com.apple.iCal': 'calendar',
  'com.apple.FaceTime': 'facetime',
  'com.apple.reminders': 'reminders'
};

// Reverse mapping for lookups
const FRIENDLY_TO_BUNDLE = Object.fromEntries(
  Object.entries(APP_IDENTIFIERS).map(([bundle, friendly]) => [friendly, bundle])
);

/**
 * Get the path to the macOS notification center database
 * Uses getconf DARWIN_USER_DIR to find the user-specific path
 * @returns {string} Full path to the notification database
 */
export function getDbPath() {
  const darwinUserDir = execSync('getconf DARWIN_USER_DIR', { encoding: 'utf-8' }).trim();
  return `${darwinUserDir}com.apple.notificationcenter/db2/db`;
}

/**
 * Convert Mac Absolute Time to Unix timestamp
 * Mac Absolute Time starts from January 1, 2001 00:00:00 UTC
 * @param {number} macTime - Mac Absolute Time value
 * @returns {number} Unix timestamp
 */
export function macTimeToUnix(macTime) {
  return macTime + MAC_EPOCH_OFFSET;
}

/**
 * Convert Unix timestamp to Mac Absolute Time
 * @param {number} unixTime - Unix timestamp
 * @returns {number} Mac Absolute Time value
 */
export function unixToMacTime(unixTime) {
  return unixTime - MAC_EPOCH_OFFSET;
}

/**
 * Map bundle ID to friendly app identifier
 * Case-insensitive lookup since database may return different cases
 * @param {string} bundleId - The bundle ID (e.g., com.apple.MobileSMS or com.apple.mobilesms)
 * @returns {string} Friendly name (e.g., imessage) or original bundle ID if unknown
 */
export function getAppIdentifier(bundleId) {
  if (!bundleId) return bundleId;
  // Direct lookup first
  if (APP_IDENTIFIERS[bundleId]) {
    return APP_IDENTIFIERS[bundleId];
  }
  // Case-insensitive lookup
  const lowerBundleId = bundleId.toLowerCase();
  for (const [key, value] of Object.entries(APP_IDENTIFIERS)) {
    if (key.toLowerCase() === lowerBundleId) {
      return value;
    }
  }
  return bundleId;
}

/**
 * Get bundle ID from friendly name
 * @param {string} friendlyName - Friendly name (e.g., imessage)
 * @returns {string} Bundle ID or original name if not a friendly name
 */
export function getBundleId(friendlyName) {
  return FRIENDLY_TO_BUNDLE[friendlyName] || friendlyName;
}

/**
 * Check if the notification database is accessible
 * @returns {Promise<{accessible: boolean, path: string, error?: string}>}
 */
export async function checkDatabaseAccess() {
  const dbPath = getDbPath();

  try {
    const db = new Database(dbPath, { readonly: true });
    // Try a simple query to verify access
    db.prepare('SELECT 1').get();
    db.close();
    return { accessible: true, path: dbPath };
  } catch (error) {
    return {
      accessible: false,
      path: dbPath,
      error: error.message
    };
  }
}

/**
 * Get recent notifications from the database
 * @param {number|null} sinceUnixTime - Only return notifications after this Unix timestamp
 * @param {number} limit - Maximum number of notifications to return (default 100)
 * @returns {Promise<Array<{rec_id: number, bundle_id: string, app_id: string, data: Buffer, delivered_date: number, presented: number}>>}
 */
export async function getRecentNotifications(sinceUnixTime = null, limit = 100) {
  const dbPath = getDbPath();

  try {
    const db = new Database(dbPath, { readonly: true });

    let query = `
      SELECT
        r.rec_id,
        a.identifier as bundle_id,
        r.data,
        r.delivered_date,
        r.presented
      FROM record r
      JOIN app a ON r.app_id = a.app_id
    `;

    const params = [];

    if (sinceUnixTime !== null) {
      const macTime = unixToMacTime(sinceUnixTime);
      query += ' WHERE r.delivered_date > ?';
      params.push(macTime);
    }

    query += ' ORDER BY r.delivered_date DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    db.close();

    return rows.map(row => ({
      rec_id: row.rec_id,
      bundle_id: row.bundle_id,
      app_id: getAppIdentifier(row.bundle_id),
      data: row.data,
      delivered_date: macTimeToUnix(row.delivered_date),
      presented: row.presented
    }));
  } catch (error) {
    // Return empty array if database is not accessible
    // This allows graceful degradation when running without permissions
    console.error('Error reading notification database:', error.message);
    return [];
  }
}

/**
 * Get notifications for a specific app
 * @param {string} appIdentifier - App identifier (friendly name like 'imessage' or bundle ID)
 * @param {number|null} sinceUnixTime - Only return notifications after this Unix timestamp
 * @param {number} limit - Maximum number of notifications to return (default 100)
 * @returns {Promise<Array<{rec_id: number, bundle_id: string, app_id: string, data: Buffer, delivered_date: number, presented: number}>>}
 */
export async function getNotificationsForApp(appIdentifier, sinceUnixTime = null, limit = 100) {
  const dbPath = getDbPath();
  const bundleId = getBundleId(appIdentifier);

  try {
    const db = new Database(dbPath, { readonly: true });

    let query = `
      SELECT
        r.rec_id,
        a.identifier as bundle_id,
        r.data,
        r.delivered_date,
        r.presented
      FROM record r
      JOIN app a ON r.app_id = a.app_id
      WHERE a.identifier = ?
    `;

    const params = [bundleId];

    if (sinceUnixTime !== null) {
      const macTime = unixToMacTime(sinceUnixTime);
      query += ' AND r.delivered_date > ?';
      params.push(macTime);
    }

    query += ' ORDER BY r.delivered_date DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    const rows = stmt.all(...params);
    db.close();

    return rows.map(row => ({
      rec_id: row.rec_id,
      bundle_id: row.bundle_id,
      app_id: getAppIdentifier(row.bundle_id),
      data: row.data,
      delivered_date: macTimeToUnix(row.delivered_date),
      presented: row.presented
    }));
  } catch (error) {
    // Return empty array if database is not accessible
    console.error('Error reading notification database:', error.message);
    return [];
  }
}

export default {
  getDbPath,
  macTimeToUnix,
  unixToMacTime,
  getAppIdentifier,
  getBundleId,
  checkDatabaseAccess,
  getRecentNotifications,
  getNotificationsForApp,
  MAC_EPOCH_OFFSET
};
