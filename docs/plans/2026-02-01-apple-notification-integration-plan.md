# Apple Notification Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Enable Brokkr to receive and process macOS Notification Center notifications from integrated apps (Messages, Mail, Calendar), with logical processing rules to determine when to invoke the agent.

**Architecture:** Poll the macOS Notification Center SQLite database at `$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db` every 5 seconds using Node.js. Parse binary plist notification data, route to app-specific handlers, and invoke agent based on configurable trigger rules. Runs as a separate `notification-monitor.js` process managed by PM2.

**Tech Stack:** Node.js, SQLite3 (better-sqlite3), binary plist parsing (bplist-parser), child_process for plutil fallback

---

## Research Summary (2026-02-01)

### Key Findings

**Approach:** SQLite database polling is the ONLY viable method to read notifications from other apps on macOS.

**Database Location (Sonoma 14.8.3):**
```bash
$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db
```

**No Permissions Required:** On Sonoma, the user's own notification database is accessible without special permissions.

**Limitations:**
- No real-time API - polling required (5-second intervals)
- Cannot dismiss or interact with notifications programmatically
- Binary plist format requires decoding
- Database schema may change in future macOS versions

**Sequoia (15.0+) Note:** Database moves to TCC-protected location. Plan includes migration path.

### Official Documentation Sources

