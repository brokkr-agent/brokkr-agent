import fs from 'fs';

const CONTEXT_FILE = '/tmp/brokkr-notification-context.json';

export function setNotificationContext(data) {
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2));
}

export function getNotificationContext() {
  try {
    return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function clearNotificationContext() {
  try {
    fs.unlinkSync(CONTEXT_FILE);
  } catch {}
}
