// lib/callback.js
import { buildHeaders } from './hmac.js';
import { readFileSync } from 'fs';

// Load config
let config = {
  agent_id: process.env.BROKKR_AGENT_ID || 'dev-agent',
  webhook_secret: process.env.BROKKR_WEBHOOK_SECRET || 'dev-secret',
  api_url: process.env.BROKKR_API_URL || 'https://api.brokkr.app'
};

try {
  const configPath = new URL('../skills/brokkr-mvp/config.json', import.meta.url);
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.log('[Callback] No BrokkrMVP config found, using defaults');
}

/**
 * Build callback payload for BrokkrMVP
 * @param {Object} options - Callback options
 * @returns {Object} Formatted callback payload
 */
export function buildCallbackPayload(options) {
  const {
    status,
    outputData,
    messages = [],
    sessionCode,
    usage = {},
    errorMessage
  } = options;

  const payload = {
    status,
    session_code: sessionCode
  };

  if (messages.length > 0) {
    payload.messages = messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || new Date().toISOString()
    }));
  }

  if (status === 'completed' && outputData) {
    payload.output_data = outputData;
  }

  if (status === 'failed' && errorMessage) {
    payload.error_message = errorMessage;
  }

  if (usage && Object.keys(usage).length > 0) {
    payload.usage = {
      model_id: usage.model_id || 'claude-sonnet-4-20250514',
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      duration_ms: usage.duration_ms || 0,
      api_calls: usage.api_calls || 1
    };
  }

  return payload;
}

/**
 * Send callback to BrokkrMVP
 * @param {string} taskId - BrokkrMVP task UUID
 * @param {Object} payload - Callback payload
 * @param {number} retryCount - Current retry attempt (0-based)
 * @param {string} callbackUrl - Optional explicit callback URL from webhook
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendCallback(taskId, payload, retryCount = 0, callbackUrl = null) {
  const url = callbackUrl || `${config.api_url}/api/agent/callback/${taskId}`;
  console.log(`[Callback] Sending to: ${url}`);
  const headers = buildHeaders(config.agent_id, payload, config.webhook_secret);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return { success: true };
    }

    const errorText = await response.text();
    console.error(`[Callback] Failed (${response.status}): ${errorText}`);

    // Retry with exponential backoff
    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`[Callback] Retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(r => setTimeout(r, delay));
      return sendCallback(taskId, { ...payload, retry_count: retryCount + 1 }, retryCount + 1, callbackUrl);
    }

    return { success: false, error: `Failed after 3 retries: ${response.status}` };
  } catch (err) {
    console.error(`[Callback] Network error: ${err.message}`);

    if (retryCount < 3) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[Callback] Retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
      await new Promise(r => setTimeout(r, delay));
      return sendCallback(taskId, { ...payload, retry_count: retryCount + 1 }, retryCount + 1, callbackUrl);
    }

    return { success: false, error: `Network error after 3 retries: ${err.message}` };
  }
}

/**
 * Get the config (for testing/heartbeat)
 */
export function getConfig() {
  return config;
}
