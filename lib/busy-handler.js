// lib/busy-handler.js
import { isProcessing, getCurrentTask, getCurrentSessionCode } from './worker.js';
import { getQueueDepth } from './queue.js';

/**
 * Generate a busy message showing current task and queue position
 * @param {number|null} queuePosition - Position in queue (optional)
 * @returns {string} Busy message
 */
export function getBusyMessage(queuePosition = null) {
  const currentTask = getCurrentTask();
  const taskSummary = currentTask
    ? currentTask.slice(0, 50) + (currentTask.length > 50 ? '...' : '')
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
    message += `Current: ${currentTask.slice(0, 50)}...\n`;
    if (currentSession) {
      message += `Session: ${currentSession}\n`;
    }
  }

  message += `Queue: ${queueDepth} pending`;

  return message;
}
