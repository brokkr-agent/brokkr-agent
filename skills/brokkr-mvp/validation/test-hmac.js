#!/usr/bin/env node
// skills/brokkr-mvp/validation/test-hmac.js

import { signRequest, verifySignature } from '../../../lib/hmac.js';
import { readFileSync } from 'fs';

console.log('=== HMAC Validation Test ===\n');

// Load config
let config;
try {
  config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf-8'));
  console.log('✓ Config loaded successfully');
  console.log(`  Agent ID: ${config.agent_id.slice(0, 8)}...`);
} catch (err) {
  console.error('✗ Failed to load config:', err.message);
  process.exit(1);
}

// Test 1: Sign a request
console.log('\n--- Test 1: Sign Request ---');
const testPayload = { event: 'task.created', task: { id: 'test-123' } };
try {
  const { timestamp, signature } = signRequest(testPayload, config.webhook_secret);
  console.log('✓ Signature generated successfully');
  console.log(`  Timestamp: ${timestamp}`);
  console.log(`  Signature: ${signature.slice(0, 20)}...`);
} catch (err) {
  console.error('✗ Failed to sign request:', err.message);
  process.exit(1);
}

// Test 2: Verify valid signature
console.log('\n--- Test 2: Verify Valid Signature ---');
try {
  const { timestamp, signature } = signRequest(testPayload, config.webhook_secret);
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': timestamp.toString(),
    'x-signature': signature
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (result.valid) {
    console.log('✓ Valid signature verified successfully');
  } else {
    console.error('✗ Verification failed:', result.error);
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Verification threw error:', err.message);
  process.exit(1);
}

// Test 3: Reject invalid signature
console.log('\n--- Test 3: Reject Invalid Signature ---');
try {
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': Math.floor(Date.now() / 1000).toString(),
    'x-signature': 'sha256=invalid'
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (!result.valid && result.error === 'Invalid signature') {
    console.log('✓ Invalid signature rejected correctly');
  } else {
    console.error('✗ Should have rejected invalid signature');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Test threw error:', err.message);
  process.exit(1);
}

// Test 4: Reject expired timestamp
console.log('\n--- Test 4: Reject Expired Timestamp ---');
try {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
  const { signature } = signRequest(testPayload, config.webhook_secret, oldTimestamp);
  const headers = {
    'x-agent-id': config.agent_id,
    'x-timestamp': oldTimestamp.toString(),
    'x-signature': signature
  };
  const result = verifySignature(headers, testPayload, config.webhook_secret);
  if (!result.valid && result.error === 'Request timestamp expired') {
    console.log('✓ Expired timestamp rejected correctly');
  } else {
    console.error('✗ Should have rejected expired timestamp');
    process.exit(1);
  }
} catch (err) {
  console.error('✗ Test threw error:', err.message);
  process.exit(1);
}

console.log('\n=== All HMAC Tests Passed ===');
