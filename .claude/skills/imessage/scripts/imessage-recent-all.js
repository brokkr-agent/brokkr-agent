#!/usr/bin/env node
/**
 * Get recent messages across ALL conversations
 *
 * Usage: node imessage-recent-all.js [limit]
 * Example: node imessage-recent-all.js 30
 *
 * Output: JSON array of recent messages from all chats
 */

import { getAllRecentMessages, getChatInfo } from '../../../../lib/imessage-reader.js';

const limit = parseInt(process.argv[2]) || 30;

try {
  const messages = getAllRecentMessages(limit);

  // Enrich with chat info
  const enriched = messages.map(m => {
    const chatInfo = getChatInfo(m.chat_id);
    return {
      id: m.id,
      text: m.text,
      sender: m.sender,
      timestamp: new Date(m.timestamp * 1000).toISOString(),
      chatId: m.chat_id,
      isGroup: chatInfo?.isGroup || false,
      chatGuid: chatInfo?.guid || null,
      chatName: chatInfo?.displayName || null
    };
  }).reverse(); // Oldest first

  console.log(JSON.stringify(enriched, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
