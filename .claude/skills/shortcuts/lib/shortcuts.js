/**
 * Shortcuts Module
 *
 * Run and manage Apple Shortcuts from the command line.
 *
 * PLACEHOLDER: Full implementation needed
 *
 * Key functions to implement:
 * - listShortcuts() - List all available shortcuts
 * - runShortcut(name, options) - Run a shortcut with optional input
 * - shortcutExists(name) - Check if shortcut exists
 * - getShortcutInfo(name) - Get shortcut metadata
 *
 * CLI Reference:
 * - shortcuts list
 * - shortcuts run "Name"
 * - echo "input" | shortcuts run "Name"
 * - shortcuts run "Name" --input-path /path/to/file
 */

import { execSync, spawn } from 'child_process';

const SHORTCUTS_CLI = '/usr/bin/shortcuts';
const DEFAULT_TIMEOUT = 30000;

/**
 * List all available shortcuts
 * @returns {Promise<{success: boolean, shortcuts?: string[], error?: string}>}
 */
export async function listShortcuts() {
  try {
    const output = execSync(`${SHORTCUTS_CLI} list`, {
      encoding: 'utf-8',
      timeout: DEFAULT_TIMEOUT
    });
    const shortcuts = output.trim().split('\n').filter(s => s.length > 0);
    return { success: true, shortcuts };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a shortcut exists
 * @param {string} name - Shortcut name
 * @returns {Promise<boolean>}
 */
export async function shortcutExists(name) {
  const result = await listShortcuts();
  if (!result.success) return false;
  return result.shortcuts.includes(name);
}

/**
 * Run a shortcut
 * @param {string} name - Shortcut name
 * @param {Object} options - Options
 * @param {string} options.input - Text input to pass to shortcut
 * @param {string} options.inputPath - File path to pass as input
 * @param {number} options.timeout - Timeout in ms
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runShortcut(name, options = {}) {
  const { input, inputPath, timeout = DEFAULT_TIMEOUT } = options;

  try {
    let output;

    if (input) {
      // Pass input via stdin
      output = execSync(`echo "${input}" | ${SHORTCUTS_CLI} run "${name}"`, {
        encoding: 'utf-8',
        timeout,
        shell: true
      });
    } else if (inputPath) {
      // Pass file as input
      output = execSync(`${SHORTCUTS_CLI} run "${name}" --input-path "${inputPath}"`, {
        encoding: 'utf-8',
        timeout
      });
    } else {
      // Run without input
      output = execSync(`${SHORTCUTS_CLI} run "${name}"`, {
        encoding: 'utf-8',
        timeout
      });
    }

    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get shortcut info (limited - just checks existence)
 * @param {string} name - Shortcut name
 * @returns {Promise<{success: boolean, exists?: boolean, error?: string}>}
 */
export async function getShortcutInfo(name) {
  const exists = await shortcutExists(name);
  return { success: true, exists };
}