- [macOS Notification Center Forensics](https://kieczkowska.wordpress.com/2020/05/20/macos-notifications-forensics/)
- [The 'Dark' Side of macOS Notifications - Objective-See](https://objective-see.org/blog/blog_0x2E.html)
- [macOS Monterey Notification Database Schema](https://github.com/75033us/blog/blob/main/2022-02-02-macos-monterey-notification-database-schema.md)
- [MacForensics/macNotifications.py](https://github.com/ydkhatri/MacForensics/blob/master/macNotifications.py)

---

## Database Schema

```sql
-- app table: Maps bundle identifiers to internal IDs
CREATE TABLE app (
    app_id INTEGER PRIMARY KEY,
    identifier VARCHAR,  -- e.g., 'com.apple.mail', 'com.apple.mobilesms'
    badge INTEGER NULL
);

-- record table: Individual notification records
CREATE TABLE record (
    rec_id INTEGER PRIMARY KEY,
    app_id INTEGER,
    uuid BLOB,
    data BLOB,           -- Binary plist with notification content
    request_date REAL,   -- Mac Absolute Time (seconds since 2001-01-01)
    delivered_date REAL,
    presented Bool,
    style INTEGER,
    snooze_fire_date REAL
);
```

**Time Conversion:** Mac Absolute Time + 978307200 = Unix timestamp

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database Reader Module | `lib/notification-db.js`, `tests/notification-db.test.js` |
| 2 | Binary Plist Parser | `lib/notification-parser.js`, `tests/notification-parser.test.js` |
| 3 | Notification Monitor Process | `notification-monitor.js` |
| 4 | Trigger Rules Engine | `lib/notification-rules.js`, `tests/notification-rules.test.js` |
| 5 | App-Specific Handlers | `lib/notification-handlers.js` |
| 6 | PM2 Configuration | `ecosystem.config.cjs` |
| 7 | Bot Control Script Update | `scripts/bot-control.sh` |
| 8 | Skill Documentation | `skills/notifications/skill.md` |
| 9 | Configuration File | `skills/notifications/config.json` |
| 10 | Integration Testing | `scripts/test-notifications.js` |
| 11 | CLAUDE.md Update | `CLAUDE.md` |

---

## Task 1: Database Reader Module

**Files:**
- Create: `lib/notification-db.js`
- Create: `tests/notification-db.test.js`

### Step 1: Write the failing test

```javascript
// tests/notification-db.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDbPath,
  macTimeToUnix,
  getRecentNotifications,
  getAppIdentifier
} from '../lib/notification-db.js';

describe('Notification Database', () => {
  describe('getDbPath', () => {
    it('should return path containing com.apple.notificationcenter', () => {
      const path = getDbPath();
      expect(path).toContain('com.apple.notificationcenter/db2/db');
    });
  });

  describe('macTimeToUnix', () => {
    it('should convert Mac Absolute Time to Unix timestamp', () => {
      // Mac time 0 = Jan 1, 2001 = Unix 978307200
      const unixTime = macTimeToUnix(0);
      expect(unixTime).toBe(978307200);
    });

    it('should convert recent Mac time correctly', () => {
      // Example: Feb 1, 2026 00:00:00 UTC
      // Unix: 1769904000, Mac: 1769904000 - 978307200 = 791596800
      const macTime = 791596800;
      const unixTime = macTimeToUnix(macTime);
      expect(unixTime).toBe(1769904000);
    });
  });

  describe('getAppIdentifier', () => {
    it('should return "imessage" for com.apple.MobileSMS', () => {
      expect(getAppIdentifier('com.apple.MobileSMS')).toBe('imessage');
    });

    it('should return "mail" for com.apple.mail', () => {
      expect(getAppIdentifier('com.apple.mail')).toBe('mail');
    });

    it('should return "calendar" for com.apple.iCal', () => {
      expect(getAppIdentifier('com.apple.iCal')).toBe('calendar');
    });

    it('should return bundle id for unknown apps', () => {
      expect(getAppIdentifier('com.example.app')).toBe('com.example.app');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/notification-db.test.js`
Expected: FAIL with "Cannot find module '../lib/notification-db.js'"

### Step 3: Write minimal implementation

```javascript
// lib/notification-db.js
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

// Mac Absolute Time epoch offset (seconds between 1970-01-01 and 2001-01-01)
const MAC_EPOCH_OFFSET = 978307200;

// App bundle ID to friendly name mapping
const APP_IDENTIFIERS = {
  'com.apple.MobileSMS': 'imessage',
  'com.apple.mobilesms': 'imessage',
  'com.apple.mail': 'mail',
  'com.apple.Mail': 'mail',
  'com.apple.iCal': 'calendar',
  'com.apple.ical': 'calendar',
  'com.apple.CalendarNotification': 'calendar',
  'com.apple.FaceTime': 'facetime',
  'com.apple.facetime': 'facetime',
  'com.apple.reminders': 'reminders',
  'com.apple.Reminders': 'reminders'
};

/**
 * Get the path to the notification database
 * @returns {string} Database file path
 */
export function getDbPath() {
  try {
    const darwinDir = execSync('getconf DARWIN_USER_DIR', { encoding: 'utf-8' }).trim();
    return `${darwinDir}/com.apple.notificationcenter/db2/db`;
  } catch (err) {
    console.error('[NotificationDB] Failed to get DARWIN_USER_DIR:', err.message);
    throw new Error('Cannot determine notification database path');
  }
}

/**
 * Convert Mac Absolute Time to Unix timestamp
 * @param {number} macTime - Seconds since 2001-01-01
 * @returns {number} Unix timestamp (seconds since 1970-01-01)
 */
export function macTimeToUnix(macTime) {
  return macTime + MAC_EPOCH_OFFSET;
}

/**
 * Convert Unix timestamp to Mac Absolute Time
 * @param {number} unixTime - Unix timestamp
 * @returns {number} Mac Absolute Time
 */
export function unixToMacTime(unixTime) {
  return unixTime - MAC_EPOCH_OFFSET;
}

/**
 * Get friendly app identifier from bundle ID
 * @param {string} bundleId - App bundle identifier
 * @returns {string} Friendly identifier or original bundle ID
 */
export function getAppIdentifier(bundleId) {
  return APP_IDENTIFIERS[bundleId] || bundleId;
}

/**
 * Get recent notifications from the database
 * @param {number} sinceUnixTime - Unix timestamp to fetch notifications after
 * @param {number} limit - Maximum notifications to return
 * @returns {Array<{rec_id: number, app: string, bundleId: string, data: Buffer, delivered: number}>}
 */
export function getRecentNotifications(sinceUnixTime = 0, limit = 50) {
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const sinceMacTime = unixToMacTime(sinceUnixTime);

    const query = `
      SELECT
        r.rec_id,
        a.identifier as bundle_id,
        r.data,
        r.delivered_date,
        r.presented
      FROM record r
      JOIN app a ON r.app_id = a.app_id
      WHERE r.delivered_date > ?
      ORDER BY r.delivered_date DESC
      LIMIT ?
    `;

    const rows = db.prepare(query).all(sinceMacTime, limit);

    return rows.map(row => ({
      rec_id: row.rec_id,
      app: getAppIdentifier(row.bundle_id),
      bundleId: row.bundle_id,
      data: row.data,
      delivered: macTimeToUnix(row.delivered_date),
      presented: row.presented === 1
    }));
  } finally {
    db.close();
  }
}

/**
 * Get notifications for a specific app
 * @param {string} appIdentifier - App identifier (e.g., 'imessage', 'mail')
 * @param {number} sinceUnixTime - Unix timestamp to fetch after
 * @param {number} limit - Maximum notifications
 * @returns {Array} Notifications for the app
 */
export function getNotificationsForApp(appIdentifier, sinceUnixTime = 0, limit = 20) {
  const notifications = getRecentNotifications(sinceUnixTime, limit * 2);
  return notifications.filter(n => n.app === appIdentifier).slice(0, limit);
}

/**
 * Check if database is accessible
 * @returns {{accessible: boolean, path: string, error?: string}}
 */
export function checkDatabaseAccess() {
  try {
    const dbPath = getDbPath();
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const result = db.prepare('SELECT COUNT(*) as count FROM app').get();
    db.close();

    return {
      accessible: true,
      path: dbPath,
      appCount: result.count
    };
  } catch (err) {
    return {
      accessible: false,
      path: getDbPath(),
      error: err.message
    };
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- tests/notification-db.test.js`
Expected: PASS (all 6 tests)

### Step 5: Commit

```bash
git add lib/notification-db.js tests/notification-db.test.js
git commit -m "feat(notifications): add database reader module"
```

---

## Task 2: Binary Plist Parser

**Files:**
- Create: `lib/notification-parser.js`
- Create: `tests/notification-parser.test.js`

### Step 1: Write the failing test

```javascript
// tests/notification-parser.test.js
import { describe, it, expect } from 'vitest';
import {
  parseNotificationData,
  extractNotificationContent,
  formatNotificationForDisplay
} from '../lib/notification-parser.js';

describe('Notification Parser', () => {
  describe('extractNotificationContent', () => {
    it('should extract title from plist data', () => {
      const plist = { titl: 'New Message' };
      const content = extractNotificationContent(plist);
      expect(content.title).toBe('New Message');
    });

    it('should extract body from plist data', () => {
      const plist = { body: 'Hello from Tommy' };
      const content = extractNotificationContent(plist);
      expect(content.body).toBe('Hello from Tommy');
    });

    it('should extract subtitle from plist data', () => {
      const plist = { subt: 'iMessage' };
      const content = extractNotificationContent(plist);
      expect(content.subtitle).toBe('iMessage');
    });

    it('should handle missing fields gracefully', () => {
      const content = extractNotificationContent({});
      expect(content.title).toBe('');
      expect(content.body).toBe('');
      expect(content.subtitle).toBe('');
    });
  });

  describe('formatNotificationForDisplay', () => {
    it('should format notification with title and body', () => {
      const notification = {
        app: 'imessage',
        content: { title: 'Tommy', body: 'Hey!' }
      };
      const display = formatNotificationForDisplay(notification);
      expect(display).toContain('Tommy');
      expect(display).toContain('Hey!');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/notification-parser.test.js`
Expected: FAIL with "Cannot find module '../lib/notification-parser.js'"

### Step 3: Write minimal implementation

```javascript
// lib/notification-parser.js
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Parse binary plist data from notification database
 * @param {Buffer} data - Binary plist data
 * @returns {Object|null} Parsed plist object or null on error
 */
export function parseNotificationData(data) {
  if (!data || data.length === 0) {
    return null;
  }

  // Try using plutil (built into macOS) for reliable parsing
  const tempFile = join(tmpdir(), `notification-${Date.now()}-${Math.random().toString(36).slice(2)}.plist`);

  try {
    writeFileSync(tempFile, data);

    // Convert to JSON using plutil
    const json = execSync(`plutil -convert json -o - "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 5000
    });

    return JSON.parse(json);
  } catch (err) {
    // Fallback: try to extract text content directly
    try {
      const text = data.toString('utf-8');
      return { rawText: text };
    } catch {
      return null;
    }
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract notification content from parsed plist
 * @param {Object} plist - Parsed plist object
 * @returns {{title: string, body: string, subtitle: string, sender?: string}}
 */
export function extractNotificationContent(plist) {
  if (!plist) {
    return { title: '', body: '', subtitle: '' };
  }

  return {
    title: plist.titl || plist.title || plist.req?.titl || '',
    body: plist.body || plist.req?.body || '',
    subtitle: plist.subt || plist.subtitle || plist.req?.subt || '',
    sender: plist.srce || plist.sender || undefined,
    threadId: plist.thrd || plist.threadId || undefined,
    category: plist.catg || plist.category || undefined
  };
}

/**
 * Parse a raw notification record from the database
 * @param {{rec_id: number, app: string, bundleId: string, data: Buffer, delivered: number, presented: boolean}} record
 * @returns {{id: number, app: string, bundleId: string, content: Object, delivered: number, presented: boolean}}
 */
export function parseNotificationRecord(record) {
  const plist = parseNotificationData(record.data);
  const content = extractNotificationContent(plist);

  return {
    id: record.rec_id,
    app: record.app,
    bundleId: record.bundleId,
    content,
    delivered: record.delivered,
    presented: record.presented,
    raw: plist
  };
}

/**
 * Format notification for display
 * @param {Object} notification - Parsed notification
 * @returns {string} Formatted display string
 */
export function formatNotificationForDisplay(notification) {
  const { app, content, delivered } = notification;
  const time = new Date(delivered * 1000).toLocaleTimeString();

  let display = `[${app}] ${time}`;

  if (content.title) {
    display += `\n  ${content.title}`;
  }
  if (content.subtitle) {
    display += ` - ${content.subtitle}`;
  }
  if (content.body) {
    display += `\n  ${content.body}`;
  }

  return display;
}

/**
 * Check if notification content matches search criteria
 * @param {Object} content - Notification content
 * @param {Object} criteria - Search criteria {title?, body?, any?}
 * @returns {boolean}
 */
export function matchesContent(content, criteria) {
  const titleLower = (content.title || '').toLowerCase();
  const bodyLower = (content.body || '').toLowerCase();
  const subtitleLower = (content.subtitle || '').toLowerCase();

  if (criteria.title) {
    const searchTitle = criteria.title.toLowerCase();
    if (!titleLower.includes(searchTitle)) return false;
  }

  if (criteria.body) {
    const searchBody = criteria.body.toLowerCase();
    if (!bodyLower.includes(searchBody)) return false;
  }

  if (criteria.any) {
    const searchAny = criteria.any.toLowerCase();
    const combined = `${titleLower} ${bodyLower} ${subtitleLower}`;
    if (!combined.includes(searchAny)) return false;
  }

  return true;
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- tests/notification-parser.test.js`
Expected: PASS (all 5 tests)

### Step 5: Commit

```bash
git add lib/notification-parser.js tests/notification-parser.test.js
git commit -m "feat(notifications): add binary plist parser"
```

---

## Task 3: Notification Monitor Process

**Files:**
- Create: `notification-monitor.js`

### Step 1: Create the main monitor process

```javascript
// notification-monitor.js
// Notification monitor that polls macOS Notification Center database
// and triggers Brokkr agent for relevant notifications

import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

import { getRecentNotifications, checkDatabaseAccess } from './lib/notification-db.js';
import { parseNotificationRecord, formatNotificationForDisplay } from './lib/notification-parser.js';
import { evaluateRules, loadRules } from './lib/notification-rules.js';
import { handleNotification } from './lib/notification-handlers.js';

// Configuration
const WORKSPACE = process.cwd();
const LOCK_FILE = join(WORKSPACE, 'notification-monitor.lock');
const STATE_FILE = join(WORKSPACE, '.notification-state.json');
const CONFIG_FILE = join(WORKSPACE, 'skills/notifications/config.json');

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const VERBOSE = process.argv.includes('--verbose');

// Timing
const POLL_INTERVAL_MS = 5000; // 5 seconds
const STATE_SAVE_INTERVAL_MS = 60000; // 1 minute

// State
let lastProcessedTime = 0;
let processedNotificationIds = new Set();
let pollCount = 0;
let rules = [];

// ============================================
// Lock file management
// ============================================

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      try {
        process.kill(lockData.pid, 0);
        console.error(`Notification monitor already running (PID: ${lockData.pid})`);
        return false;
      } catch {
        console.log(`Removing stale lock file (PID ${lockData.pid} not running)`);
        unlinkSync(LOCK_FILE);
      }
    } catch {
      console.log('Removing invalid lock file');
      try { unlinkSync(LOCK_FILE); } catch {}
    }
  }

  writeFileSync(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString()
  }, null, 2));

  console.log(`Lock acquired (PID: ${process.pid})`);
  return true;
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      if (lockData.pid === process.pid) {
        unlinkSync(LOCK_FILE);
        console.log('Lock released');
      }
    }
  } catch {}
}

