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
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
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
