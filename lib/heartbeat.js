// lib/heartbeat.js
import { writeFileSync } from 'fs';
import { join } from 'path';

const HEARTBEAT_FILE = join(process.cwd(), 'heartbeat.json');
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

let stats = {
  startedAt: new Date().toISOString(),
  lastHeartbeat: null,
  tasksProcessed: 0,
  tasksFailed: 0,
  uptime: 0
};

export function incrementProcessed() { stats.tasksProcessed++; }
export function incrementFailed() { stats.tasksFailed++; }

function writeHeartbeat() {
  stats.lastHeartbeat = new Date().toISOString();
  stats.uptime = Math.floor((Date.now() - new Date(stats.startedAt).getTime()) / 1000);
  writeFileSync(HEARTBEAT_FILE, JSON.stringify(stats, null, 2));
}

export function startHeartbeat() {
  writeHeartbeat();
  setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  console.log('[Heartbeat] Started (every 30s)');
}

export function getStats() { return { ...stats }; }
