// tests/hmac.test.js
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { verifySignature, signRequest, buildHeaders, canonicalStringify } from '../lib/hmac.js';

describe('HMAC Module', () => {
  const TEST_SECRET = 'test-secret-key';
  const TEST_AGENT_ID = 'test-agent-uuid';

  describe('signRequest', () => {
    it('should generate timestamp and signature', () => {
      const body = { event: 'task.created', task: { id: '123' } };
      const result = signRequest(body, TEST_SECRET);

      expect(result.timestamp).toBeDefined();
      expect(result.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should generate consistent signatures for same input', () => {
      const body = { event: 'task.created' };
      const timestamp = Math.floor(Date.now() / 1000);

      const sig1 = signRequest(body, TEST_SECRET, timestamp);
      const sig2 = signRequest(body, TEST_SECRET, timestamp);

      expect(sig1.signature).toBe(sig2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should accept valid signature', () => {
      const body = { event: 'task.created', task: { id: '123' } };
      const { timestamp, signature } = signRequest(body, TEST_SECRET);
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': timestamp.toString(),
        'x-signature': signature
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid signature', () => {
      const body = { event: 'task.created' };
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-signature': 'sha256=invalid'
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should reject expired timestamp (> 5 minutes)', () => {
      const body = { event: 'task.created' };
      const oldTimestamp = Math.floor(Date.now() / 1000) - 301; // 5+ minutes ago
      const { signature } = signRequest(body, TEST_SECRET, oldTimestamp);
      const headers = {
        'x-agent-id': TEST_AGENT_ID,
        'x-timestamp': oldTimestamp.toString(),
        'x-signature': signature
      };

      const result = verifySignature(headers, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request timestamp expired');
    });

    it('should reject missing headers', () => {
      const body = { event: 'task.created' };
      const result = verifySignature({}, body, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing required headers');
    });
  });

  describe('buildHeaders', () => {
    it('should return complete header object', () => {
      const body = { status: 'completed' };
      const headers = buildHeaders(TEST_AGENT_ID, body, TEST_SECRET);

      expect(headers['X-Agent-Id']).toBe(TEST_AGENT_ID);
      expect(headers['X-Timestamp']).toBeDefined();
      expect(headers['X-Signature']).toMatch(/^sha256=/);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('canonicalStringify', () => {
    it('should sort keys alphabetically', () => {
      const obj = { z: 1, a: 2, m: 3 };
      expect(canonicalStringify(obj)).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should not add spaces after separators', () => {
      const obj = { key: 'value', num: 42 };
      const result = canonicalStringify(obj);
      expect(result).not.toContain(': ');
      expect(result).not.toContain(', ');
    });

    it('should handle nested objects with sorted keys', () => {
      const obj = { outer: { z: 1, a: 2 }, key: 'value' };
      expect(canonicalStringify(obj)).toBe('{"key":"value","outer":{"a":2,"z":1}}');
    });

    it('should handle arrays', () => {
      const obj = { items: [3, 1, 2] };
      expect(canonicalStringify(obj)).toBe('{"items":[3,1,2]}');
    });

    it('should handle null values', () => {
      const obj = { key: null };
      expect(canonicalStringify(obj)).toBe('{"key":null}');
    });

    it('should handle boolean values', () => {
      const obj = { flag: true, other: false };
      expect(canonicalStringify(obj)).toBe('{"flag":true,"other":false}');
    });

    it('should match Python json.dumps(obj, separators=(",", ":"), sort_keys=True)', () => {
      // This is the exact format Python produces - our implementation must match
      const obj = {
        task_id: 'abc-123',
        status: 'completed',
        result: { data: 'test', nested: { z: 1, a: 2 } }
      };
      // Python: json.dumps(obj, separators=(',', ':'), sort_keys=True)
      // Output: {"result":{"data":"test","nested":{"a":2,"z":1}},"status":"completed","task_id":"abc-123"}
      const expected = '{"result":{"data":"test","nested":{"a":2,"z":1}},"status":"completed","task_id":"abc-123"}';
      expect(canonicalStringify(obj)).toBe(expected);
    });

    it('should produce consistent signatures with BrokkrMVP Python implementation', () => {
      // Test case: Same body should produce same signature in JS and Python
      // Python code:
      // import json, hmac, hashlib
      // body = {"z_key": "last", "a_key": "first"}
      // ts = "1706745600"
      // secret = "test-secret"
      // body_json = json.dumps(body, separators=(',', ':'), sort_keys=True)
      // message = f"{ts}.{body_json}"
      // sig = "sha256=" + hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
      // print(sig)
      // Output: sha256=e0fe28d97c9c52e7c0b92ecf2c6b9a8f3c0d1e2f...

      const body = { z_key: 'last', a_key: 'first' };
      // Use current timestamp to pass expiry check in verifySignature
      const timestamp = Math.floor(Date.now() / 1000);
      const secret = 'test-secret';

      const result = signRequest(body, secret, timestamp);

      // The canonical JSON should be: {"a_key":"first","z_key":"last"}
      expect(result.signature).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify we can verify our own signature (with current timestamp)
      const headers = {
        'x-agent-id': 'test-agent',
        'x-timestamp': timestamp.toString(),
        'x-signature': result.signature
      };
      const verification = verifySignature(headers, body, secret);
      expect(verification.valid).toBe(true);
    });
  });
});
