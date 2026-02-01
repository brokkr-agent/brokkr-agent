#!/usr/bin/env node
/**
 * scripts/test-imessage.js
 * Integration test for iMessage skill components
 *
 * Usage:
 *   node scripts/test-imessage.js         # Run unit tests only
 *   node scripts/test-imessage.js --live  # Include live database/Messages.app tests
 */

import { macTimeToUnix, getDbPath, getRecentMessages } from '../lib/imessage-reader.js';
import {
  formatMessageForAppleScript,
  buildSendScript,
  chunkMessage,
  MAX_MESSAGE_LENGTH,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS
} from '../lib/imessage-sender.js';
import { TOMMY_PHONE, POLLING_INTERVAL_MS, acquireLock, releaseLock, filterNewMessages, processCommand } from '../imessage-bot.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const LIVE_MODE = process.argv.includes('--live');

console.log('=== iMessage Integration Tests ===\n');

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

async function testAsync(name, fn) {
  try {
    await fn();
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
// Test 1: Configuration Constants
// ============================================
console.log('--- Configuration Constants ---');

test('TOMMY_PHONE is correct', () => {
  assertEqual(TOMMY_PHONE, '+12069090025');
});

test('POLLING_INTERVAL_MS is 2000', () => {
  assertEqual(POLLING_INTERVAL_MS, 2000);
});

test('MAX_MESSAGE_LENGTH is 4000', () => {
  assertEqual(MAX_MESSAGE_LENGTH, 4000);
});

test('DEFAULT_RETRY_COUNT is 3', () => {
  assertEqual(DEFAULT_RETRY_COUNT, 3);
});

test('DEFAULT_RETRY_DELAY_MS is 2000', () => {
  assertEqual(DEFAULT_RETRY_DELAY_MS, 2000);
});

// ============================================
// Test 2: Mac Absolute Time Conversion
// ============================================
console.log('\n--- Mac Absolute Time Conversion ---');

test('converts Mac time to Unix time correctly', () => {
  // Mac time 0 = 2001-01-01 00:00:00 UTC = Unix 978307200
  assertEqual(macTimeToUnix(0), 978307200);
});

test('handles nanosecond timestamps (iOS 10+)', () => {
  // 727012800 seconds = 1705320000 Unix
  // 727012800000000000 nanoseconds should give same result
  const macTimeNano = 727012800000000000;
  const expected = 1705320000;
  assertEqual(macTimeToUnix(macTimeNano), expected);
});

// ============================================
// Test 3: Database Path
// ============================================
console.log('\n--- Database Path ---');

test('getDbPath returns correct path', () => {
  const dbPath = getDbPath();
  const expected = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
  assertEqual(dbPath, expected);
});

// ============================================
// Test 4: AppleScript Escaping
// ============================================
console.log('\n--- AppleScript Escaping ---');

test('escapes double quotes', () => {
  const input = 'He said "hello"';
  const expected = 'He said \\"hello\\"';
  assertEqual(formatMessageForAppleScript(input), expected);
});

test('escapes backslashes', () => {
  const input = 'path\\to\\file';
  const expected = 'path\\\\to\\\\file';
  assertEqual(formatMessageForAppleScript(input), expected);
});

test('escapes backslashes before quotes', () => {
  const input = 'test\\"value';
  const expected = 'test\\\\\\"value';
  assertEqual(formatMessageForAppleScript(input), expected);
});

test('handles null/undefined/empty', () => {
  assertEqual(formatMessageForAppleScript(null), '');
  assertEqual(formatMessageForAppleScript(undefined), '');
  assertEqual(formatMessageForAppleScript(''), '');
});

// ============================================
// Test 5: AppleScript Building
// ============================================
console.log('\n--- AppleScript Building ---');

test('buildSendScript generates valid AppleScript', () => {
  const script = buildSendScript('+12069090025', 'Hello');
  assertTrue(script.includes('tell application "Messages"'), 'has tell block');
  assertTrue(script.includes('participant "+12069090025"'), 'has phone number');
  assertTrue(script.includes('send "Hello" to targetBuddy'), 'has send command');
});

test('buildSendScript escapes message content', () => {
  const script = buildSendScript('+12069090025', 'Say "hi"');
  assertTrue(script.includes('send "Say \\"hi\\"" to targetBuddy'), 'escapes quotes');
});

// ============================================
// Test 6: Message Chunking
// ============================================
console.log('\n--- Message Chunking ---');

test('short message returns single chunk', () => {
  const chunks = chunkMessage('Short message');
  assertEqual(chunks.length, 1);
  assertEqual(chunks[0], 'Short message');
});

test('empty message returns empty array', () => {
  assertEqual(chunkMessage('').length, 0);
  assertEqual(chunkMessage(null).length, 0);
});

test('long message is split at word boundaries', () => {
  const longMessage = 'word '.repeat(100);
  const chunks = chunkMessage(longMessage, 50);
  assertTrue(chunks.length > 1, 'should split into multiple chunks');
  for (const chunk of chunks) {
    assertTrue(chunk.length <= 50, `chunk length ${chunk.length} exceeds limit 50`);
  }
});

// ============================================
// Test 7: Message Filtering
// ============================================
console.log('\n--- Message Filtering ---');

test('filters out already processed messages', () => {
  const messages = [
    { id: 1, text: '/status', sender: '+12069090025' },
    { id: 2, text: '/help', sender: '+12069090025' }
  ];
  const processedIds = new Set([1]);
  const filtered = filterNewMessages(messages, processedIds);
  assertEqual(filtered.length, 1);
  assertEqual(filtered[0].id, 2);
});

test('filters out own messages (anti-loop)', () => {
  const messages = [
    { id: 1, text: '/status', sender: 'me' },
    { id: 2, text: '/help', sender: '+12069090025' }
  ];
  const filtered = filterNewMessages(messages, new Set());
  assertEqual(filtered.length, 1);
  assertEqual(filtered[0].id, 2);
});

test('filters out non-command messages', () => {
  const messages = [
    { id: 1, text: 'Hello there', sender: '+12069090025' },
    { id: 2, text: '/status', sender: '+12069090025' }
  ];
  const filtered = filterNewMessages(messages, new Set());
  assertEqual(filtered.length, 1);
  assertEqual(filtered[0].text, '/status');
});

test('filters out bot response patterns', () => {
  const messages = [
    { id: 1, text: '[DRY-RUN] Test message', sender: '+12069090025' },
    { id: 2, text: 'Bot online! Use /help...', sender: '+12069090025' },
    { id: 3, text: '/status', sender: '+12069090025' }
  ];
  const filtered = filterNewMessages(messages, new Set());
  assertEqual(filtered.length, 1);
  assertEqual(filtered[0].text, '/status');
});

// ============================================
// Test 8: Lock File Management
// ============================================
console.log('\n--- Lock File Management ---');

test('acquireLock creates lock file', () => {
  const testLockPath = '/tmp/test-imessage-lock-' + Date.now() + '.lock';
  try {
    const acquired = acquireLock(testLockPath);
    assertTrue(acquired, 'should acquire lock');
    assertTrue(fs.existsSync(testLockPath), 'lock file should exist');
    const lockData = JSON.parse(fs.readFileSync(testLockPath, 'utf-8'));
    assertEqual(lockData.pid, process.pid);
  } finally {
    releaseLock(testLockPath);
  }
});

test('releaseLock removes lock file', () => {
  const testLockPath = '/tmp/test-imessage-release-' + Date.now() + '.lock';
  acquireLock(testLockPath);
  releaseLock(testLockPath);
  assertTrue(!fs.existsSync(testLockPath), 'lock file should be removed');
});

// ============================================
// Test 9: Command Processing
// ============================================
console.log('\n--- Command Processing ---');

await testAsync('processCommand handles /help', async () => {
  let sentMessage = null;
  const result = await processCommand({
    text: '/help',
    phoneNumber: '+12069090025',
    sendMessage: (phone, msg) => { sentMessage = msg; }
  });
  assertEqual(result.type, 'help');
  assertTrue(sentMessage !== null, 'should send message');
  assertTrue(sentMessage.includes('/claude'), 'help should mention /claude');
});

await testAsync('processCommand handles /status', async () => {
  let sentMessage = null;
  const result = await processCommand({
    text: '/status',
    phoneNumber: '+12069090025',
    sendMessage: (phone, msg) => { sentMessage = msg; }
  });
  assertEqual(result.type, 'status');
  assertTrue(sentMessage !== null, 'should send message');
});

await testAsync('processCommand handles unknown command', async () => {
  let sentMessage = null;
  const result = await processCommand({
    text: '/unknowncmd',
    phoneNumber: '+12069090025',
    sendMessage: (phone, msg) => { sentMessage = msg; }
  });
  assertEqual(result.type, 'unknown');
  assertTrue(sentMessage.includes('Unknown command'), 'should mention unknown');
});

// ============================================
// Test 10: Live Tests (optional)
// ============================================
if (LIVE_MODE) {
  console.log('\n--- Live Database Tests ---');

  await testAsync('can access Messages database', async () => {
    const dbPath = getDbPath();
    assertTrue(fs.existsSync(dbPath), `Database not found at ${dbPath}`);
    console.log(`  Database: ${dbPath}`);
  });

  await testAsync('can query recent messages', async () => {
    const messages = getRecentMessages(TOMMY_PHONE, 5);
    assertTrue(Array.isArray(messages), 'should return array');
    console.log(`  Found ${messages.length} messages from Tommy`);
    if (messages.length > 0) {
      console.log(`  Latest: "${messages[0].text?.substring(0, 50)}..."`);
    }
  });
} else {
  console.log('\n--- Live Tests ---');
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
