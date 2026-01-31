// lib/logger.js
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');
if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

function getLogFile() {
  const date = new Date().toISOString().split('T')[0];
  return join(LOGS_DIR, `${date}.log`);
}

function formatLog(level, component, message, data = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data
  }) + '\n';
}

export function log(level, component, message, data = {}) {
  const line = formatLog(level, component, message, data);
  appendFileSync(getLogFile(), line);

  // Also console.log for visibility
  const prefix = { info: 'i', warn: '!', error: 'X', success: '+' }[level] || '*';
  console.log(`[${prefix}] [${component}] ${message}`);
}

export const info = (component, message, data) => log('info', component, message, data);
export const warn = (component, message, data) => log('warn', component, message, data);
export const error = (component, message, data) => log('error', component, message, data);
export const success = (component, message, data) => log('success', component, message, data);
