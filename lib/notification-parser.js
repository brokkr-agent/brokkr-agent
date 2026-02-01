/**
 * Notification Parser
 *
 * Parses binary plist data from the macOS Notification Center database.
 * Uses plutil CLI for reliable binary plist parsing.
 *
 * @module notification-parser
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Parse binary plist data from notification database
 * @param {Buffer} data - Binary plist data
 * @returns {Object|null} Parsed plist object or null on error
 */
export function parseNotificationData(data) {
  if (!data || data.length === 0) {
    return null;
  }

  const tempFile = join(tmpdir(), `notification-${Date.now()}-${Math.random().toString(36).slice(2)}.plist`);

  try {
    writeFileSync(tempFile, data);

    // Convert to JSON using plutil (built into macOS)
    const json = execSync(`plutil -convert json -o - "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 5000
    });

    return JSON.parse(json);
  } catch (err) {
    // Fallback: try to extract text content directly
    try {
      const text = data.toString('utf-8');
      return { rawText: text };
    } catch {
      return null;
    }
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract notification content from parsed plist
 * @param {Object} plist - Parsed plist object
 * @returns {{title: string, body: string, subtitle: string, sender?: string, threadId?: string, category?: string}}
 */
export function extractNotificationContent(plist) {
  if (!plist) {
    return { title: '', body: '', subtitle: '' };
  }

  return {
    title: plist.titl || plist.title || plist.req?.titl || '',
    body: plist.body || plist.req?.body || '',
    subtitle: plist.subt || plist.subtitle || plist.req?.subt || '',
    sender: plist.srce || plist.sender || undefined,
    threadId: plist.thrd || plist.threadId || undefined,
    category: plist.catg || plist.category || undefined
  };
}

/**
 * Format notification for human-readable display
 * @param {Object} notification - Parsed notification object
 * @returns {string} Formatted display string
 */
export function formatNotificationForDisplay(notification) {
  const { app, content, delivered } = notification;
  const time = delivered ? new Date(delivered * 1000).toLocaleTimeString() : 'unknown';

  let display = `[${app}] ${time}`;

  if (content.title) {
    display += `\n  ${content.title}`;
  }
  if (content.subtitle) {
    display += ` - ${content.subtitle}`;
  }
  if (content.body) {
    display += `\n  ${content.body}`;
  }

  return display;
}

/**
 * Parse a raw notification record from the database
 * @param {{rec_id: number, app: string, bundleId: string, data: Buffer, delivered: number, presented: boolean}} record
 * @returns {{id: number, app: string, bundleId: string, content: Object, delivered: number, presented: boolean, raw: Object|null}}
 */
export function parseNotificationRecord(record) {
  const plist = parseNotificationData(record.data);
  const content = extractNotificationContent(plist);

  return {
    id: record.rec_id,
    app: record.app,
    bundleId: record.bundleId,
    content,
    delivered: record.delivered,
    presented: record.presented,
    raw: plist
  };
}

export default {
  parseNotificationData,
  extractNotificationContent,
  formatNotificationForDisplay,
  parseNotificationRecord
};
