/**
 * iCloud Storage Module
 *
 * Provides standardized iCloud storage paths for all skills.
 * Wraps the shared lib/icloud-storage.js helper.
 *
 * PLACEHOLDER: Full implementation in docs/concepts/2026-02-01-apple-integration-architecture.md
 *
 * Key functions to implement:
 * - ICLOUD_BASE - Base path to Brokkr iCloud directory
 * - getDateFolder() - Get current date string (YYYY-MM-DD)
 * - ensureDirectory(category) - Create and return dated directory path
 * - getPath(category, filename) - Get full path for file in category
 *
 * Categories:
 * - recordings: Screen recordings, audio files
 * - exports: Generated reports, documents
 * - attachments: Downloaded files, email attachments
 * - research: Agent research outputs
 */

import path from 'path';
import fs from 'fs';

// Base iCloud path for Brokkr
export const ICLOUD_BASE = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Brokkr'
);

// Category mappings
const CATEGORIES = {
  recordings: 'Recordings',
  exports: 'Exports',
  attachments: 'Attachments',
  research: 'Research'
};

/**
 * Get current date folder string
 * @returns {string} Date in YYYY-MM-DD format
 */
export function getDateFolder() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Ensure directory exists and return path
 * @param {string} category - Category name (recordings, exports, attachments, research)
 * @returns {string} Full path to dated directory
 */
export function ensureDirectory(category) {
  const categoryFolder = CATEGORIES[category];
  if (!categoryFolder) {
    throw new Error(`Unknown category: ${category}. Valid: ${Object.keys(CATEGORIES).join(', ')}`);
  }

  const dir = path.join(ICLOUD_BASE, categoryFolder, getDateFolder());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get full path for a file in a category
 * @param {string} category - Category name
 * @param {string} filename - File name
 * @returns {string} Full path to file
 */
export function getPath(category, filename) {
  const dir = ensureDirectory(category);
  return path.join(dir, filename);
}

/**
 * List files in a category for today
 * @param {string} category - Category name
 * @returns {string[]} List of file paths
 */
export function listToday(category) {
  const dir = path.join(ICLOUD_BASE, CATEGORIES[category], getDateFolder());
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).map(f => path.join(dir, f));
}

/**
 * Check if iCloud is available
 * @returns {boolean} True if iCloud base path exists
 */
export function isAvailable() {
  return fs.existsSync(ICLOUD_BASE);
}
