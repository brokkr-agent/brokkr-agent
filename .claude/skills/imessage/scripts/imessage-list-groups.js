#!/usr/bin/env node
/**
 * List all recent group chats with their GUIDs
 *
 * Usage: node imessage-list-groups.js [limit]
 * Example: node imessage-list-groups.js 10
 *
 * Output: JSON array of group chat info
 */

import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

const limit = parseInt(process.argv[2]) || 10;

const MAC_EPOCH_OFFSET = 978307200;
const NANOSECOND_THRESHOLD = 1e15;

function macTimeToUnix(macTime) {
  let seconds = macTime;
  if (Math.abs(macTime) > NANOSECOND_THRESHOLD) {
    seconds = Math.floor(macTime / 1e9);
  }
  return seconds + MAC_EPOCH_OFFSET;
}

try {
  const dbPath = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');

  if (!fs.existsSync(dbPath)) {
    console.error('chat.db not found');
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  // Get recent group chats (those with ;+; in GUID indicating group)
  const query = `
    SELECT
      c.ROWID as id,
      c.guid,
      c.display_name,
      c.group_id,
      MAX(m.date) as last_message_date,
      COUNT(DISTINCT cmj.message_id) as message_count
    FROM chat c
    LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
    LEFT JOIN message m ON cmj.message_id = m.ROWID
    WHERE c.guid LIKE '%;+;%'
    GROUP BY c.ROWID
    ORDER BY last_message_date DESC
    LIMIT ?
  `;

  const groups = db.prepare(query).all(limit);

  // Get member counts for each group
  const memberQuery = `
    SELECT COUNT(*) as count
    FROM chat_handle_join
    WHERE chat_id = ?
  `;
  const memberStmt = db.prepare(memberQuery);

  const result = groups.map(g => {
    const memberResult = memberStmt.get(g.id);
    return {
      guid: g.guid,
      displayName: g.display_name || '(unnamed group)',
      memberCount: (memberResult?.count || 0) + 1, // +1 for self
      messageCount: g.message_count,
      lastActivity: g.last_message_date ? new Date(macTimeToUnix(g.last_message_date) * 1000).toISOString() : null
    };
  });

  db.close();

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