// ============================================
// State persistence
// ============================================

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      lastProcessedTime = state.lastProcessedTime || 0;
      processedNotificationIds = new Set(state.processedIds || []);
      console.log(`Loaded state: last processed ${new Date(lastProcessedTime * 1000).toISOString()}`);
    }
  } catch (err) {
    console.error('Failed to load state:', err.message);
  }
}

function saveState() {
  try {
    // Keep only recent IDs (last 500)
    const idsArray = Array.from(processedNotificationIds);
    const recentIds = idsArray.slice(-500);

    writeFileSync(STATE_FILE, JSON.stringify({
      lastProcessedTime,
      processedIds: recentIds,
      savedAt: new Date().toISOString()
    }, null, 2));
  } catch (err) {
    console.error('Failed to save state:', err.message);
  }
}

// ============================================
// Notification polling
// ============================================

async function pollNotifications() {
  pollCount++;

  try {
    // Get notifications since last check
    const startTime = lastProcessedTime || (Date.now() / 1000 - 300); // Default: last 5 minutes
    const notifications = getRecentNotifications(startTime, 50);

    if (DEBUG && pollCount % 12 === 0) { // Log every minute
      console.log(`[Poll #${pollCount}] Found ${notifications.length} notifications since ${new Date(startTime * 1000).toISOString()}`);
    }

    // Process new notifications (oldest first)
    const newNotifications = notifications
      .filter(n => !processedNotificationIds.has(n.rec_id))
      .reverse();

    for (const rawNotification of newNotifications) {
      try {
        await processNotification(rawNotification);
      } catch (err) {
        console.error(`Error processing notification ${rawNotification.rec_id}:`, err.message);
      }

      // Mark as processed
      processedNotificationIds.add(rawNotification.rec_id);
      lastProcessedTime = Math.max(lastProcessedTime, rawNotification.delivered);
    }

  } catch (err) {
    console.error('[Poll] Error:', err.message);
  }
}

