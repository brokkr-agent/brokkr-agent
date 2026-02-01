#!/usr/bin/env node

/**
 * Notification Monitor Process
 *
 * Polls macOS Notification Center and triggers actions based on rules.
 * Runs as a standalone process, typically managed by PM2.
 *
 * Usage:
 *   node notification-monitor.js [options]
 *
 * Options:
 *   --dry-run   Don't execute actions, just log what would happen
 *   --debug     Enable debug logging
 *   --verbose   Show all notifications (not just matched ones)
 */

import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getRecentNotifications, checkDatabaseAccess } from './lib/notification-db.js';
import { parseNotificationData, extractNotificationContent, formatNotificationForDisplay } from './lib/notification-parser.js';
import { evaluateRules, loadRules } from './lib/notification-rules.js';
import { handleNotification } from './lib/notification-handlers.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const WORKSPACE = process.cwd();
const LOCK_FILE = join(WORKSPACE, 'notification-monitor.lock');
const STATE_FILE = join(WORKSPACE, '.notification-state.json');
const CONFIG_FILE = join(WORKSPACE, '.claude/skills/notifications/config.json');

// Command line options
const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const VERBOSE = process.argv.includes('--verbose');

// Timing constants (can be overridden by config)
let POLL_INTERVAL_MS = 5000;
let STATE_SAVE_INTERVAL_MS = 60000;
let MAX_NOTIFICATIONS_PER_POLL = 50;

// Runtime state
let lastProcessedTime = 0;
let processedNotificationIds = new Set();
let pollCount = 0;
let rules = [];
let config = {};

// Intervals for cleanup
let pollInterval = null;
let saveInterval = null;

/**
 * Acquire a lock file to prevent multiple instances
 * @returns {boolean} True if lock acquired, false if another instance running
 */
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Check if the process is still running
      try {
        process.kill(lockData.pid, 0);
        // Process exists - lock is valid
        console.error(`[Monitor] Already running (PID: ${lockData.pid}, started: ${lockData.startedAt})`);
        return false;
      } catch {
        // Process doesn't exist - stale lock
        console.log(`[Monitor] Removing stale lock (PID ${lockData.pid} not running)`);
        unlinkSync(LOCK_FILE);
      }
    } catch (err) {
      // Invalid lock file - remove it
      console.log(`[Monitor] Removing invalid lock file: ${err.message}`);
      try {
        unlinkSync(LOCK_FILE);
      } catch {
        // Ignore removal errors
      }
    }
  }

  // Write new lock file
  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    workspace: WORKSPACE
  };
  writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
  console.log(`[Monitor] Lock acquired (PID: ${process.pid})`);
  return true;
}

/**
 * Release the lock file
 */
function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      // Only remove if it's our lock
      if (lockData.pid === process.pid) {
        unlinkSync(LOCK_FILE);
        console.log('[Monitor] Lock released');
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Load persisted state from file
 */
function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      lastProcessedTime = state.lastProcessedTime || 0;
      processedNotificationIds = new Set(state.processedIds || []);
      const lastTime = new Date(lastProcessedTime * 1000).toISOString();
      console.log(`[Monitor] Loaded state: ${processedNotificationIds.size} processed IDs, last time: ${lastTime}`);
    } else {
      console.log('[Monitor] No previous state found, starting fresh');
    }
  } catch (err) {
    console.error(`[Monitor] Failed to load state: ${err.message}`);
  }
}

/**
 * Save current state to file
 */
function saveState() {
  try {
    // Keep only the last 500 IDs to prevent unbounded growth
    const idsArray = Array.from(processedNotificationIds).slice(-500);
    const state = {
      lastProcessedTime,
      processedIds: idsArray,
      savedAt: new Date().toISOString(),
      pollCount
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    if (DEBUG) {
      console.log(`[Monitor] State saved: ${idsArray.length} IDs, poll #${pollCount}`);
    }
  } catch (err) {
    console.error(`[Monitor] Failed to save state: ${err.message}`);
  }
}

/**
 * Load configuration from file
 * @returns {Object} Configuration object
 */
function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      console.log(`[Monitor] Loaded config from ${CONFIG_FILE}`);
      return cfg;
    }
  } catch (err) {
    console.error(`[Monitor] Failed to load config: ${err.message}`);
  }
  return {};
}

/**
 * Parse a raw database record into notification format for rules engine
 * @param {Object} record - Raw database record
 * @returns {Object} Parsed notification object
 */
function parseNotification(record) {
  // Parse the binary plist data
  const plist = parseNotificationData(record.data);
  const content = extractNotificationContent(plist);

  return {
    id: record.rec_id,
    app: record.app_id,  // Friendly name like 'imessage'
    bundleId: record.bundle_id,
    content,
    delivered: record.delivered_date,
    presented: record.presented,
    raw: plist
  };
}

/**
 * Poll for new notifications and process them
 */
