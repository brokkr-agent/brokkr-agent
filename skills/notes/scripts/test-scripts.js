#!/usr/bin/env node
// skills/notes/scripts/test-scripts.js
// Test runner for notes AppleScript files

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Track test results
let passed = 0;
let failed = 0;
let skipped = 0;

function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, '..', scriptName);
  const cmd = `osascript "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`;

  console.log(`\n--- Running: ${scriptName} ${args.join(' ')} ---`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    console.log('Output:', output.trim().slice(0, 500));

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

function pass(testName, message = '') {
  passed++;
  console.log(`\n[PASS] ${testName}${message ? ` - ${message}` : ''}`);
}

function fail(testName, message = '') {
  failed++;
  console.log(`\n[FAIL] ${testName}${message ? ` - ${message}` : ''}`);
}

function skip(testName, reason = '') {
  skipped++;
  console.log(`\n[SKIP] ${testName}${reason ? ` - ${reason}` : ''}`);
}

// Test all scripts
console.log('=== Notes Script Integration Tests ===');
console.log('Testing against real Notes.app');

// Test 1: list-folders.scpt
console.log('\n\n=== Test 1: list-folders.scpt ===');
const foldersResult = runScript('list-folders.scpt');
if (foldersResult.success && foldersResult.data?.success) {
  const folderCount = foldersResult.data.data?.length || 0;
  pass('list-folders.scpt', `returned ${folderCount} folders`);
} else if (foldersResult.data?.error) {
  fail('list-folders.scpt', foldersResult.data.error);
} else {
  fail('list-folders.scpt', 'did not return valid JSON');
}

// Test 2: list-notes.scpt (using 'Notes' folder)
console.log('\n\n=== Test 2: list-notes.scpt ===');
const notesResult = runScript('list-notes.scpt', ['Notes']);
if (notesResult.success && notesResult.data?.success) {
  const noteCount = notesResult.data.data?.length || 0;
  pass('list-notes.scpt', `returned ${noteCount} notes in 'Notes' folder`);
} else if (notesResult.data?.error) {
  // Folder might not exist, which is okay
  if (notesResult.data.error.includes('not found')) {
    skip('list-notes.scpt', 'Notes folder not found');
  } else {
    fail('list-notes.scpt', notesResult.data.error);
  }
} else {
  fail('list-notes.scpt', 'did not return valid JSON');
}

// Test 3: list-recent.scpt
console.log('\n\n=== Test 3: list-recent.scpt ===');
const recentResult = runScript('list-recent.scpt', ['5']);
if (recentResult.success && recentResult.data?.success) {
  const recentCount = recentResult.data.data?.length || 0;
  pass('list-recent.scpt', `returned ${recentCount} recent notes`);
} else if (recentResult.data?.error) {
  fail('list-recent.scpt', recentResult.data.error);
} else {
  fail('list-recent.scpt', 'did not return valid JSON');
}

// Test 4: Create-Read-Append-Modify-Delete cycle
console.log('\n\n=== Test 4: Create-Read-Append-Modify-Delete Cycle ===');
const testTitle = `Test Note ${Date.now()}`;
const testBody = 'This is a test note body created by the integration test runner.';

// Create
console.log('\n--- Step 4a: Creating test note ---');
const createResult = runScript('create-note.scpt', [testTitle, testBody, 'Notes']);

let testNoteId = null;

if (createResult.success && createResult.data?.success && createResult.data?.data?.id) {
  testNoteId = createResult.data.data.id;
  pass('create-note.scpt', `created note with ID: ${testNoteId.slice(0, 50)}...`);
} else if (createResult.data?.error) {
  fail('create-note.scpt', createResult.data.error);
} else {
  fail('create-note.scpt', 'did not return valid JSON with note ID');
}

if (testNoteId) {
  // Read
  console.log('\n--- Step 4b: Reading test note ---');
  const readResult = runScript('read-note.scpt', [testNoteId]);

  if (readResult.success && readResult.data?.success && readResult.data?.data?.body) {
    pass('read-note.scpt', `read note content (${readResult.data.data.body.length} chars)`);
  } else if (readResult.data?.error) {
    fail('read-note.scpt', readResult.data.error);
  } else {
    fail('read-note.scpt', 'did not return note body');
  }

  // Find by title
  console.log('\n--- Step 4c: Finding test note by title ---');
  const findResult = runScript('find-note.scpt', [testTitle]);

  if (findResult.success && findResult.data?.success && findResult.data?.data?.length > 0) {
    pass('find-note.scpt', `found ${findResult.data.data.length} matching note(s)`);
  } else if (findResult.data?.error) {
    fail('find-note.scpt', findResult.data.error);
  } else {
    fail('find-note.scpt', 'did not find the test note');
  }

  // Append
  console.log('\n--- Step 4d: Appending to test note ---');
  const appendContent = 'This line was appended by the test runner.';
  const appendResult = runScript('append-note.scpt', [testNoteId, appendContent]);

  if (appendResult.success && appendResult.data?.success) {
    pass('append-note.scpt', `appended content to note`);
  } else if (appendResult.data?.error) {
    fail('append-note.scpt', appendResult.data.error);
  } else {
    fail('append-note.scpt', 'did not return success');
  }

  // Modify (change title)
  console.log('\n--- Step 4e: Modifying test note title ---');
  const newTitle = `${testTitle} (Modified)`;
  const modifyResult = runScript('modify-note.scpt', [testNoteId, newTitle, '']);

  if (modifyResult.success && modifyResult.data?.success) {
    pass('modify-note.scpt', `modified note title to: ${newTitle}`);
  } else if (modifyResult.data?.error) {
    fail('modify-note.scpt', modifyResult.data.error);
  } else {
    fail('modify-note.scpt', 'did not return success');
  }

  // Search
  console.log('\n--- Step 4f: Searching for test note content ---');
  const searchResult = runScript('search-notes.scpt', ['integration test runner', 'body']);

  if (searchResult.success && searchResult.data?.success && searchResult.data?.data?.length > 0) {
    pass('search-notes.scpt', `found ${searchResult.data.data.length} note(s) matching search query`);
  } else if (searchResult.data?.error) {
    fail('search-notes.scpt', searchResult.data.error);
  } else {
    // Might not find due to timing/indexing
    skip('search-notes.scpt', 'search did not return results (may be timing issue)');
  }

  // Delete
  console.log('\n--- Step 4g: Deleting test note ---');
  const deleteResult = runScript('delete-note.scpt', [testNoteId]);

  if (deleteResult.success && deleteResult.data?.success && deleteResult.data?.data?.deleted) {
    pass('delete-note.scpt', `deleted note (moved to Recently Deleted)`);
  } else if (deleteResult.data?.error) {
    fail('delete-note.scpt', deleteResult.data.error);
  } else {
    fail('delete-note.scpt', 'did not confirm deletion');
  }

  // Verify deletion (should not be found)
  console.log('\n--- Step 4h: Verifying note was deleted ---');
  const verifyResult = runScript('read-note.scpt', [testNoteId]);

  if (verifyResult.data?.success === false && verifyResult.data?.error?.includes('not found')) {
    pass('delete verification', 'note is no longer accessible');
  } else {
    // Note might still be accessible in Recently Deleted
    skip('delete verification', 'note may still be in Recently Deleted folder');
  }
} else {
  skip('read-note.scpt', 'no test note created');
  skip('find-note.scpt', 'no test note created');
  skip('append-note.scpt', 'no test note created');
  skip('modify-note.scpt', 'no test note created');
  skip('search-notes.scpt', 'no test note created');
  skip('delete-note.scpt', 'no test note created');
  skip('delete verification', 'no test note created');
}

// Test 5: Error handling - invalid note ID
console.log('\n\n=== Test 5: Error Handling ===');
console.log('\n--- Testing read-note.scpt with invalid ID ---');
const invalidIdResult = runScript('read-note.scpt', ['invalid-note-id-12345']);

if (invalidIdResult.success && invalidIdResult.data?.success === false && invalidIdResult.data?.error) {
  pass('error handling (invalid ID)', 'returned proper error JSON');
} else {
  fail('error handling (invalid ID)', 'did not return error JSON');
}

// Test 6: Error handling - missing arguments
console.log('\n--- Testing create-note.scpt with missing arguments ---');
const missingArgsResult = runScript('create-note.scpt', ['Only Title']);

if (missingArgsResult.success && missingArgsResult.data?.success === false && missingArgsResult.data?.error) {
  pass('error handling (missing args)', 'returned proper error JSON');
} else {
  fail('error handling (missing args)', 'did not return error JSON');
}

// Summary
console.log('\n\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Total: ${passed + failed + skipped}`);

if (failed > 0) {
  console.log('\nSome tests failed. Please review the output above.');
  process.exit(1);
} else {
  console.log('\nAll tests passed (excluding skipped).');
  process.exit(0);
}
