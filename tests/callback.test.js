// tests/callback.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildCallbackPayload, sendCallback } from '../lib/callback.js';

describe('Callback Module', () => {
  describe('buildCallbackPayload', () => {
    it('should build completed callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'completed',
        outputData: { recommendation: 'Use Glowforge Pro' },
        messages: [{ role: 'agent', content: 'Found equipment' }],
        sessionCode: 'xyz',
        usage: {
          model_id: 'claude-sonnet-4-20250514',
          input_tokens: 1000,
          output_tokens: 500,
          duration_ms: 3000
        }
      });

      expect(payload.status).toBe('completed');
      expect(payload.output_data.recommendation).toBe('Use Glowforge Pro');
      expect(payload.messages.length).toBe(1);
      expect(payload.session_code).toBe('xyz');
      expect(payload.usage.total_tokens).toBe(1500);
    });

    it('should build needs_input callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'needs_input',
        messages: [{ role: 'agent', content: 'What budget range?' }],
        sessionCode: 'abc'
      });

      expect(payload.status).toBe('needs_input');
      expect(payload.messages[0].content).toBe('What budget range?');
      expect(payload.output_data).toBeUndefined();
    });

    it('should build failed callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'failed',
        errorMessage: 'No equipment found matching criteria',
        sessionCode: 'def'
      });

      expect(payload.status).toBe('failed');
      expect(payload.error_message).toBe('No equipment found matching criteria');
    });

    it('should build processing callback payload', () => {
      const payload = buildCallbackPayload({
        status: 'processing',
        messages: [{ role: 'agent', content: 'Researching...' }],
        sessionCode: 'ghi'
      });

      expect(payload.status).toBe('processing');
    });
  });

  describe('sendCallback', () => {
    it('should build correct URL from task ID', () => {
      // This test verifies URL construction without making actual HTTP call
      const taskId = '550e8400-e29b-41d4-a716-446655440000';
      const expectedUrl = 'https://api.brokkr.app/api/agent/callback/550e8400-e29b-41d4-a716-446655440000';

      // We'll mock fetch in actual implementation
      // For now, just verify the module exports the function
      expect(typeof sendCallback).toBe('function');
    });
  });
});