async function processNotification(rawNotification) {
  // Parse the notification
  const notification = parseNotificationRecord(rawNotification);

  if (VERBOSE) {
    console.log('\n' + formatNotificationForDisplay(notification));
  }

  // Evaluate rules
  const matchedRules = evaluateRules(notification, rules);

  if (matchedRules.length === 0) {
    if (DEBUG) {
      console.log(`[${notification.app}] No rules matched, skipping`);
    }
    return;
  }

  // Get highest priority action
  const action = matchedRules.sort((a, b) => b.priority - a.priority)[0];

  console.log(`[${notification.app}] Matched rule: ${action.name} (${action.action})`);

  // Execute action
  if (!DRY_RUN) {
    await handleNotification(notification, action);
  } else {
    console.log(`[DRY-RUN] Would execute: ${action.action}`);
  }
}

// ============================================
// Startup
// ============================================

let pollInterval = null;
let saveInterval = null;

function start() {
  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\n[Notification Monitor] Mode: ${mode}`);

  // Check database access
  const dbCheck = checkDatabaseAccess();
  if (!dbCheck.accessible) {
    console.error(`[ERROR] Cannot access notification database: ${dbCheck.error}`);
    console.error(`[ERROR] Path: ${dbCheck.path}`);
    process.exit(1);
  }
  console.log(`[Notification Monitor] Database accessible (${dbCheck.appCount} apps registered)`);

  // Load rules
  rules = loadRules(CONFIG_FILE);
  console.log(`[Notification Monitor] Loaded ${rules.length} rules`);

  // Load previous state
  loadState();

  // Start polling
  pollInterval = setInterval(pollNotifications, POLL_INTERVAL_MS);

  // Start state saving
  saveInterval = setInterval(saveState, STATE_SAVE_INTERVAL_MS);

  // Do initial poll
  pollNotifications();

  console.log('[Notification Monitor] Started\n');
}

// ============================================
// Shutdown
// ============================================

function cleanup() {
  console.log('\nShutting down notification monitor...');

  if (pollInterval) clearInterval(pollInterval);
  if (saveInterval) clearInterval(saveInterval);

  saveState();
  releaseLock();
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('exit', releaseLock);

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  cleanup();
  process.exit(1);
});

// ============================================
// Main
// ============================================

console.log('[Notification Monitor] Starting...');
if (DRY_RUN) console.log('*** DRY-RUN MODE ***\n');

if (!acquireLock()) {
  console.error('Exiting: another instance is running');
  process.exit(1);
}

start();
```

### Step 2: Verify syntax

Run: `node --check notification-monitor.js`
Expected: No output (syntax valid)

### Step 3: Commit

```bash
git add notification-monitor.js
git commit -m "feat(notifications): add main monitor process"
```

---

## Task 4: Trigger Rules Engine

**Files:**
- Create: `lib/notification-rules.js`
- Create: `tests/notification-rules.test.js`

### Step 1: Write the failing test

```javascript
// tests/notification-rules.test.js
import { describe, it, expect } from 'vitest';
import {
  evaluateRules,
  matchesRule,
  parseRuleCondition
} from '../lib/notification-rules.js';

describe('Notification Rules Engine', () => {
  const sampleRules = [
    {
      name: 'urgent-email',
      app: 'mail',
      condition: { titleContains: 'URGENT' },
      action: 'invoke',
      priority: 100
    },
    {
      name: 'tommy-message',
      app: 'imessage',
      condition: { senderContains: 'Tommy' },
      action: 'invoke',
      priority: 90
    },
    {
      name: 'calendar-reminder',
      app: 'calendar',
      condition: { any: true },
      action: 'log',
      priority: 50
    }
  ];

  describe('matchesRule', () => {
    it('should match when app and condition match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'URGENT: Server down', body: 'Check now' }
      };
      const rule = sampleRules[0];
      expect(matchesRule(notification, rule)).toBe(true);
    });

    it('should not match when app differs', () => {
      const notification = {
        app: 'imessage',
        content: { title: 'URGENT: Call me', body: '' }
      };
      const rule = sampleRules[0];
      expect(matchesRule(notification, rule)).toBe(false);
    });

    it('should match any condition', () => {
      const notification = {
        app: 'calendar',
        content: { title: 'Meeting', body: 'In 10 minutes' }
      };
      const rule = sampleRules[2];
      expect(matchesRule(notification, rule)).toBe(true);
    });
  });

  describe('evaluateRules', () => {
    it('should return matching rules sorted by priority', () => {
      const notification = {
        app: 'mail',
        content: { title: 'URGENT', body: 'Test' }
      };
      const matches = evaluateRules(notification, sampleRules);
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe('urgent-email');
    });

    it('should return empty array when no rules match', () => {
      const notification = {
        app: 'slack',
        content: { title: 'New message', body: 'Hello' }
      };
      const matches = evaluateRules(notification, sampleRules);
      expect(matches.length).toBe(0);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/notification-rules.test.js`
Expected: FAIL with "Cannot find module"

### Step 3: Write minimal implementation

```javascript
// lib/notification-rules.js
import { readFileSync, existsSync } from 'fs';

/**
 * Load rules from config file
 * @param {string} configPath - Path to config.json
 * @returns {Array} Array of rule objects
 */
export function loadRules(configPath) {
  try {
    if (!existsSync(configPath)) {
      console.log(`[Rules] Config not found at ${configPath}, using defaults`);
      return getDefaultRules();
    }

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.rules || [];
  } catch (err) {
    console.error('[Rules] Failed to load config:', err.message);
    return getDefaultRules();
  }
}

/**
 * Get default notification rules
 * @returns {Array} Default rules
 */
export function getDefaultRules() {
  return [
    {
      name: 'tommy-imessage',
      description: 'Messages from Tommy',
      app: 'imessage',
      condition: { senderContains: '+12069090025' },
      action: 'invoke',
      priority: 100
    },
    {
      name: 'urgent-email',
      description: 'Emails with URGENT in subject',
      app: 'mail',
      condition: { titleContains: 'URGENT' },
      action: 'invoke',
      priority: 90
    },
    {
      name: 'calendar-soon',
      description: 'Calendar events starting soon',
      app: 'calendar',
      condition: { any: true },
      action: 'log',
      priority: 50
    }
  ];
}

/**
 * Check if notification matches a rule condition
 * @param {Object} notification - Parsed notification
 * @param {Object} condition - Rule condition
 * @returns {boolean}
 */
export function matchesCondition(notification, condition) {
  const { content } = notification;
  const title = (content.title || '').toLowerCase();
  const body = (content.body || '').toLowerCase();
  const sender = (content.sender || content.title || '').toLowerCase();
  const combined = `${title} ${body} ${sender}`;

  // Match any notification from this app
  if (condition.any === true) {
    return true;
  }

  // Title contains
  if (condition.titleContains) {
    const search = condition.titleContains.toLowerCase();
    if (!title.includes(search)) return false;
  }

  // Body contains
  if (condition.bodyContains) {
    const search = condition.bodyContains.toLowerCase();
    if (!body.includes(search)) return false;
  }

  // Sender contains
  if (condition.senderContains) {
    const search = condition.senderContains.toLowerCase();
    if (!sender.includes(search) && !combined.includes(search)) return false;
  }

  // Any field contains
  if (condition.anyContains) {
    const search = condition.anyContains.toLowerCase();
    if (!combined.includes(search)) return false;
  }

  // Keywords (array, any match)
  if (condition.keywords && Array.isArray(condition.keywords)) {
    const hasKeyword = condition.keywords.some(kw =>
      combined.includes(kw.toLowerCase())
    );
    if (!hasKeyword) return false;
  }

  // Regex pattern
  if (condition.pattern) {
    try {
      const regex = new RegExp(condition.pattern, 'i');
      if (!regex.test(combined)) return false;
    } catch {
      // Invalid regex, skip
    }
  }

  return true;
}

/**
 * Check if notification matches a rule
 * @param {Object} notification - Parsed notification
 * @param {Object} rule - Rule object
 * @returns {boolean}
 */
export function matchesRule(notification, rule) {
  // Check app match (if specified)
  if (rule.app && rule.app !== '*') {
    if (notification.app !== rule.app) {
      return false;
    }
  }

  // Check bundle ID match (if specified)
  if (rule.bundleId) {
    if (notification.bundleId !== rule.bundleId) {
      return false;
    }
  }

  // Check condition
  if (rule.condition) {
    return matchesCondition(notification, rule.condition);
  }

  // No condition = match any
  return true;
}

/**
 * Evaluate all rules against a notification
 * @param {Object} notification - Parsed notification
 * @param {Array} rules - Array of rules
 * @returns {Array} Matching rules, sorted by priority (highest first)
 */
export function evaluateRules(notification, rules) {
  const matches = rules.filter(rule => matchesRule(notification, rule));
  return matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Parse a rule condition from string format
 * @param {string} conditionStr - e.g., "title:URGENT" or "body:meeting"
 * @returns {Object} Condition object
 */
export function parseRuleCondition(conditionStr) {
  if (!conditionStr || conditionStr === '*') {
    return { any: true };
  }

  const [field, ...valueParts] = conditionStr.split(':');
  const value = valueParts.join(':');

  switch (field.toLowerCase()) {
    case 'title':
      return { titleContains: value };
    case 'body':
      return { bodyContains: value };
    case 'sender':
      return { senderContains: value };
    case 'any':
      return { anyContains: value };
    case 'keyword':
      return { keywords: value.split(',').map(k => k.trim()) };
    case 'regex':
      return { pattern: value };
    default:
      return { anyContains: conditionStr };
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- tests/notification-rules.test.js`
Expected: PASS (all 5 tests)

### Step 5: Commit

```bash
git add lib/notification-rules.js tests/notification-rules.test.js
git commit -m "feat(notifications): add trigger rules engine"
```

---

## Task 5: App-Specific Handlers

**Files:**
- Create: `lib/notification-handlers.js`

### Step 1: Create handlers module

```javascript
// lib/notification-handlers.js
// Handlers for different notification types and actions

import { spawn } from 'child_process';
import { join } from 'path';
import { enqueue, PRIORITY } from './queue.js';
import { createSession } from './sessions.js';

const WORKSPACE = process.cwd();

/**
 * Handle a notification based on the matched rule action
 * @param {Object} notification - Parsed notification
 * @param {Object} rule - Matched rule with action
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
      return; // Do nothing
    default:
      console.log(`[Handler] Unknown action: ${action}`);
  }
}

/**
 * Invoke the Brokkr agent with notification context
 * @param {Object} notification - Parsed notification
 * @param {Object} rule - Matched rule
 */
async function invokeAgent(notification, rule) {
  const { app, content } = notification;

  // Build task description
  let task = `[Notification from ${app}] `;
  if (content.title) task += `${content.title}`;
  if (content.body) task += `: ${content.body}`;

  // Add rule context if specified
  if (rule.taskPrefix) {
    task = `${rule.taskPrefix} ${task}`;
  }

  console.log(`[Handler] Invoking agent: ${task.slice(0, 80)}...`);

  // Create session
  const session = createSession({
    type: 'notification',
    task,
    chatId: `notification-${notification.id}`
  });

  // Enqueue with appropriate priority
  const priority = rule.priority >= 90 ? PRIORITY.HIGH : PRIORITY.NORMAL;

  enqueue({
    task,
    chatId: `notification-${notification.id}`,
    source: 'notification',
    sessionCode: session.code,
    priority,
    metadata: {
      app: notification.app,
      notificationId: notification.id,
      ruleName: rule.name
    }
  });

  console.log(`[Handler] Queued job with session /${session.code}`);
}

/**
 * Log notification to console/file
 * @param {Object} notification - Parsed notification
 * @param {Object} rule - Matched rule
 */
function logNotification(notification, rule) {
  const { app, content, delivered } = notification;
  const time = new Date(delivered * 1000).toISOString();

  console.log(`[LOG] [${time}] [${app}] ${content.title || '(no title)'}`);
  if (content.body) {
    console.log(`       ${content.body.slice(0, 100)}`);
  }
}

/**
 * Send notification to external webhook
 * @param {Object} notification - Parsed notification
 * @param {Object} rule - Matched rule with webhookUrl
 */
async function sendWebhook(notification, rule) {
  if (!rule.webhookUrl) {
    console.error('[Handler] Webhook action requires webhookUrl in rule');
    return;
  }

  const payload = {
    event: 'notification',
    app: notification.app,
    bundleId: notification.bundleId,
    content: notification.content,
    delivered: notification.delivered,
    rule: rule.name
  };

  try {
    const response = await fetch(rule.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[Handler] Webhook failed: ${response.status}`);
    }
  } catch (err) {
    console.error(`[Handler] Webhook error: ${err.message}`);
  }
}

