// skills/email/executor.js
// Email skill executor for command routing
import { EmailHandler } from './lib/email.js';

const handler = new EmailHandler();

/**
 * Execute email skill
 * @param {string} action - Subcommand: read, compose, reply, delete, search, flag, folders, triage
 * @param {string[]} args - Additional arguments
 * @returns {Promise<string>} Formatted response
 */
export async function execute(action, args = []) {
  // Default action is inbox summary
  if (!action || action === 'inbox' || action === 'check') {
    return await handleInboxSummary();
  }

  switch (action.toLowerCase()) {
    case 'read':
      return await handleRead(args);
    case 'compose':
    case 'send':
      return await handleCompose(args);
    case 'reply':
      return await handleReply(args);
    case 'delete':
    case 'trash':
      return await handleDelete(args);
    case 'search':
    case 'find':
      return await handleSearch(args);
    case 'flag':
      return await handleFlag(args);
    case 'folders':
    case 'mailboxes':
      return await handleFolders();
    case 'triage':
      return await handleTriage();
    default:
      return `Unknown email action: ${action}\n\nAvailable actions:\n- /email (check inbox)\n- /email read <id>\n- /email compose <to> <subject>\n- /email reply <id>\n- /email delete <id>\n- /email search <query>\n- /email flag <id>\n- /email folders\n- /email triage`;
  }
}

/**
 * Handle inbox summary (default action)
 * @returns {Promise<string>} Formatted inbox summary
 */
async function handleInboxSummary() {
  const summary = await handler.getInboxSummary();

  let output = `Inbox: ${summary.unread} unread\n\nRecent:\n`;

  for (let i = 0; i < summary.recent.length; i++) {
    const msg = summary.recent[i];
    const flags = [];
    if (!msg.read) flags.push('UNREAD');
    if (msg.flagged) flags.push('FLAGGED');
    const flagStr = flags.length > 0 ? `[${flags.join(', ')}] ` : '';

    const date = formatRelativeDate(msg.date);
    output += `${i + 1}. ${flagStr}${msg.sender.split('<')[0].trim()} - ${msg.subject} (${date})\n`;
  }

  output += `\nUse /email read <number> to read a message`;
  return output;
}

/**
 * Handle read message action
 * @param {string[]} args - [messageId]
 * @returns {Promise<string>} Formatted message content
 */
async function handleRead(args) {
  if (args.length === 0) {
    return 'Usage: /email read <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    // Try to get message by index from recent list
    const summary = await handler.getInboxSummary();
    const index = parseInt(args[0], 10) - 1;
    if (index >= 0 && index < summary.recent.length) {
      const msg = await handler.readMessage(summary.recent[index].id);
      return formatMessage(msg);
    }
    return 'Invalid message ID. Use a number from /email list.';
  }

  const msg = await handler.readMessage(msgId);
  return formatMessage(msg);
}

/**
 * Handle compose email action
 * @param {string[]} args - [to, subject, body...]
 * @returns {Promise<string>} Status message
 */
async function handleCompose(args) {
  if (args.length < 2) {
    return 'Usage: /email compose <to> <subject> [body]';
  }

  const to = args[0];
  const subject = args[1];
  const body = args.slice(2).join(' ') || '';

  const result = await handler.compose(to, subject, body, false);

  if (result.status === 'draft') {
    return `Draft created:\nTo: ${to}\nSubject: ${subject}\n\nDraft opened in Mail.app. Add body and send from there.`;
  }

  return `Email sent to ${to}`;
}

/**
 * Handle reply action
 * @param {string[]} args - [messageId, body...]
 * @returns {Promise<string>} Status message
 */
async function handleReply(args) {
  if (args.length < 1) {
    return 'Usage: /email reply <message_id> [body]';
  }

  const msgId = parseInt(args[0], 10);
  const body = args.slice(1).join(' ') || '';

  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.reply(msgId, body, false, false);
  return `Reply draft created for: ${result.reply_to}\nSubject: ${result.subject}\n\nDraft opened in Mail.app.`;
}

/**
 * Handle delete action
 * @param {string[]} args - [messageId]
 * @returns {Promise<string>} Status message
 */
async function handleDelete(args) {
  if (args.length === 0) {
    return 'Usage: /email delete <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.delete(msgId);
  return `Deleted: ${result.subject}\n(Moved to Trash)`;
}

/**
 * Handle search action
 * @param {string[]} args - [query, field?]
 * @returns {Promise<string>} Search results
 */
async function handleSearch(args) {
  if (args.length === 0) {
    return 'Usage: /email search <query> [field:subject|sender|content]';
  }

  const query = args[0];
  const field = args[1] || 'all';

  const results = await handler.search(query, field, 10);

  if (results.length === 0) {
    return `No messages found matching "${query}"`;
  }

  let output = `Found ${results.length} messages:\n\n`;
  for (let i = 0; i < results.length; i++) {
    const msg = results[i];
    const date = formatRelativeDate(msg.date);
    output += `${i + 1}. ${msg.sender.split('<')[0].trim()} - ${msg.subject} (${date})\n`;
    output += `   ID: ${msg.id}\n`;
  }

  return output;
}

/**
 * Handle flag action
 * @param {string[]} args - [messageId]
 * @returns {Promise<string>} Status message
 */
async function handleFlag(args) {
  if (args.length === 0) {
    return 'Usage: /email flag <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.flag(msgId);
  return `Message ${msgId} is now ${result.flagged ? 'flagged' : 'unflagged'}`;
}

/**
 * Handle folders listing action
 * @returns {Promise<string>} Formatted folder list
 */
async function handleFolders() {
  const folders = await handler.listFolders();

  let output = 'Mailboxes:\n\n';
  let currentAccount = '';

  for (const folder of folders) {
    if (folder.account !== currentAccount) {
      currentAccount = folder.account;
      output += `[${currentAccount}]\n`;
    }
    output += `  ${folder.name} (${folder.unread} unread, ${folder.total} total)\n`;
  }

  return output;
}

/**
 * Handle triage action
 * @returns {Promise<string>} Triage results
 */
async function handleTriage() {
  const result = await handler.triageInbox();

  if (result.urgent_count === 0) {
    return `Scanned ${result.total_scanned} messages. No urgent items found.`;
  }

  let output = `Scanned ${result.total_scanned} messages.\n\n`;
  output += `${result.urgent_count} URGENT message(s):\n\n`;

  for (const msg of result.urgent_messages) {
    const reason = msg.reason === 'urgent_sender' ? 'Urgent sender' : 'Urgent keyword';
    output += `- ${msg.sender.split('<')[0].trim()}: ${msg.subject}\n`;
    output += `  (${reason}, ID: ${msg.id})\n`;
  }

  return output;
}

/**
 * Format a full message for display
 * @param {Object} msg - Message object from readMessage
 * @returns {string} Formatted message
 */
function formatMessage(msg) {
  let output = `From: ${msg.sender}\n`;
  output += `To: ${msg.to}\n`;
  if (msg.cc) output += `CC: ${msg.cc}\n`;
  output += `Date: ${msg.date_received}\n`;
  output += `Subject: ${msg.subject}\n`;
  if (msg.attachments) output += `Attachments: ${msg.attachments}\n`;
  output += `\n---\n\n`;
  output += msg.content;

  return output;
}

/**
 * Format a date as a human-readable relative string
 * @param {string} dateStr - ISO date string
 * @returns {string} Relative date like "5 min ago"
 */
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}
