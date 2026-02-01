// lib/imessage-context.js
/**
 * iMessage Context Retrieval Module
 *
 * Retrieves conversation history from chat.db and formats it for Claude.
 * Used to provide Claude with conversation context when responding to messages.
 */

import { getRecentMessages } from './imessage-reader.js';

/**
 * Get conversation context from chat.db
 *
 * Retrieves recent messages from a phone number and returns them in
 * chronological order (oldest first) for natural conversation flow.
 *
 * @param {string} phoneNumber - Phone number to get messages for
 * @param {number} limit - Maximum number of messages to retrieve (default: 20)
 * @returns {Array<{id: number, text: string, timestamp: number, sender: string}>}
 */
export function getConversationContext(phoneNumber, limit = 20) {
  // getRecentMessages returns newest first, so reverse for chronological order
  const messages = getRecentMessages(phoneNumber, limit);
  return messages.reverse();
}

/**
 * Format timestamp for display
 *
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted time string (e.g., "2:30 PM")
 */
function formatTime(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format messages as conversation transcript for Claude
 *
 * Creates a readable transcript with timestamps and speaker names.
 * Format: [time] Speaker: message
 *
 * @param {Array<{text: string, sender: string, timestamp: number}>} messages - Messages to format
 * @param {string} phoneNumber - The contact's phone number
 * @param {string|null} displayName - Optional display name for the contact
 * @returns {string} Formatted conversation transcript
 */
export function formatContextForClaude(messages, phoneNumber, displayName = null) {
  if (!messages || messages.length === 0) {
    return '';
  }

  const contactName = displayName || 'Contact';

  return messages
    .map((msg) => {
      const time = formatTime(msg.timestamp);
      const speaker = msg.sender === 'me' ? 'Brokkr' : contactName;
      return `[${time}] ${speaker}: ${msg.text}`;
    })
    .join('\n');
}

/**
 * Build full system context for Claude
 *
 * Creates a comprehensive system prompt context including:
 * - Brokkr identity introduction
 * - Contact information (phone, trust level, name, response style)
 * - Recent conversation history
 *
 * @param {Object} contact - Contact information
 * @param {string} contact.phone - Contact's phone number
 * @param {string} contact.trustLevel - Trust level (owner, trusted, known, unknown)
 * @param {string} [contact.displayName] - Optional display name
 * @param {string} [contact.responseStyle] - Optional preferred response style
 * @param {Array} messages - Recent messages for context
 * @returns {string} Full system context string
 */
export function buildSystemContext(contact, messages) {
  const sections = [];

  // Brokkr identity intro
  sections.push(`You are Brokkr, an AI assistant helping via iMessage.`);

  // Contact information
  sections.push(`\n## Contact Information`);
  sections.push(`- Phone: ${contact.phone}`);
  sections.push(`- Trust Level: ${contact.trustLevel}`);

  if (contact.displayName) {
    sections.push(`- Name: ${contact.displayName}`);
  }

  if (contact.responseStyle) {
    sections.push(`- Response Style: ${contact.responseStyle}`);
  }

  // Recent conversation
  if (messages && messages.length > 0) {
    const formattedConversation = formatContextForClaude(
      messages,
      contact.phone,
      contact.displayName
    );
    sections.push(`\n## Recent Conversation`);
    sections.push(formattedConversation);
  }

  return sections.join('\n');
}