async function pollNotifications() {
  pollCount++;

  try {
    // Calculate start time: use last processed time or 5 minutes ago for first run
    const startTime = lastProcessedTime || (Date.now() / 1000 - 300);

    const notifications = await getRecentNotifications(startTime, MAX_NOTIFICATIONS_PER_POLL);

    // Debug logging every minute (12 polls at 5s interval)
    if (DEBUG && pollCount % 12 === 0) {
      const timeStr = new Date(startTime * 1000).toISOString();
      console.log(`[Poll #${pollCount}] Found ${notifications.length} notifications since ${timeStr}`);
    }

    // Filter out already processed notifications and reverse to process oldest first
    const newNotifications = notifications
      .filter(n => !processedNotificationIds.has(n.rec_id))
      .reverse();

    if (newNotifications.length > 0 && DEBUG) {
      console.log(`[Poll #${pollCount}] Processing ${newNotifications.length} new notifications`);
    }

    // Process each notification
    for (const rawNotification of newNotifications) {
      try {
        await processNotification(rawNotification);
      } catch (err) {
        console.error(`[Monitor] Error processing notification ${rawNotification.rec_id}: ${err.message}`);
        if (DEBUG) {
          console.error(err.stack);
        }
      }

      // Mark as processed regardless of success/failure to avoid infinite loops
      processedNotificationIds.add(rawNotification.rec_id);
      lastProcessedTime = Math.max(lastProcessedTime, rawNotification.delivered_date);
    }
  } catch (err) {
    console.error(`[Poll #${pollCount}] Error: ${err.message}`);
    if (DEBUG) {
      console.error(err.stack);
    }
  }
}

/**
 * Process a single notification through the rules engine
 * @param {Object} rawNotification - Raw notification from database
 */
async function processNotification(rawNotification) {
  const notification = parseNotification(rawNotification);

  // Verbose mode: show all notifications
  if (VERBOSE) {
    console.log('\n' + formatNotificationForDisplay(notification));
  }

  // Check against blacklist/ignored apps
  if (config.ignored_apps && config.ignored_apps.includes(notification.bundleId)) {
    if (DEBUG) {
      console.log(`[${notification.app}] Ignored (blacklisted bundle)`);
    }
    return;
  }

  // Evaluate rules
  const matchedRules = evaluateRules(notification, rules);

  if (matchedRules.length === 0) {
    if (DEBUG) {
      console.log(`[${notification.app}] No rules matched`);
    }
    return;
  }

  // Use highest priority rule
  const action = matchedRules[0];
  console.log(`[${notification.app}] Matched rule: "${action.name}" -> ${action.action}`);

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would execute action: ${action.action}`);
    if (action.action === 'webhook' && action.webhookUrl) {
      console.log(`[DRY-RUN] Webhook URL: ${action.webhookUrl}`);
    }
    return;
  }

  // Execute the action
  await handleNotification(notification, action);
}

/**
 * Clean shutdown handler
 */
function cleanup() {
  console.log('\n[Monitor] Shutting down...');

  // Stop polling
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }

  // Save final state
  saveState();

  // Release lock
  releaseLock();

  console.log('[Monitor] Shutdown complete');
}

/**
 * Main startup function
 */
async function start() {
  console.log('\n========================================');
  console.log('[Notification Monitor]');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`  Debug: ${DEBUG ? 'enabled' : 'disabled'}`);
  console.log(`  Verbose: ${VERBOSE ? 'enabled' : 'disabled'}`);
  console.log('========================================\n');

  // Check database access
  const dbCheck = await checkDatabaseAccess();
  if (!dbCheck.accessible) {
    console.error(`[Monitor] Cannot access notification database: ${dbCheck.error}`);
    console.error(`[Monitor] Database path: ${dbCheck.path}`);
    console.error('\nMake sure Terminal/iTerm has Full Disk Access in System Settings > Privacy & Security');
    process.exit(1);
  }
  console.log(`[Monitor] Database accessible: ${dbCheck.path}`);

  // Load configuration
  config = loadConfig();

  // Apply config overrides
  if (config.polling_interval_ms) {
    POLL_INTERVAL_MS = config.polling_interval_ms;
  }
  if (config.state_save_interval_ms) {
    STATE_SAVE_INTERVAL_MS = config.state_save_interval_ms;
  }
  if (config.max_notifications_per_poll) {
    MAX_NOTIFICATIONS_PER_POLL = config.max_notifications_per_poll;
  }

  console.log(`[Monitor] Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`[Monitor] State save interval: ${STATE_SAVE_INTERVAL_MS}ms`);

  // Load rules
  rules = loadRules(CONFIG_FILE);
  console.log(`[Monitor] Loaded ${rules.length} rules`);

  if (DEBUG && rules.length > 0) {
    console.log('[Monitor] Rules:');
    rules.forEach(r => {
      console.log(`  - ${r.name} (priority: ${r.priority || 0}, action: ${r.action})`);
    });
  }

  // Load previous state
  loadState();

  // Start polling
  pollInterval = setInterval(pollNotifications, POLL_INTERVAL_MS);
  saveInterval = setInterval(saveState, STATE_SAVE_INTERVAL_MS);

  // Run first poll immediately
  await pollNotifications();

  console.log('\n[Monitor] Running. Press Ctrl+C to stop.\n');
}

// Signal handlers for graceful shutdown
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  releaseLock();
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Monitor] Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Monitor] Unhandled rejection at:', promise, 'reason:', reason);
});

// Main entry point
console.log('[Monitor] Starting notification monitor...');

if (!acquireLock()) {
  console.error('[Monitor] Exiting: another instance is already running');
  process.exit(1);
}

start().catch(err => {
  console.error('[Monitor] Startup failed:', err);
  releaseLock();
  process.exit(1);
});