/**
 * Get handler for specific app
 * @param {string} app - App identifier
 * @returns {Object} App-specific handler functions
 */
export function getAppHandler(app) {
  const handlers = {
    imessage: {
      formatTask: (notification) => {
        const { content } = notification;
        return `Received iMessage: ${content.title}: ${content.body}`;
      },
      priority: PRIORITY.CRITICAL
    },
    mail: {
      formatTask: (notification) => {
        const { content } = notification;
        return `New email: ${content.title}`;
      },
      priority: PRIORITY.HIGH
    },
    calendar: {
      formatTask: (notification) => {
        const { content } = notification;
        return `Calendar reminder: ${content.title}`;
      },
      priority: PRIORITY.NORMAL
    }
  };

  return handlers[app] || {
    formatTask: (n) => `Notification from ${n.app}: ${n.content.title}`,
    priority: PRIORITY.LOW
  };
}
```

### Step 2: Verify syntax

Run: `node --check lib/notification-handlers.js`
Expected: No output (syntax valid)

### Step 3: Commit

```bash
git add lib/notification-handlers.js
git commit -m "feat(notifications): add app-specific handlers"
```

---

## Task 6: PM2 Configuration Update

**Files:**
- Modify: `ecosystem.config.cjs`

### Step 1: Update PM2 config to include notification monitor

Read the existing ecosystem.config.cjs and add the notification-monitor process:

```javascript
// Add to apps array in ecosystem.config.cjs:
{
  name: 'notification-monitor',
  script: 'notification-monitor.js',
  cwd: '/Users/brokkrbot/brokkr-agent',
  instances: 1,
  autorestart: true,
  watch: false,
  max_memory_restart: '100M',
  error_file: '/tmp/notification-monitor.log',
  out_file: '/tmp/notification-monitor.log',
  merge_logs: true,
  env: {
    NODE_ENV: 'production'
  }
}
```

### Step 2: Commit

```bash
git add ecosystem.config.cjs
git commit -m "feat(pm2): add notification monitor to ecosystem config"
```

---

## Task 7: Bot Control Script Update

**Files:**
- Modify: `scripts/bot-control.sh`

### Step 1: Update bot-control.sh

Add to the `stop_all_processes` function:
```bash
# Kill notification monitor
pkill -f "notification-monitor" 2>/dev/null && echo "Killed notification monitor process"
rm -f "$WORKSPACE/notification-monitor.lock" 2>/dev/null
```

Add to the `status` command:
```bash
# Check notification monitor
if pgrep -f "notification-monitor" > /dev/null; then
    echo "Notification monitor: RUNNING"
