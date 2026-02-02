// lib/imessage-sender.js
/**
 * iMessage Sender Module
 *
 * Sends messages via AppleScript to Messages.app.
 * Includes character escaping, chunking for long messages, and retry logic.
 */

import { execSync } from 'child_process';

// Maximum message length before chunking (iMessage limit is ~20000, but 4000 is safer)
export const MAX_MESSAGE_LENGTH = 4000;

// Retry configuration
export const DEFAULT_RETRY_COUNT = 3;
export const DEFAULT_RETRY_DELAY_MS = 2000;

/**
 * Format a message for inclusion in an AppleScript string literal.
 * Escapes characters that have special meaning in AppleScript strings.
 *
 * AppleScript string escaping rules:
 * - Backslashes must be escaped as \\
 * - Double quotes must be escaped as \"
 * - Newlines are preserved as-is (AppleScript handles them)
 *
 * @param {string|null|undefined} message - The message to format
 * @returns {string} Escaped message safe for AppleScript
 */
export function formatMessageForAppleScript(message) {
  if (message === null || message === undefined || message === '') {
    return '';
  }

  // Order matters: escape backslashes first, then quotes
  return message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Build AppleScript to send a message via Messages.app
 *
 * @param {string} phoneNumber - The recipient's phone number
 * @param {string} message - The message to send (will be escaped)
 * @returns {string} AppleScript code to send the message
 */
export function buildSendScript(phoneNumber, message) {
  const escapedMessage = formatMessageForAppleScript(message);

  return `tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "${phoneNumber}" of targetService
    send "${escapedMessage}" to targetBuddy
end tell`;
}

/**
 * Build AppleScript to send a message to a group chat via Messages.app
 *
 * @param {string} chatGuid - The chat GUID (e.g., 'iMessage;+;chat123456789')
 * @param {string} message - The message to send (will be escaped)
 * @returns {string} AppleScript code to send the message
 */
export function buildGroupSendScript(chatGuid, message) {
  const escapedMessage = formatMessageForAppleScript(message);
  const escapedGuid = chatGuid.replace(/"/g, '\\"');

  return `tell application "Messages"
    set targetChat to chat id "${escapedGuid}"
    send "${escapedMessage}" to targetChat
end tell`;
}

/**
 * Split a long message into chunks that fit within the message limit.
 * Tries to split at word boundaries or newlines for cleaner breaks.
 *
 * @param {string|null|undefined} message - The message to chunk
 * @param {number} maxLength - Maximum length per chunk (default: MAX_MESSAGE_LENGTH)
 * @returns {string[]} Array of message chunks
 */
export function chunkMessage(message, maxLength = MAX_MESSAGE_LENGTH) {
  if (message === null || message === undefined || message === '') {
    return [];
  }

  // If message fits, return as single chunk
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find the best break point within maxLength
    let breakPoint = maxLength;

    // Try to find a newline to break at
    const newlineIndex = remaining.lastIndexOf('\n', maxLength);
    if (newlineIndex > maxLength * 0.5) {
      // Only use if it's past halfway
      breakPoint = newlineIndex + 1; // Include the newline in current chunk
    } else {
      // Try to find a space to break at
      const spaceIndex = remaining.lastIndexOf(' ', maxLength);
      if (spaceIndex > maxLength * 0.5) {
        breakPoint = spaceIndex + 1; // Include space, will be trimmed
      }
      // Otherwise, force break at maxLength (for very long words)
    }

    let chunk = remaining.slice(0, breakPoint);

    // Trim trailing whitespace from chunk
    chunk = chunk.trimEnd();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move past the break point, trimming leading whitespace from next chunk
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/**
 * Default AppleScript executor using osascript
 *
 * @param {string} script - AppleScript code to execute
 * @returns {string} Script output
 * @throws {Error} If osascript fails
 */
function defaultExecutor(script) {
  return execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
    encoding: 'utf-8',
    timeout: 30000,
  });
}

/**
 * Sleep for a specified duration
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message via iMessage with retry logic
 *
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @param {Function} options.executor - AppleScript executor function (for testing)
 * @param {number} options.retryCount - Number of retry attempts (default: 3)
 * @param {number} options.retryDelayMs - Delay between retries in ms (default: 2000)
 * @param {number} options.maxChunkLength - Max chunk size (default: MAX_MESSAGE_LENGTH)
 * @returns {Promise<{success: boolean, messagesSent: number, error?: string}>}
 */
export async function sendMessage(phoneNumber, message, options = {}) {
  const {
    executor = defaultExecutor,
    retryCount = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    maxChunkLength = MAX_MESSAGE_LENGTH,
  } = options;

  const chunks = chunkMessage(message, maxChunkLength);

  // Handle empty message
  if (chunks.length === 0) {
    return { success: true, messagesSent: 0 };
  }

  let messagesSent = 0;
  let lastError = null;

  for (const chunk of chunks) {
    const script = buildSendScript(phoneNumber, chunk);
    let sent = false;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        executor(script);
        sent = true;
        messagesSent++;
        break;
      } catch (error) {
        lastError = error.message || String(error);
        if (attempt < retryCount) {
          await sleep(retryDelayMs);
        }
      }
    }

    // If this chunk failed after all retries, stop sending
    if (!sent) {
      return {
        success: false,
        messagesSent,
        error: `Failed after ${retryCount} attempts: ${lastError}`,
      };
    }
  }

  return { success: true, messagesSent };
}

