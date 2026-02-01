#!/usr/bin/env node
// skills/brokkr-mvp/validation/test-callback.js

import { buildCallbackPayload, sendCallback, getConfig } from '../../../lib/callback.js';

console.log('=== Callback Validation Test ===\n');

// Load and display config
const config = getConfig();
console.log('Config loaded:');
console.log(`  API URL: ${config.api_url}`);
console.log(`  Agent ID: ${config.agent_id.slice(0, 8)}...`);

// Test 1: Build callback payload
console.log('\n--- Test 1: Build Callback Payload ---');
try {
  const payload = buildCallbackPayload({
    status: 'completed',
    outputData: { test: 'data' },
    messages: [{ role: 'agent', content: 'Test message' }],
    sessionCode: 'tst',
    usage: {
      model_id: 'claude-sonnet-4-20250514',
      input_tokens: 100,
      output_tokens: 50,
      duration_ms: 1000
    }
  });

  if (payload.status === 'completed' && payload.output_data && payload.usage.total_tokens === 150) {
    console.log('✓ Payload built correctly');
    console.log('  Payload:', JSON.stringify(payload, null, 2).split('\n').map(l => '  ' + l).join('\n'));
  } else {
    console.error('✗ Payload structure incorrect');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Failed to build payload:', err.message);
  process.exit(1);
}

// Test 2: Send test callback (dry run - will likely fail without real task)
console.log('\n--- Test 2: Send Callback (Connection Test) ---');
console.log('Note: This will attempt to send to BrokkrMVP API.');
console.log('Expected: Connection success (may get 404 for fake task ID)');

const testTaskId = 'test-validation-' + Date.now();
const testPayload = buildCallbackPayload({
  status: 'processing',
  messages: [{ role: 'agent', content: 'Validation test' }],
  sessionCode: 'val'
});

try {
  const result = await sendCallback(testTaskId, testPayload);
  if (result.success) {
    console.log('✓ Callback sent successfully (unexpected for fake task)');
  } else {
    // Expected to fail with 404 for fake task ID
    if (result.error.includes('404') || result.error.includes('not found')) {
      console.log('✓ Connection successful (404 for fake task ID as expected)');
    } else {
      console.log(`⚠ Callback failed: ${result.error}`);
      console.log('  This may indicate network or authentication issues.');
    }
  }
} catch (err) {
  console.error('✗ Callback threw error:', err.message);
  console.log('  Check network connectivity and config.api_url');
}

console.log('\n=== Callback Validation Complete ===');
