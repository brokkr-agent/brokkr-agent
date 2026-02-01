import path from 'path';
import fs from 'fs';

export const ICLOUD_BASE = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Brokkr'
);

const CATEGORIES = {
  recordings: 'Recordings',
  exports: 'Exports',
  attachments: 'Attachments',
  research: 'Research'
};

function getDateFolder() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

export function ensureDirectory(category) {
  const dir = path.join(ICLOUD_BASE, CATEGORIES[category], getDateFolder());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPath(category, filename) {
  const dir = ensureDirectory(category);
  return path.join(dir, filename);
}