else
    echo "Notification monitor: STOPPED"
fi
```

Add to the `logs` and `tail` commands:
```bash
/tmp/notification-monitor.log
```

### Step 2: Commit

```bash
git add scripts/bot-control.sh
git commit -m "feat(bot-control): add notification monitor management"
```

---

## Task 8: Skill Documentation

**Files:**
- Create: `skills/notifications/skill.md`

### Step 1: Create skill documentation

```bash
mkdir -p skills/notifications
```

```markdown
# Notification Monitoring Skill

## Overview

Monitor macOS Notification Center for notifications from integrated apps (Messages, Mail, Calendar) and invoke the Brokkr agent when trigger conditions are met.

## Architecture

```
Notification Center Database
    │
    │ SQLite polling (every 5s)
    ▼
notification-monitor.js
    │
    ├─► lib/notification-db.js (read database)
    ├─► lib/notification-parser.js (parse binary plist)
    ├─► lib/notification-rules.js (evaluate triggers)
    └─► lib/notification-handlers.js (execute actions)
```

## Database Location

**Sonoma (14.x):**
```bash
$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db
```

**Sequoia (15.x+):**
```bash
~/Library/Group Containers/group.com.apple.usernoted/db2/db
```
Note: Sequoia requires TCC authorization.

## Configuration

