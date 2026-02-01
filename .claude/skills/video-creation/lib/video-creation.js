/**
 * Video Creation Module
 *
 * Creates polished tutorial videos from recordings using Remotion.
 * This is a placeholder - full implementation in docs/plans/2026-02-01-screen-recording-remotion-plan.md
 *
 * @module video-creation
 */

import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { join, basename } from 'path';

const REMOTION_DIR = '/Users/brokkrbot/brokkr-agent/remotion-videos';
const VIDEOS_DIR = '/Users/brokkrbot/brokkr-agent/videos';
const ICLOUD_SHARED = '/Users/brokkrbot/Library/Mobile Documents/com~apple~CloudDocs/Family/Brokkr-Videos';

/**
 * Get video duration using ffprobe (if available)
 * @param {string} videoPath - Path to video file
 * @returns {number} Duration in seconds (estimated if ffprobe unavailable)
 */
export function getVideoDuration(videoPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf-8' }
    );
    return Math.ceil(parseFloat(result));
  } catch {
    // Estimate from file size (rough: 1MB ~ 1 second for screen recording)
    try {
      const stats = require('fs').statSync(videoPath);
      return Math.max(10, Math.ceil(stats.size / (1024 * 1024)));
    } catch {
      return 30; // Default 30 seconds
    }
  }
}

/**
 * Render a tutorial video from a screen recording
 * PLACEHOLDER - requires Remotion setup
 *
 * @param {string} recordingPath - Path to screen recording
 * @param {string} title - Video title
 * @param {Object} options - Render options
 * @param {string} [options.subtitle] - Video subtitle
 * @param {string} [options.quality='medium'] - Quality preset (high/medium/low)
 * @param {number} [options.concurrency=2] - Rendering concurrency
 * @returns {Promise<{success: boolean, message: string, outputPath?: string}>}
 */
export async function renderVideo(recordingPath, title, options = {}) {
  // Validate recording exists
  if (!existsSync(recordingPath)) {
    return {
      success: false,
      message: `Recording not found: ${recordingPath}`
    };
  }

  // Check Remotion project exists
  if (!existsSync(REMOTION_DIR)) {
    return {
      success: false,
      message: `Remotion project not found at ${REMOTION_DIR}. Run: npx create-video@latest remotion-videos --blank`
    };
  }

  // Ensure output directory exists
  if (!existsSync(VIDEOS_DIR)) {
    mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  const outputFileName = `tutorial-${basename(recordingPath, '.mov')}.mp4`;
  const outputPath = join(VIDEOS_DIR, outputFileName);

  // TODO: Implement Remotion rendering
  // See docs/plans/2026-02-01-screen-recording-remotion-plan.md Task 2.5
  console.log('[VideoCreation] renderVideo - PLACEHOLDER');
  console.log(`  Recording: ${recordingPath}`);
  console.log(`  Title: ${title}`);
  console.log(`  Output: ${outputPath}`);

  return {
    success: false,
    message: 'Remotion rendering not yet implemented. See docs/plans/2026-02-01-screen-recording-remotion-plan.md'
  };
}

/**
 * Open Remotion Studio for preview
 * @returns {{success: boolean, message: string}}
 */
export function openPreview() {
  if (!existsSync(REMOTION_DIR)) {
    return {
      success: false,
      message: `Remotion project not found at ${REMOTION_DIR}`
    };
  }

  try {
    const proc = spawn('npx', ['remotion', 'preview'], {
      cwd: REMOTION_DIR,
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    return {
      success: true,
      message: 'Remotion Studio opening in browser...'
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to open preview: ${err.message}`
    };
  }
}

/**
 * Share video to iCloud Family Sharing folder
 * @param {string} videoPath - Path to video file
 * @returns {{success: boolean, message: string, sharedPath?: string}}
 */
export function shareVideo(videoPath) {
  if (!existsSync(videoPath)) {
    return {
      success: false,
      message: `Video not found: ${videoPath}`
    };
  }

  // Ensure shared folder exists
  if (!existsSync(ICLOUD_SHARED)) {
    mkdirSync(ICLOUD_SHARED, { recursive: true });
  }

  const filename = basename(videoPath);
  const destPath = join(ICLOUD_SHARED, filename);

  try {
    copyFileSync(videoPath, destPath);
    return {
      success: true,
      message: `Video shared to iCloud. Note: Sync may take a few minutes.`,
      sharedPath: destPath
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to share video: ${err.message}`
    };
  }
}

/**
 * List available videos
 * @returns {Array<{file: string, path: string, size: string, modified: string}>}
 */
export function listVideos() {
  if (!existsSync(VIDEOS_DIR)) {
    return [];
  }

  try {
    const files = execSync(`ls -1t "${VIDEOS_DIR}"/*.mp4 2>/dev/null || true`, {
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
 * Full workflow: render and share
 * @param {string} recordingPath - Path to screen recording
 * @param {string} title - Video title
 * @param {Object} options - Options
 * @returns {Promise<{success: boolean, message: string, outputPath?: string, sharedPath?: string}>}
 */
export async function createTutorial(recordingPath, title, options = {}) {
  console.log('[VideoCreation] createTutorial');
  console.log(`  Recording: ${recordingPath}`);
  console.log(`  Title: ${title}`);

  // Step 1: Render video
  const renderResult = await renderVideo(recordingPath, title, options);
  if (!renderResult.success) {
    return renderResult;
  }

  // Step 2: Share to iCloud
  const shareResult = shareVideo(renderResult.outputPath);
  if (!shareResult.success) {
    return {
      success: true,
      message: `Video rendered but sharing failed: ${shareResult.message}`,
      outputPath: renderResult.outputPath
    };
  }

  return {
    success: true,
    message: 'Tutorial video created and shared!',
    outputPath: renderResult.outputPath,
    sharedPath: shareResult.sharedPath
  };
}

export default {
  getVideoDuration,
  renderVideo,
  openPreview,
  shareVideo,
  listVideos,
  createTutorial
};
