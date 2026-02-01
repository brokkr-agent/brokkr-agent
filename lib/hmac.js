// lib/hmac.js
import crypto from 'crypto';

/**
 * Sign a request body with HMAC-SHA256
 * @param {Object} body - Request body to sign
 * @param {string} secret - Shared secret
 * @param {number} [timestamp] - Unix timestamp (defaults to now)
 * @returns {{ timestamp: number, signature: string }}
 */
export function signRequest(body, secret, timestamp = null) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const message = ts + '.' + JSON.stringify(body);
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return {
    timestamp: ts,
    signature: 'sha256=' + hmac
  };
}

/**
 * Verify HMAC signature on incoming request
 * @param {Object} headers - Request headers (lowercase keys)
 * @param {Object} body - Request body
 * @param {string} secret - Shared secret
 * @returns {{ valid: boolean, error: string|null }}
 */
export function verifySignature(headers, body, secret) {
  const timestamp = headers['x-timestamp'];
  const signature = headers['x-signature'];
  const agentId = headers['x-agent-id'];

  if (!timestamp || !signature || !agentId) {
    return { valid: false, error: 'Missing required headers' };
  }

  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  // Reject if timestamp is more than 5 minutes old
  if (Math.abs(now - ts) > 300) {
    return { valid: false, error: 'Request timestamp expired' };
  }

  const expected = signRequest(body, secret, ts);
  if (signature !== expected.signature) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, error: null };
}

/**
 * Build complete headers for outgoing request
 * @param {string} agentId - Agent UUID
 * @param {Object} body - Request body
 * @param {string} secret - Shared secret
 * @returns {Object} Headers object
 */
export function buildHeaders(agentId, body, secret) {
  const { timestamp, signature } = signRequest(body, secret);
  return {
    'X-Agent-Id': agentId,
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}