**Config file:** `skills/notifications/config.json`

### Rule Format

```json
{
  "rules": [
    {
      "name": "rule-name",
      "description": "What this rule does",
      "app": "imessage",
      "condition": {
        "titleContains": "string",
        "bodyContains": "string",
        "senderContains": "string",
        "anyContains": "string",
        "keywords": ["word1", "word2"],
        "pattern": "regex",
        "any": true
      },
      "action": "invoke|log|webhook|ignore",
      "priority": 100,
      "taskPrefix": "Optional task prefix"
    }
  ]
}
```

### Available Apps

| App ID | Bundle ID | Description |
|--------|-----------|-------------|
| `imessage` | com.apple.MobileSMS | iMessage/SMS |
| `mail` | com.apple.mail | Apple Mail |
| `calendar` | com.apple.iCal | Calendar |
| `facetime` | com.apple.FaceTime | FaceTime |
| `reminders` | com.apple.Reminders | Reminders |

### Actions

| Action | Description |
|--------|-------------|
| `invoke` | Queue task for Brokkr agent |
| `log` | Log to console/file |
| `webhook` | POST to external URL |
| `ignore` | Do nothing |

## Running

### Via PM2 (Recommended)

```bash
./scripts/bot-control.sh start  # Starts all services
./scripts/bot-control.sh status # Check status
```

### Manual

```bash
# Live mode
node notification-monitor.js

# Dry-run mode (no actions)
node notification-monitor.js --dry-run

# Verbose output
node notification-monitor.js --verbose --debug
```

## State Management

**State file:** `.notification-state.json`

Tracks:
- Last processed timestamp
- Recently processed notification IDs

Persisted every 60 seconds and on shutdown.

## Limitations

1. **Polling delay**: 5-second interval (not real-time)
2. **Read-only**: Cannot dismiss or interact with notifications
3. **Binary format**: Content requires plist decoding
4. **Sequoia**: Will require TCC consent on macOS 15+

## Troubleshooting

### Database not accessible

1. Check path: `getconf DARWIN_USER_DIR`
2. Verify file exists: `ls -la <path>/com.apple.notificationcenter/db2/db`
3. Check permissions: `sqlite3 <path>/com.apple.notificationcenter/db2/db ".tables"`

### No notifications detected

1. Run with `--verbose` to see all notifications
2. Check app identifiers match your rules
3. Verify Messages/Mail apps are sending notifications

### Monitor keeps restarting

1. Check logs: `tail -f /tmp/notification-monitor.log`
2. Remove stale lock: `rm notification-monitor.lock`
3. Check database connectivity
```

### Step 2: Commit

```bash
git add skills/notifications/skill.md
git commit -m "docs(notifications): add skill documentation"
```

---

## Task 9: Configuration File

**Files:**
- Create: `skills/notifications/config.json`

### Step 1: Create config file

```json
{
  "polling_interval_ms": 5000,
  "max_notifications_per_poll": 50,
  "rules": [
    {
      "name": "tommy-imessage",
      "description": "Messages from Tommy's phone",
      "app": "imessage",
      "condition": {
        "anyContains": "+12069090025"
      },
      "action": "invoke",
      "priority": 100,
      "taskPrefix": "Tommy messaged:"
    },
    {
      "name": "urgent-email",
      "description": "Emails with URGENT in subject",
      "app": "mail",
      "condition": {
        "keywords": ["URGENT", "CRITICAL", "ASAP", "EMERGENCY"]
      },
      "action": "invoke",
      "priority": 90
    },
    {
      "name": "brokkr-email",
      "description": "Emails from brokkr.co",
      "app": "mail",
      "condition": {
        "anyContains": "@brokkr.co"
      },
      "action": "invoke",
      "priority": 85
    },
    {
      "name": "calendar-reminder",
      "description": "All calendar notifications",
      "app": "calendar",
      "condition": {
        "any": true
      },
      "action": "log",
      "priority": 50
    },
    {
      "name": "facetime-call",
      "description": "Incoming FaceTime calls",
      "app": "facetime",
      "condition": {
        "any": true
      },
      "action": "log",
      "priority": 60
    }
  ],
  "ignored_apps": [
    "com.apple.finder",
    "com.apple.systempreferences",
    "com.apple.Safari"
  ]
}
```

### Step 2: Commit

```bash
git add skills/notifications/config.json
git commit -m "feat(notifications): add default configuration"
```

---

## Task 10: Integration Testing

**Files:**
- Create: `scripts/test-notifications.js`

### Step 1: Create test script

```javascript
#!/usr/bin/env node
// scripts/test-notifications.js
// Integration test for notification monitoring

import { checkDatabaseAccess, getRecentNotifications } from '../lib/notification-db.js';
import { parseNotificationRecord, formatNotificationForDisplay } from '../lib/notification-parser.js';
import { loadRules, evaluateRules } from '../lib/notification-rules.js';

console.log('=== Notification Integration Test ===\n');

