#!/usr/bin/env node
/**
 * scripts/test-notifications.js
 * Integration test for notification monitor components
 *
 * Usage:
 *   node scripts/test-notifications.js         # Run all tests
 *   node scripts/test-notifications.js --live  # Include live database tests
 */

import { getRecentNotifications, checkDatabaseAccess, getAppIdentifier } from '../lib/notification-db.js';
import { parseNotificationData, extractNotificationContent } from '../lib/notification-parser.js';
import { loadRules, evaluateRules, matchesRule } from '../lib/notification-rules.js';

const LIVE_MODE = process.argv.includes('--live');

console.log('=== Notification System Integration Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}: expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) {
    throw new Error(`${msg}: expected truthy, got "${value}"`);
  }
}

// ============================================
// Test 1: App Identifier Mapping
// ============================================
console.log('--- App Identifier Mapping ---');

test('maps com.apple.MobileSMS to imessage', () => {
  assertEqual(getAppIdentifier('com.apple.MobileSMS'), 'imessage');
});

test('maps com.apple.mobilesms (lowercase) to imessage', () => {
  assertEqual(getAppIdentifier('com.apple.mobilesms'), 'imessage');
});

test('maps com.apple.mail to mail', () => {
  assertEqual(getAppIdentifier('com.apple.mail'), 'mail');
});

test('maps com.apple.iCal to calendar', () => {
  assertEqual(getAppIdentifier('com.apple.iCal'), 'calendar');
});

test('returns unknown bundle IDs unchanged', () => {
  assertEqual(getAppIdentifier('com.example.unknown'), 'com.example.unknown');
});

// ============================================
// Test 2: Rule Loading
// ============================================
console.log('\n--- Rule Loading ---');

const CONFIG_PATH = '.claude/skills/notifications/config.json';

test('loads rules from config file', () => {
  const rules = loadRules(CONFIG_PATH);
  assertTrue(Array.isArray(rules), 'rules should be an array');
  assertTrue(rules.length > 0, 'should have at least one rule');
});

test('returns empty array for missing file', () => {
  const rules = loadRules('/nonexistent/path.json');
  assertTrue(Array.isArray(rules), 'should return array');
  assertEqual(rules.length, 0, 'length');
});

// ============================================
// Test 3: Rule Matching
// ============================================
console.log('\n--- Rule Matching ---');

test('matches rule with pattern condition', () => {
  const notification = {
    app: 'imessage',
    content: { title: 'tommyjohnson90@gmail.com', body: 'Hello' }
  };
  const rule = {
    app: 'imessage',
    condition: { pattern: 'tommyjohnson90@gmail\\.com' }
  };
  assertTrue(matchesRule(notification, rule), 'should match');
});

test('matches rule with anyContains condition', () => {
  const notification = {
    app: 'mail',
    content: { title: 'Test', body: 'From user@brokkr.co' }
  };
  const rule = {
    app: 'mail',
    condition: { anyContains: '@brokkr.co' }
  };
  assertTrue(matchesRule(notification, rule), 'should match');
});

test('matches rule with keywords condition', () => {
  const notification = {
    app: 'mail',
    content: { title: 'URGENT: Server Down', body: 'Please check' }
  };
  const rule = {
    app: 'mail',
    condition: { keywords: ['URGENT', 'CRITICAL'] }
  };
  assertTrue(matchesRule(notification, rule), 'should match');
});

test('does not match wrong app', () => {
  const notification = {
    app: 'calendar',
    content: { title: 'Meeting', body: 'Test' }
  };
  const rule = {
    app: 'imessage',
    condition: { any: true }
  };
  assertTrue(!matchesRule(notification, rule), 'should not match');
});

// ============================================
// Test 4: Rule Evaluation (Priority)
// ============================================
console.log('\n--- Rule Evaluation ---');

test('returns rules sorted by priority', () => {
  const notification = {
    app: 'imessage',
    content: { title: 'test', body: 'test' }
  };
  const rules = [
    { name: 'low', app: 'imessage', condition: { any: true }, priority: 10 },
    { name: 'high', app: 'imessage', condition: { any: true }, priority: 100 },
    { name: 'medium', app: 'imessage', condition: { any: true }, priority: 50 }
  ];
  const matched = evaluateRules(notification, rules);
  assertEqual(matched[0].name, 'high', 'first should be highest priority');
  assertEqual(matched[1].name, 'medium', 'second should be medium priority');
  assertEqual(matched[2].name, 'low', 'third should be lowest priority');
});

// ============================================
// Test 5: Live Database Tests (optional)
// ============================================
if (LIVE_MODE) {
  console.log('\n--- Live Database Tests ---');

  test('can access notification database', async () => {
    const result = await checkDatabaseAccess();
    assertTrue(result.accessible, `Database not accessible: ${result.error || 'unknown'}`);
    console.log(`  Database: ${result.path}`);
  });

  test('can query recent notifications', async () => {
    const oneHourAgo = Date.now() / 1000 - 3600;
    const notifications = await getRecentNotifications(oneHourAgo, 5);
    assertTrue(Array.isArray(notifications), 'should return array');
    console.log(`  Found ${notifications.length} notifications in last hour`);
  });
} else {
  console.log('\n--- Live Database Tests ---');
  console.log('Skipped (run with --live to include)');
}

// ============================================
// Summary
// ============================================
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
