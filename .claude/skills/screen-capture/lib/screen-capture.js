/**
 * Screen Capture Module
 *
 * Provides screen recording functionality using macOS native screencapture.
 * This is a placeholder - full implementation in docs/plans/2026-02-01-screen-recording-remotion-plan.md
 *
 * @module screen-capture
 */

import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

const RECORDINGS_DIR = '/Users/brokkrbot/brokkr-agent/recordings';
const LOCK_FILE = join(RECORDINGS_DIR, '.recording.lock');

/**
 * Check if a recording is currently in progress
 * @returns {{recording: boolean, pid?: number, outputFile?: string, startTime?: string}}
 */
export function getRecordingStatus() {
  if (!existsSync(LOCK_FILE)) {
    return { recording: false };
  }

  try {
    const content = readFileSync(LOCK_FILE, 'utf-8').trim().split('\n');
    const pid = parseInt(content[0], 10);
    const outputFile = content[1];
    const startTime = content[2];

    // Check if process is still running
    try {
      process.kill(pid, 0);
      return { recording: true, pid, outputFile, startTime };
    } catch {
      // Process not running, stale lock
      unlinkSync(LOCK_FILE);
      return { recording: false };
    }
  } catch {
    return { recording: false };
  }
}

/**
 * Start a screen recording
 * @param {Object} options - Recording options
 * @param {number} [options.duration] - Recording duration in seconds (optional)
 * @param {number} [options.windowId] - Specific window ID to record
 * @param {boolean} [options.region] - Prompt for region selection
 * @param {number} [options.display] - Display number to record
 * @param {string} [options.audio] - Audio source ID
 * @returns {{success: boolean, message: string, outputFile?: string, pid?: number}}
 */
export function startRecording(options = {}) {
  const status = getRecordingStatus();
  if (status.recording) {
    return {
      success: false,
      message: `Recording already in progress (PID: ${status.pid})`
    };
  }

  // Ensure recordings directory exists
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFile = join(RECORDINGS_DIR, `recording-${timestamp}.mov`);

  // Build screencapture command args
  const args = [];

  // Duration flag
  if (options.duration) {
    args.push('-V', String(options.duration));
  } else {
    args.push('-v');
  }

  // Window-specific recording
  if (options.windowId) {
    args.push('-l', String(options.windowId));
  }

  // Region selection (interactive)
  if (options.region) {
    args.push('-R');
  }

  // Display selection
  if (options.display) {
    args.push('-D', String(options.display));
  }

  // Audio source
  if (options.audio) {
    args.push('-G', options.audio);
  }

  // Add cursor capture by default
  args.push('-C');

  // Suppress sounds
  args.push('-x');

  // Output file
  args.push(outputFile);

  console.log(`[ScreenCapture] Starting: screencapture ${args.join(' ')}`);

  // Spawn screencapture process
  const proc = spawn('screencapture', args, {
    detached: true,
    stdio: 'ignore'
  });

  proc.unref();

  // Write lock file
  writeFileSync(LOCK_FILE, `${proc.pid}\n${outputFile}\n${timestamp}`);

  return {
    success: true,
    message: `Recording started (PID: ${proc.pid})`,
    outputFile,
    pid: proc.pid
  };
}

/**
 * Stop the current recording
 * @returns {{success: boolean, message: string, outputFile?: string}}
 */
export function stopRecording() {
  const status = getRecordingStatus();
  if (!status.recording) {
    return { success: false, message: 'No recording in progress' };
  }

  try {
    // Send SIGINT to gracefully stop
    process.kill(status.pid, 'SIGINT');

    // Wait a moment for process to finish
    setTimeout(() => {
      try {
        process.kill(status.pid, 0);
        // Still running, force kill
        process.kill(status.pid, 'SIGKILL');
      } catch {
        // Process ended
      }
    }, 1000);

    // Remove lock file
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }

    return {
      success: true,
      message: 'Recording stopped',
      outputFile: status.outputFile
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to stop recording: ${err.message}`
    };
  }
}

/**
 * List available recordings
 * @returns {Array<{file: string, path: string, size: string, modified: string}>}
 */
export function listRecordings() {
  if (!existsSync(RECORDINGS_DIR)) {
    return [];
  }

  try {
    const files = execSync(`ls -1t "${RECORDINGS_DIR}"/*.mov 2>/dev/null || true`, {
      encoding: 'utf-8'
    }).trim().split('\n').filter(Boolean);

    return files.map(path => {
      const stat = execSync(`stat -f "%Sm" -t "%Y-%m-%d %H:%M" "${path}"`, {
        encoding: 'utf-8'
      }).trim();
      const size = execSync(`ls -lh "${path}" | awk '{print $5}'`, {
        encoding: 'utf-8'
      }).trim();

      return {
        file: path.split('/').pop(),
        path,
        size,
        modified: stat
      };
    });
  } catch {
    return [];
  }
}

/**
 * List available windows with their IDs
 * PLACEHOLDER - requires AppleScript execution
 * @returns {Array<{app: string, title: string, id: number}>}
 */
export function listWindows() {
  // TODO: Implement with AppleScript
  // See docs/plans/2026-02-01-screen-recording-remotion-plan.md Task 1.2
  console.log('[ScreenCapture] listWindows - PLACEHOLDER');
  return [];
}

/**
 * List available audio sources
 * PLACEHOLDER - requires system query
 * @returns {Array<{name: string, id: string}>}
 */
export function listAudioSources() {
  // TODO: Implement audio source discovery
  console.log('[ScreenCapture] listAudioSources - PLACEHOLDER');
  return [];
}

export default {
  getRecordingStatus,
  startRecording,
  stopRecording,
  listRecordings,
  listWindows,
  listAudioSources
};
