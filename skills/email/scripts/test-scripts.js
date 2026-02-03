#!/usr/bin/env node
// skills/email/scripts/test-scripts.js
// Test runner for email AppleScript files

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, scriptName);
  const cmd = `osascript "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`;

  console.log(`\n--- Running: ${scriptName} ${args.join(' ')} ---`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    console.log('Output:', output.trim());

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(output.trim());
      console.log('Parsed:', JSON.stringify(parsed, null, 2).slice(0, 500));
      return { success: true, data: parsed };
    } catch {
      return { success: true, data: output.trim() };
    }
  } catch (err) {
    console.error('Error:', err.message);
    return { success: false, error: err.message };
  }
}

// Test list-inbox
console.log('=== Email Script Tests ===');

const listResult = runScript('list-inbox.scpt', ['5']);
if (listResult.success && Array.isArray(listResult.data)) {
  console.log(`\n[PASS] list-inbox.scpt returned ${listResult.data.length} messages`);
} else {
  console.log('\n[FAIL] list-inbox.scpt did not return valid JSON array');
}

// Test read-message (use first message ID from list-inbox if available)
if (listResult.success && Array.isArray(listResult.data) && listResult.data.length > 0) {
  const firstMsgId = listResult.data[0].id;
  const readResult = runScript('read-message.scpt', [firstMsgId.toString()]);

  if (readResult.success && readResult.data.content !== undefined) {
    console.log(`\n[PASS] read-message.scpt returned message content (${readResult.data.content.length} chars)`);
  } else if (readResult.data?.error) {
    console.log(`\n[FAIL] read-message.scpt error: ${readResult.data.error}`);
  } else {
    console.log('\n[FAIL] read-message.scpt did not return expected format');
  }
} else {
  console.log('\n[SKIP] read-message.scpt - no messages to test with');
}

// Test compose (draft mode only - don't actually send)
const composeResult = runScript('compose.scpt', [
  'test@example.com',
  'Test Subject from Brokkr',
  'This is a test email body.',
  'false' // Don't send, just create draft
]);

if (composeResult.success && composeResult.data.status === 'draft') {
  console.log('\n[PASS] compose.scpt created draft successfully');
} else if (composeResult.data?.error) {
  console.log(`\n[FAIL] compose.scpt error: ${composeResult.data.error}`);
} else {
  console.log('\n[FAIL] compose.scpt did not return expected format');
}

// Test reply (draft mode only)
if (listResult.success && Array.isArray(listResult.data) && listResult.data.length > 0) {
  const firstMsgId = listResult.data[0].id;
  const replyResult = runScript('reply.scpt', [
    firstMsgId.toString(),
    'Thanks for your email. This is a test reply.',
    'false', // not reply all
    'false'  // don't send
  ]);

  if (replyResult.success && replyResult.data.status === 'draft') {
    console.log('\n[PASS] reply.scpt created reply draft successfully');
  } else if (replyResult.data?.error) {
    console.log(`\n[FAIL] reply.scpt error: ${replyResult.data.error}`);
  } else {
    console.log('\n[FAIL] reply.scpt did not return expected format');
  }
} else {
  console.log('\n[SKIP] reply.scpt - no messages to test with');
}