/**
 * Safe wrapper for sendMessage with dry-run mode support
 *
 * In dry-run mode, prepends [DRY-RUN] to the message so the recipient knows
 * it's a test. The message is still sent (to verify the pipeline works).
 *
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - If true, prepend [DRY-RUN] prefix (default: false)
 * @param {Function} options.executor - AppleScript executor function (for testing)
 * @param {number} options.retryCount - Number of retry attempts
 * @param {number} options.retryDelayMs - Delay between retries in ms
 * @param {number} options.maxChunkLength - Max chunk size
 * @returns {Promise<{success: boolean, messagesSent: number, error?: string}>}
 */
export async function safeSendMessage(phoneNumber, message, options = {}) {
  const { dryRun = false, ...sendOptions } = options;

  const finalMessage = dryRun ? `[DRY-RUN] ${message}` : message;

  return sendMessage(phoneNumber, finalMessage, sendOptions);
}

/**
 * Send a message to a group chat via iMessage with retry logic
 *
 * @param {string} chatGuid - Group chat GUID
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @param {Function} options.executor - AppleScript executor function (for testing)
 * @param {number} options.retryCount - Number of retry attempts (default: 3)
 * @param {number} options.retryDelayMs - Delay between retries in ms (default: 2000)
 * @param {number} options.maxChunkLength - Max chunk size (default: MAX_MESSAGE_LENGTH)
 * @returns {Promise<{success: boolean, messagesSent: number, error?: string}>}
 */
export async function sendGroupMessage(chatGuid, message, options = {}) {
  const {
    executor = defaultExecutor,
    retryCount = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    maxChunkLength = MAX_MESSAGE_LENGTH,
  } = options;

  const chunks = chunkMessage(message, maxChunkLength);

  // Handle empty message
  if (chunks.length === 0) {
    return { success: true, messagesSent: 0 };
  }

  let messagesSent = 0;
  let lastError = null;

  for (const chunk of chunks) {
    const script = buildGroupSendScript(chatGuid, chunk);
    let sent = false;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        executor(script);
        sent = true;
        messagesSent++;
        break;
      } catch (error) {
        lastError = error.message || String(error);
        if (attempt < retryCount) {
          await sleep(retryDelayMs);
        }
      }
    }

    // If this chunk failed after all retries, stop sending
    if (!sent) {
      return {
        success: false,
        messagesSent,
        error: `Failed after ${retryCount} attempts: ${lastError}`,
      };
    }
  }

  return { success: true, messagesSent };
}

/**
 * Safe wrapper for sendGroupMessage with dry-run mode support
 *
 * @param {string} chatGuid - Group chat GUID
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - If true, prepend [DRY-RUN] prefix (default: false)
 * @param {Function} options.executor - AppleScript executor function (for testing)
 * @param {number} options.retryCount - Number of retry attempts
 * @param {number} options.retryDelayMs - Delay between retries in ms
 * @param {number} options.maxChunkLength - Max chunk size
 * @returns {Promise<{success: boolean, messagesSent: number, error?: string}>}
 */
export async function safeSendGroupMessage(chatGuid, message, options = {}) {
  const { dryRun = false, ...sendOptions } = options;

  const finalMessage = dryRun ? `[DRY-RUN] ${message}` : message;

  return sendGroupMessage(chatGuid, finalMessage, sendOptions);
}
