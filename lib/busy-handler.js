// lib/busy-handler.js
import { isProcessing, getCurrentTask, getCurrentSessionCode } from './worker.js';
import { getQueueDepth } from './queue.js';

// Constants
const TASK_TRUNCATION_LENGTH = 50;

/**
 * Generate a busy message showing current task and queue position
 * @param {number|null} queuePosition - Position in queue (optional)
 * @returns {string} Busy message
 * @throws {TypeError} If queuePosition is not null or a number
 */
export function getBusyMessage(queuePosition = null) {
  // Validate queuePosition
  if (queuePosition !== null) {
    if (typeof queuePosition !== 'number' || Number.isNaN(queuePosition)) {
      throw new TypeError('queuePosition must be null or a number');
    }
    // Treat negative values as 0 (no queue position)
    if (queuePosition < 0) {
      queuePosition = 0;
    }
  }

  const currentTask = getCurrentTask();
  const taskSummary = currentTask
    ? currentTask.slice(0, TASK_TRUNCATION_LENGTH) + (currentTask.length > TASK_TRUNCATION_LENGTH ? '...' : '')
    : 'a task';

  let message = `Working on: "${taskSummary}"`;

  if (queuePosition !== null && queuePosition > 0) {
    message += `\nYour message is queued (#${queuePosition}) and will run next.`;
  } else {
    message += `\nYour message will be prioritized once complete.`;
  }

  return message;
}

/**
 * Check if bot is currently processing and should send busy message
 * @returns {boolean} True if processing, false otherwise
 */
export function shouldSendBusyMessage() {
  return isProcessing();
}

/**
 * Generate full status message with bot state, current task, session, and queue depth
 * @returns {string} Status message
 */
export function getStatusMessage() {
  const processing = isProcessing();
  const currentTask = getCurrentTask();
  const queueDepth = getQueueDepth();
  const currentSession = getCurrentSessionCode();

  let status = processing ? 'BUSY' : 'IDLE';

  let message = `Bot Status: ${status}\n`;

  if (processing && currentTask) {
    message += `Current: ${currentTask.slice(0, TASK_TRUNCATION_LENGTH)}${currentTask.length > TASK_TRUNCATION_LENGTH ? '...' : ''}\n`;
    if (currentSession) {
      message += `Session: ${currentSession}\n`;
    }
  }

  message += `Queue: ${queueDepth} pending`;

  return message;
}
