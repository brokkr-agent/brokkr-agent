#!/usr/bin/env node
/**
 * Get recent messages from a group chat
 *
 * Usage: node imessage-group.js <chat-guid> [limit]
 * Example: node imessage-group.js "iMessage;+;chat648586973550574017" 20
 *
 * Output: JSON array of messages with sender info
 */

import { getGroupMessages, getGroupMembers, getChatInfo } from '../../../../lib/imessage-reader.js';

const chatGuid = process.argv[2];
const limit = parseInt(process.argv[3]) || 20;

if (!chatGuid) {
  console.error('Usage: node imessage-group.js <chat-guid> [limit]');
  console.error('Example: node imessage-group.js "iMessage;+;chat648586973550574017" 20');
  process.exit(1);
}

try {
  const messages = getGroupMessages(chatGuid, limit);
  const members = getGroupMembers(chatGuid);

  const result = {
    chatGuid,
    memberCount: members.length,
    members,
    messageCount: messages.length,
    messages: messages.map(m => ({
      id: m.id,
      text: m.text,
      sender: m.sender,
      timestamp: new Date(m.timestamp * 1000).toISOString()
    })).reverse() // Oldest first for reading
  };

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
