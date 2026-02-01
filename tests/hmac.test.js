// tests/hmac.test.js
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { verifySignature, signRequest, buildHeaders } from '../lib/hmac.js';

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
});