// Test 1: Database access
console.log('--- Test 1: Database Access ---');
const dbCheck = checkDatabaseAccess();
if (dbCheck.accessible) {
  console.log(`✅ Database accessible: ${dbCheck.path}`);
  console.log(`   Registered apps: ${dbCheck.appCount}`);
} else {
  console.log(`❌ Database not accessible: ${dbCheck.error}`);
  console.log(`   Path: ${dbCheck.path}`);
  process.exit(1);
}

// Test 2: Recent notifications
console.log('\n--- Test 2: Recent Notifications ---');
const fiveMinutesAgo = Date.now() / 1000 - 300;
const notifications = getRecentNotifications(fiveMinutesAgo, 10);
console.log(`Found ${notifications.length} notifications in last 5 minutes`);

if (notifications.length > 0) {
  console.log('\nSample notification:');
  const sample = notifications[0];
  console.log(`  App: ${sample.app} (${sample.bundleId})`);
  console.log(`  Delivered: ${new Date(sample.delivered * 1000).toISOString()}`);
  console.log(`  Presented: ${sample.presented}`);
}

// Test 3: Parse notification
console.log('\n--- Test 3: Parse Notification ---');
if (notifications.length > 0) {
  const parsed = parseNotificationRecord(notifications[0]);
  console.log('Parsed content:');
  console.log(`  Title: ${parsed.content.title || '(empty)'}`);
  console.log(`  Body: ${parsed.content.body?.slice(0, 50) || '(empty)'}`);
  console.log(`  Subtitle: ${parsed.content.subtitle || '(empty)'}`);
} else {
  console.log('(No notifications to parse)');
}

// Test 4: Load rules
console.log('\n--- Test 4: Load Rules ---');
const configPath = process.cwd() + '/skills/notifications/config.json';
const rules = loadRules(configPath);
console.log(`Loaded ${rules.length} rules:`);
rules.forEach(r => {
  console.log(`  - ${r.name}: ${r.action} (priority ${r.priority})`);
});

// Test 5: Evaluate rules
console.log('\n--- Test 5: Evaluate Rules ---');
if (notifications.length > 0) {
  const parsed = parseNotificationRecord(notifications[0]);
  const matches = evaluateRules(parsed, rules);
  if (matches.length > 0) {
    console.log(`Matched rules for sample notification:`);
    matches.forEach(r => console.log(`  - ${r.name}`));
  } else {
    console.log('No rules matched sample notification');
  }
} else {
  console.log('(No notifications to evaluate)');
}

// Test 6: Display formatting
console.log('\n--- Test 6: Display Formatting ---');
if (notifications.length > 0) {
  const parsed = parseNotificationRecord(notifications[0]);
  console.log(formatNotificationForDisplay(parsed));
}

console.log('\n=== All Tests Complete ===');
```

### Step 2: Make executable and test

```bash
chmod +x scripts/test-notifications.js
node scripts/test-notifications.js
```

### Step 3: Commit

```bash
git add scripts/test-notifications.js
git commit -m "test(notifications): add integration test script"
```

---

## Task 11: CLAUDE.md Update

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update CLAUDE.md

Add after the "iMessage Commands" section:

```markdown
## Notification Monitoring

The agent monitors macOS Notification Center for relevant notifications and can invoke tasks automatically.

**Process:** `notification-monitor.js`
**Log File:** `/tmp/notification-monitor.log`
**Config:** `skills/notifications/config.json`

### Monitored Apps

| App | Priority | Default Action |
|-----|----------|----------------|
| iMessage (Tommy) | 100 | Invoke agent |
| Email (URGENT/brokkr.co) | 85-90 | Invoke agent |
| Calendar | 50 | Log only |
| FaceTime | 60 | Log only |

### Rule Actions

- `invoke` - Queue task for agent execution
- `log` - Record to log file
- `webhook` - POST to external URL
- `ignore` - Skip notification

### Customizing Rules

Edit `skills/notifications/config.json` to add/modify trigger rules.

### Troubleshooting

```bash
# Check if monitor is running
./scripts/bot-control.sh status

# View logs
tail -f /tmp/notification-monitor.log

# Run in verbose mode
node notification-monitor.js --verbose --debug
```
```

Update the "Files" section to include:
```markdown
- `notification-monitor.js` - Notification polling process
- `lib/notification-db.js` - SQLite database reader
- `lib/notification-parser.js` - Binary plist parser
- `lib/notification-rules.js` - Trigger rules engine
- `lib/notification-handlers.js` - Action handlers
```

Update "Planned Capabilities" to mark notifications as complete.

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: add notification monitoring to CLAUDE.md"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `lib/notification-db.js`, test | SQLite database reader |
| 2 | `lib/notification-parser.js`, test | Binary plist parser |
| 3 | `notification-monitor.js` | Main monitor process |
| 4 | `lib/notification-rules.js`, test | Trigger rules engine |
| 5 | `lib/notification-handlers.js` | Action handlers |
| 6 | `ecosystem.config.cjs` | PM2 configuration |
| 7 | `scripts/bot-control.sh` | Control script update |
| 8 | `skills/notifications/skill.md` | Skill documentation |
| 9 | `skills/notifications/config.json` | Default configuration |
| 10 | `scripts/test-notifications.js` | Integration test |
| 11 | `CLAUDE.md` | Documentation update |

## Dependencies

Add to package.json:
```bash
npm install better-sqlite3
```

## Post-Implementation

### Logical Processing Rules to Consider

1. **Tommy's messages** → Always invoke agent (top priority)
2. **Urgent emails** → Invoke agent, flag for review
3. **brokkr.co emails** → Invoke agent for business tasks
4. **Calendar reminders** → Log only (user handles manually)
5. **FaceTime calls** → Log only (cannot answer programmatically)
6. **Unknown apps** → Ignore by default

### Future Enhancements

1. **Time-based rules** - Suppress notifications during focus hours
2. **Aggregation** - Group similar notifications before invoking
3. **Learning** - Track which notifications user acts on
4. **Sequoia migration** - Handle TCC prompts gracefully
