// lib/heartbeat.js
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildHeaders } from './hmac.js';
import { getConfig } from './callback.js';
import { getQueueDepth, getActiveJob } from './queue.js';

const HEARTBEAT_FILE = join(process.cwd(), 'heartbeat.json');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

let stats = {
  startedAt: new Date().toISOString(),
  lastHeartbeat: null,
  tasksProcessed: 0,
  tasksFailed: 0,
  uptime: 0
};

let consecutiveFailures = 0;
let isDraining = false;

export function incrementProcessed() { stats.tasksProcessed++; }
export function incrementFailed() { stats.tasksFailed++; }
export function setDraining(value) { isDraining = value; }

function getStatus() {
  if (isDraining) return 'draining';
  if (consecutiveFailures >= 3) return 'degraded';
  return 'healthy';
}

function writeHeartbeat() {
  stats.lastHeartbeat = new Date().toISOString();
  stats.uptime = Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000);
  writeFileSync(HEARTBEAT_FILE, JSON.stringify(stats, null, 2));
}

async function sendHeartbeatToApi() {
  const config = getConfig();

  // Get processing task IDs (BrokkrMVP tasks only)
  const activeJob = getActiveJob();
  const processingTaskIds = [];
  if (activeJob?.brokkrTaskId) {
    processingTaskIds.push(activeJob.brokkrTaskId);
  }

  const payload = {
    queue_depth: getQueueDepth(),
    status: getStatus(),
    processing_task_ids: processingTaskIds,
    version: config.version || '2.0.0',
    capabilities: config.capabilities || []
  };

  const url = `${config.api_url}/api/agent/heartbeat`;
  const headers = buildHeaders(config.agent_id, payload, config.webhook_secret);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.warn(`[Heartbeat] API POST failed (${response.status}), consecutive failures: ${consecutiveFailures}`);
    }
  } catch (err) {
    consecutiveFailures++;
    console.warn(`[Heartbeat] API POST error: ${err.message}, consecutive failures: ${consecutiveFailures}`);
  }
}

async function heartbeatTick() {
  writeHeartbeat();
  await sendHeartbeatToApi();
}

export function startHeartbeat() {
  heartbeatTick(); // Initial heartbeat
  setInterval(heartbeatTick, HEARTBEAT_INTERVAL_MS);
  console.log('[Heartbeat] Started (every 30s, local + API)');
}

export function getStats() { return { ...stats, status: getStatus() }; }
