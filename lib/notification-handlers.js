/**
 * Notification Handlers - App-Specific Handlers
 *
 * Handles notifications based on matched rule actions.
 * This module runs in the notification monitor process (separate from WhatsApp bot).
 *
 * Supported actions:
 *   - invoke: Queue task for Brokkr agent (writes context to file)
 *   - log: Log to console
 *   - webhook: Send to external webhook URL
 *   - ignore: Do nothing
 */

import { writeFileSync } from 'fs';

export const CONTEXT_FILE = '/tmp/brokkr-notification-context.json';

/**
 * Handle a notification based on the matched rule action
 * @param {Object} notification - The notification object
 * @param {Object} rule - The matched rule with action
 */
export async function handleNotification(notification, rule) {
  const action = rule.action || 'log';

  switch (action) {
    case 'invoke':
      return invokeAgent(notification, rule);
    case 'log':
      return logNotification(notification, rule);
    case 'webhook':
      return sendWebhook(notification, rule);
    case 'ignore':
      return;
    default:
      console.log(`[Handler] Unknown action: ${action}`);
  }
}

/**
 * Invoke the Brokkr agent by writing context to a file
 * @param {Object} notification - The notification object
 * @param {Object} rule - The matched rule
 */
async function invokeAgent(notification, rule) {
  // Write context for agent to read
  const context = {
    notification,
    rule: { name: rule.name, action: rule.action },
    timestamp: new Date().toISOString()
  };

  writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));

  // Determine command to invoke
  const command = rule.command || `/${notification.app}`;

  console.log(`[Handler] Would invoke: ${command}`);
  console.log(`[Handler] Context written to ${CONTEXT_FILE}`);
}

/**
 * Log notification to console
 * @param {Object} notification - The notification object
 * @param {Object} rule - The matched rule
 */
function logNotification(notification, rule) {
  const time = notification.delivered
    ? new Date(notification.delivered * 1000).toISOString()
    : new Date().toISOString();

  console.log(`[LOG] [${time}] [${notification.app}] ${notification.content?.title || '(no title)'}`);
  if (notification.content?.body) {
    console.log(`       ${notification.content.body.slice(0, 100)}`);
  }
}

/**
 * Send notification to external webhook URL
 * @param {Object} notification - The notification object
 * @param {Object} rule - The matched rule with webhookUrl
 */
async function sendWebhook(notification, rule) {
  if (!rule.webhookUrl) {
    console.error('[Handler] Webhook action requires webhookUrl');
    return;
  }

  try {
    const response = await fetch(rule.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'notification',
        app: notification.app,
        content: notification.content,
        delivered: notification.delivered,
        rule: rule.name
      })
    });

    if (!response.ok) {
      console.error(`[Handler] Webhook failed: ${response.status}`);
    }
  } catch (err) {
    console.error(`[Handler] Webhook error: ${err.message}`);
  }
}

/**
 * Get handler configuration for a specific app
 * @param {string} app - The app identifier (e.g., 'imessage', 'mail')
 * @returns {Object} Handler configuration with formatTask, command, and priority
 */
export function getAppHandler(app) {
  const handlers = {
    imessage: {
      formatTask: (n) => `iMessage from ${n.content?.title}: ${n.content?.body}`,
      command: '/imessage',
      priority: 100
    },
    mail: {
      formatTask: (n) => `Email: ${n.content?.title}`,
      command: '/mail',
      priority: 75
    },
    calendar: {
      formatTask: (n) => `Calendar: ${n.content?.title}`,
      command: '/calendar',
      priority: 50
    },
    reminders: {
      formatTask: (n) => `Reminder: ${n.content?.title}`,
      command: '/reminders',
      priority: 50
    },
    notes: {
      formatTask: (n) => `Note: ${n.content?.title}`,
      command: '/notes',
      priority: 25
    }
  };

  return handlers[app] || {
    formatTask: (n) => `${n.app || app}: ${n.content?.title}`,
    command: `/${app}`,
    priority: 25
  };
}
