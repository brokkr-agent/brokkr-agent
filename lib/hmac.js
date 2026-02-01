// lib/hmac.js
import crypto from 'crypto';

/**
 * Convert object to canonical JSON string.
 * - Keys sorted alphabetically (recursively)
 * - No spaces after separators
 * - Matches Python: json.dumps(obj, separators=(',', ':'), sort_keys=True)
 *
 * @param {any} obj - Value to stringify
 * @returns {string} Canonical JSON string
 */
function canonicalStringify(obj) {
  if (obj === null) {
    return 'null';
  }
  if (typeof obj === 'undefined') {
    return undefined;
  }
  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return JSON.stringify(obj);
  }
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalStringify(item));
    return '[' + items.join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys
      .map(key => {
        const value = canonicalStringify(obj[key]);
        if (value === undefined) return undefined;
        return JSON.stringify(key) + ':' + value;
      })
      .filter(pair => pair !== undefined);
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Sign a request body with HMAC-SHA256
 * Uses canonical JSON (sorted keys, no spaces) for consistent signatures.
 *
 * @param {Object} body - Request body to sign
 * @param {string} secret - Shared secret
 * @param {number} [timestamp] - Unix timestamp (defaults to now)
 * @returns {{ timestamp: number, signature: string }}
 */
export function signRequest(body, secret, timestamp = null) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  // Use canonical JSON to match BrokkrMVP's Python implementation
  const bodyJson = canonicalStringify(body);
  const message = ts + '.' + bodyJson;
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

// Export for testing
export { canonicalStringify };
