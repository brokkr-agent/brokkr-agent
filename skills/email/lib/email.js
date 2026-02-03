// skills/email/lib/email.js
// EmailHandler module for Apple Mail integration via AppleScript
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
let config = {
  account: 'iCloud',
  email: 'brokkrassist@icloud.com',
  batch_size: 50,
  auto_triage: false,
  urgent_senders: [],
  urgent_keywords: ['urgent', 'asap', 'emergency', 'critical', 'time-sensitive', 'action required'],
  timeout_seconds: 600,
  icloud_attachments_path: 'Attachments'
};

try {
  const configPath = join(__dirname, '..', 'config.json');
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.log('[Email] Using default config');
}

/**
 * Runs an AppleScript and returns parsed JSON output
 * @param {string} scriptName - Name of the .scpt file in scripts/
 * @param {Array} args - Arguments to pass to the script
 * @returns {any} Parsed JSON result
 * @throws {Error} If script execution fails or returns error
 */
function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, '..', 'scripts', scriptName);
  const escapedArgs = args.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  const cmd = `osascript "${scriptPath}" ${escapedArgs}`;

  const output = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024 // 10MB for large message content
  });

  const result = JSON.parse(output.trim());

  if (result && result.error) {
    throw new Error(result.error);
  }

  return result;
}

/**
 * EmailHandler class for managing Apple Mail operations
 */
export class EmailHandler {
  constructor(customConfig = null) {
    this.config = customConfig || config;
  }

  /**
   * List recent inbox messages
   * @param {number} count - Max messages to return (default: 20)
   * @returns {Promise<Array>} Array of message objects with id, subject, sender, date, read, flagged
   */
  async listInbox(count = 20) {
    const maxCount = Math.min(count, this.config.batch_size);
    return runScript('list-inbox.scpt', [maxCount]);
  }

  /**
   * Read full message content
   * @param {number} messageId - Message ID
   * @returns {Promise<Object>} Message object with id, subject, sender, to, cc, date_sent, date_received, mailbox, read, flagged, attachments, content
   */
  async readMessage(messageId) {
    return runScript('read-message.scpt', [messageId]);
  }

  /**
   * Compose new email
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} body - Email body (plain text)
   * @param {boolean} sendNow - Send immediately (true) or create draft (false)
   * @returns {Promise<Object>} Status object with status ('draft' or 'sent'), to, subject
   */
  async compose(to, subject, body, sendNow = false) {
    return runScript('compose.scpt', [to, subject, body, sendNow ? 'true' : 'false']);
  }

  /**
   * Reply to a message
   * @param {number} messageId - Message ID to reply to
   * @param {string} body - Reply body text
   * @param {boolean} replyAll - Reply to all recipients (default: false)
   * @param {boolean} sendNow - Send immediately (default: false)
   * @returns {Promise<Object>} Status object with status, reply_to, subject, reply_all
   */
  async reply(messageId, body, replyAll = false, sendNow = false) {
    return runScript('reply.scpt', [messageId, body, replyAll ? 'true' : 'false', sendNow ? 'true' : 'false']);
  }

  /**
   * Delete a message (move to trash)
   * @param {number} messageId - Message ID
   * @returns {Promise<Object>} Status object with status, id, subject, from_mailbox
   */
  async delete(messageId) {
    return runScript('delete.scpt', [messageId]);
  }

  /**
   * Search messages
   * @param {string} query - Search query
   * @param {string} field - Field to search: 'subject', 'sender', 'content', or 'all' (default: 'all')
   * @param {number} maxResults - Maximum results to return (default: 20)
   * @returns {Promise<Array>} Array of matching message objects
   */
  async search(query, field = 'all', maxResults = 20) {
    return runScript('search.scpt', [query, field, 'all', maxResults]);
  }

  /**
   * Toggle or set message flag
   * @param {number} messageId - Message ID
   * @param {boolean|null} flagged - Set to true/false, or null to toggle (default: null)
   * @returns {Promise<Object>} Status object with id, flagged, previous
   */
  async flag(messageId, flagged = null) {
    const setTo = flagged === null ? 'toggle' : (flagged ? 'true' : 'false');
    return runScript('flag.scpt', [messageId, setTo]);
  }

  /**
   * Mark message as read or unread
   * @param {number} messageId - Message ID
   * @param {boolean} read - Set read status (default: true)
   * @returns {Promise<Object>} Status object with id, read, previous
   */
  async markRead(messageId, read = true) {
    return runScript('mark-read.scpt', [messageId, read ? 'true' : 'false']);
  }

  /**
   * List all mailboxes/folders
   * @returns {Promise<Array>} Array of mailbox objects with account, name, unread, total
   */
  async listFolders() {
    return runScript('list-folders.scpt');
  }

  /**
   * Move message to a folder
   * @param {number} messageId - Message ID
   * @param {string} folderName - Target folder name
   * @returns {Promise<Object>} Status object with status, id, from, to
   */
  async moveToFolder(messageId, folderName) {
    return runScript('move-to-folder.scpt', [messageId, folderName, this.config.account]);
  }

  /**
   * Get inbox summary
   * @returns {Promise<Object>} Summary with unread count, total, and recent messages
   */
  async getInboxSummary() {
    const messages = await this.listInbox(10);
    const unreadCount = messages.filter(m => !m.read).length;

    return {
      unread: unreadCount,
      total: messages.length,
      recent: messages.slice(0, 5).map(m => ({
        id: m.id,
        subject: m.subject,
        sender: m.sender,
        date: m.date,
        read: m.read,
        flagged: m.flagged
      }))
    };
  }

  /**
   * Triage inbox - identify and flag urgent messages
   * @returns {Promise<Object>} Triage results with total_scanned, urgent_count, urgent_messages
   */
  async triageInbox() {
    const messages = await this.listInbox(50);
    const urgent = [];

    for (const msg of messages) {
      // Check for urgent senders
      const isUrgentSender = this.config.urgent_senders.some(s =>
        msg.sender.toLowerCase().includes(s.toLowerCase())
      );

      // Check for urgent keywords in subject
      const hasUrgentKeyword = this.config.urgent_keywords.some(k =>
        msg.subject.toLowerCase().includes(k.toLowerCase())
      );

      if (isUrgentSender || hasUrgentKeyword) {
        urgent.push({
          ...msg,
          reason: isUrgentSender ? 'urgent_sender' : 'urgent_keyword'
        });

        // Auto-flag urgent messages (if not already flagged)
        if (!msg.flagged) {
          await this.flag(msg.id, true);
        }
      }
    }

    return {
      total_scanned: messages.length,
      urgent_count: urgent.length,
      urgent_messages: urgent
    };
  }
}

// Export singleton instance
export const emailHandler = new EmailHandler();
