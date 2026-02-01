// lib/imessage-reader.js
/**
 * iMessage Reader Module
 *
 * Reads messages from macOS Messages.app SQLite database (chat.db).
 *
 * CRITICAL: AppleScript CANNOT read messages from Messages.app - it has no
 * "message" class. This module uses SQLite to query ~/Library/Messages/chat.db
 * directly.
 *
 * Database Schema (chat.db):
 * - message: ROWID, text, date, handle_id, is_from_me
 * - handle: ROWID, id (phone number or email)
 * - chat_message_join: chat_id, message_id
 *
 * Note: Mac messages use "Mac Absolute Time" (seconds since 2001-01-01).
 * Convert with: unixTime = macTime + 978307200
 */

import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Mac Absolute Time epoch: 2001-01-01 00:00:00 UTC
// Difference from Unix epoch (1970-01-01): 978307200 seconds
const MAC_EPOCH_OFFSET = 978307200;

// Threshold to detect nanosecond timestamps (iOS 10+)
// If timestamp > 1e15, it's in nanoseconds
const NANOSECOND_THRESHOLD = 1e15;

/**
 * Convert Mac Absolute Time to Unix timestamp
 *
 * Mac Absolute Time: seconds since 2001-01-01 00:00:00 UTC
 * Unix time: seconds since 1970-01-01 00:00:00 UTC
 *
 * iOS 10+ stores timestamps in nanoseconds instead of seconds.
 * This function auto-detects and handles both formats.
 *
 * @param {number} macTime - Mac Absolute Time (seconds or nanoseconds)
 * @returns {number} Unix timestamp in seconds
 */
export function macTimeToUnix(macTime) {
  // Detect nanosecond timestamps (iOS 10+)
  // If the value is very large (> 1e15), it's in nanoseconds
  let seconds = macTime;
  if (Math.abs(macTime) > NANOSECOND_THRESHOLD) {
    seconds = Math.floor(macTime / 1e9);
  }

  return seconds + MAC_EPOCH_OFFSET;
}

/**
 * Get the path to the Messages database
 *
 * @returns {string} Absolute path to ~/Library/Messages/chat.db
 */
export function getDbPath() {
  return path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
}

/**
 * Escape special LIKE pattern characters
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for LIKE pattern
 */
function escapeLikePattern(str) {
  return str.replace(/[\\%_]/g, '\\$&');
}

/**
 * Query recent messages from a specific phone number
 *
 * @param {string} phoneNumber - Phone number to filter (e.g., '+12069090025' or '12069090025')
 * @param {number} limit - Maximum number of messages to return (1-1000)
 * @returns {Array<{id: number, text: string, timestamp: number, sender: string}>}
 */
export function getRecentMessages(phoneNumber, limit = 10) {
  // Validate limit parameter
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return [];
  }

  const dbPath = getDbPath();

  // Check if database exists and is accessible
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  let db;
  try {
    // Open database in read-only mode
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Normalize and escape phone number for LIKE query
    const normalizedNumber = phoneNumber.replace(/^\+/, '');
    const escapedNumber = escapeLikePattern(normalizedNumber);

    // Query messages joined with handles to get sender info
    // ESCAPE clause handles special LIKE characters (%, _, \)
    const query = `
      SELECT
        m.ROWID as id,
        m.text,
        m.date,
        m.is_from_me,
        h.id as sender
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE h.id LIKE ? ESCAPE '\\'
      ORDER BY m.date DESC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(`%${escapedNumber}%`, limit);

    // Transform to output format, handling null values
    return rows.map((row) => ({
      id: row.id,
      text: row.text ?? '',
      timestamp: macTimeToUnix(row.date),
      sender: row.is_from_me ? 'me' : (row.sender ?? 'unknown'),
    }));
  } catch (error) {
    // Handle database access errors gracefully with context
    // Common errors: SQLITE_BUSY (database locked), SQLITE_CANTOPEN (permissions)
    console.error('iMessage reader error:', {
      message: error.message,
      code: error.code,
      path: dbPath,
    });
    return [];
  } finally {
    if (db) {
      db.close();
    }
  }
}
