# Music Control Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks
>
> **Architecture Reference:** See `docs/concepts/2026-02-01-apple-integration-architecture.md` for standardized patterns.

**Goal:** Create a skill for controlling Apple Music playback and managing the music library via AppleScript, enabling Brokkr to play/pause music, search the library, get now playing info, and manage playlists.

**Architecture:** AppleScript-based skill with Node.js wrapper modules that execute AppleScript commands via `osascript`. Provides reusable functions for playback control (play, pause, next, prev), library search, now playing info, and playlist management. Works with tracks in the user's Music library.

**Tech Stack:** AppleScript (Music.app dictionary), Node.js (child_process for osascript execution), no additional dependencies

---

## Skill Directory Structure

```
skills/music/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── music.js                # Core functionality (re-exports modules)
│   ├── applescript-utils.js    # AppleScript execution utilities
│   ├── playback.js             # Playback control utilities
│   ├── now-playing.js          # Now playing info utilities
│   ├── library.js              # Library search utilities
│   ├── playlists.js            # Playlist management utilities
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── music-dictionary.md
├── scripts/                    # Reusable automation scripts
│   └── *.applescript
└── tests/
    ├── applescript-utils.test.js
    ├── playback.test.js
    ├── now-playing.test.js
    ├── library.test.js
    └── playlists.test.js
```

## Command File

Create `.claude/commands/music.md`:

```yaml
---
name: music
description: Control Apple Music playback and library
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Music skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## iCloud Storage Integration

Use `lib/icloud-storage.js` for playlist exports and artwork:

```javascript
const { getPath } = require('../../lib/icloud-storage');

// Save album artwork to iCloud
const artworkPath = getPath('exports', `artwork-${trackId}.jpg`);

// Export playlist to iCloud
const playlistPath = getPath('exports', `playlist-${name}-${Date.now()}.m3u`);
```

## Notification Processing Criteria

| Event | Queue If | Drop If |
|-------|----------|---------|
| Playback control request | Command from WhatsApp/iMessage | Automated player state changes |
| Now playing query | User requests current track | Routine track changes |
| Library sync complete | New tracks added | Background sync |

## SKILL.md Standard Header

```yaml
---
name: music
description: Control Apple Music playback and manage library. Play/pause, search tracks, manage playlists.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Music Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Playback control (play, pause, next, previous, stop)
- Now playing information retrieval
- Library search by artist, album, title
- Playlist management (create, delete, add tracks)
- Volume and position control

## Usage

### Via Command (Manual)
```
/music play
/music search The Beatles
/music now
```

### Via Notification (Automatic)
Triggered by playback control requests from messages.

## Reference Documentation

See `reference/` directory for detailed docs.
```

---

## Research Summary

### Official Documentation Sources

- [iTunes AppleScript Examples - alvinalexander.com](https://alvinalexander.com/apple/itunes-applescript-examples-scripts-mac-reference/)
- [Doug's AppleScripts](https://dougscripts.com/itunes/itinfo/info03.php) - Comprehensive third-party documentation
- [Scripting Apple Music](https://dbushell.com/2023/01/20/scripting-apple-music/)
- [Apple Music CLI Player](https://github.com/mcthomas/Apple-Music-CLI-Player) - Shell script reference
- [MCP-AppleMusic](https://glama.ai/mcp/servers/@kennethreitz/mcp-applemusic) - Modern MCP server implementation
- [Music MCP by pedrocid](https://github.com/pedrocid/music-mcp) - Model Context Protocol server

### Key Capabilities

**Playback Control:**
- `play()` - Start playback of current track
- `pause()` - Pause playback
- `playpause()` - Toggle play/pause
- `stop()` - Stop playback
- `next track` - Skip to next track
- `previous track` - Skip to previous track
- `player state` - Get playback state (playing, paused, stopped)

**Track Information:**
- `current track` - Get reference to currently playing track
- Properties: `name`, `artist`, `album`, `duration`, `time`, `genre`, `year`
- `player position` - Get/set playback position (seconds)

**Library Search:**
- `search playlist "Library" for "artist"` - Search for tracks
- `tracks of playlist "Library" whose artist contains "name"`
- Can filter by artist, album, name, genre, etc.

**Playlist Management:**
- `make new user playlist` - Create playlist
- `add track to playlist` - Add tracks to playlist
- `duplicate track` - Duplicate track to playlist
- `delete playlist` - Remove playlist

### Critical Limitations (macOS 2026)

**IMPORTANT:** Research discovered a significant limitation in macOS Tahoe (version 26):

> AppleScript for Music app no longer supports the `current track` event in some scenarios, returning error "Can't get name of current track". The `current track` works only for songs in your Music library, NOT for Apple Music streams or non-library tracks.

**Mitigation Strategy:**
- Wrap all `current track` operations in error handling
- Check `player state` before accessing track properties
- Provide clear error messages when streaming content is playing

### Best Practices Discovered

1. **Error Handling:** Always wrap AppleScript in try-catch - Music.app may not be running
2. **Player State Check:** Verify `player state is playing` before accessing `current track`
3. **Search Syntax:** Use `search playlist "Library"` for comprehensive library search
4. **Playlist Access:** Library playlist is named "Library" in Music.app
5. **Time Format:** Duration and player position are in seconds (integer)

### Verified Compatibility

Testing on macOS 14.8.3 (Sonoma) confirmed:
- Music.app responds to AppleScript commands
- Library access works: `osascript -e 'tell application "Music" to get name of playlists'` returns "Library, Music"
- Current track issues are known in newer macOS versions but Sonoma is stable

---

## Design Decisions

### Why AppleScript (Not CLI Tools)?

AppleScript provides direct access to Music.app's full API:
- Official, first-party support from Apple
- Access to all track properties and playlist operations
- No third-party dependencies or tools needed
- Works offline (no network required)

### Skill Structure

```
skills/music/
  skill.md              # Documentation and usage
  lib/
    playback.js         # Playback control utilities
    library.js          # Library search utilities
    now-playing.js      # Now playing info utilities
    playlists.js        # Playlist management utilities
  scripts/
    play.applescript    # Play/pause/next/prev scripts
    search.applescript  # Library search scripts
    info.applescript    # Now playing info scripts
    playlist.applescript # Playlist management scripts
  tests/
    playback.test.js
    library.test.js
    now-playing.test.js
    playlists.test.js
```

### Node.js Wrapper Pattern

All AppleScript is executed via Node.js wrappers:

```javascript
import { execSync } from 'child_process';

function runAppleScript(script) {
  try {
    const result = execSync(`osascript -e '${script}'`, { encoding: 'utf-8' });
    return { success: true, output: result.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Error Handling Strategy

All skill functions return `{ success: boolean, data?: any, error?: string }`:
- Success case: `{ success: true, data: trackInfo }`
- Music not running: `{ success: false, error: 'Music.app not running' }`
- No track playing: `{ success: false, error: 'No track currently playing' }`
- Streaming content: `{ success: false, error: 'Current track is streaming (not in library)' }`

---

## Task Overview

| Task | Description | Files | Test Strategy |
|------|-------------|-------|---------------|
| 1 | AppleScript Utilities Module | `skills/music/lib/applescript-utils.js` | Unit test: execute, parse, error handling |
| 2 | Playback Control Module | `skills/music/lib/playback.js` | Unit test: play, pause, next, prev |
| 3 | Now Playing Info Module | `skills/music/lib/now-playing.js` | Unit test: get track info, handle errors |
| 4 | Library Search Module | `skills/music/lib/library.js` | Unit test: search by artist, album, title |
| 5 | Playlist Management Module | `skills/music/lib/playlists.js` | Unit test: create, list, add tracks |
| 6 | Skill Documentation | `skills/music/skill.md` | Manual review for completeness |
| 7 | Integration Testing | Manual testing script | End-to-end: control playback, search library |

---

## Task 1: AppleScript Utilities Module

**Objective:** Create a utility module for executing AppleScript and parsing results.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/lib/applescript-utils.js`
- `/Users/brokkrbot/brokkr-agent/skills/music/tests/applescript-utils.test.js`

### Test (TDD)

Create test file first:

```javascript
// skills/music/tests/applescript-utils.test.js
import { describe, test, expect } from '@jest/globals';
import { runAppleScript, isMusicRunning, getMusicVersion } from '../lib/applescript-utils.js';

describe('AppleScript Utilities', () => {
  test('runAppleScript executes simple script', async () => {
    const result = await runAppleScript('return "Hello"');
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello');
  });

  test('runAppleScript handles errors gracefully', async () => {
    const result = await runAppleScript('invalid applescript syntax');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('isMusicRunning checks if Music.app is running', async () => {
    const result = await isMusicRunning();
    expect(typeof result).toBe('boolean');
  });

  test('getMusicVersion returns Music.app version', async () => {
    const result = await getMusicVersion();
    // Should return version string or error
    expect(result.success !== undefined).toBe(true);
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/music/tests/applescript-utils.test.js
```

**Expected:** Test fails - module doesn't exist yet.

### Implementation

```javascript
// skills/music/lib/applescript-utils.js
import { execSync } from 'child_process';

/**
 * Execute an AppleScript command
 * @param {string} script - AppleScript code to execute
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runAppleScript(script, options = {}) {
  const { timeout = 10000 } = options;

  try {
    const output = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.stderr?.toString().trim() || error.message
    };
  }
}

/**
 * Execute an AppleScript file
 * @param {string} filePath - Path to .applescript or .scpt file
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runAppleScriptFile(filePath) {
  try {
    const output = execSync(`osascript "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 10000
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.stderr?.toString().trim() || error.message
    };
  }
}

/**
 * Check if Music.app is currently running
 * @returns {Promise<boolean>} True if Music.app is running
 */
export async function isMusicRunning() {
  const script = `
    tell application "System Events"
      return (name of processes) contains "Music"
    end tell
  `;
  const result = await runAppleScript(script);
  return result.success && result.output === 'true';
}

/**
 * Get Music.app version
 * @returns {Promise<{success: boolean, version?: string, error?: string}>}
 */
export async function getMusicVersion() {
  const script = 'tell application "Music" to get version';
  const result = await runAppleScript(script);
  if (result.success) {
    return { success: true, version: result.output };
  }
  return { success: false, error: result.error };
}

/**
 * Ensure Music.app is running, launch if needed
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function ensureMusicRunning() {
  const isRunning = await isMusicRunning();
  if (isRunning) {
    return { success: true };
  }

  // Launch Music.app
  const script = 'tell application "Music" to launch';
  const result = await runAppleScript(script);

  if (result.success) {
    // Wait a moment for app to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true };
  }

  return { success: false, error: 'Failed to launch Music.app' };
}

/**
 * Parse AppleScript list output into JavaScript array
 * @param {string} listString - AppleScript list as string (e.g., "item1, item2, item3")
 * @returns {string[]} Array of items
 */
export function parseAppleScriptList(listString) {
  if (!listString || listString === '') {
    return [];
  }
  return listString.split(', ').map(item => item.trim());
}

/**
 * Escape string for use in AppleScript
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeAppleScriptString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

### Verification

```bash
npm test -- skills/music/tests/applescript-utils.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(music): add applescript utilities module`

---

## Task 2: Playback Control Module

**Objective:** Create functions for controlling Music.app playback (play, pause, next, prev).

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/lib/playback.js`
- `/Users/brokkrbot/brokkr-agent/skills/music/tests/playback.test.js`

### Test (TDD)

```javascript
// skills/music/tests/playback.test.js
import { describe, test, expect } from '@jest/globals';
import {
  play,
  pause,
  playPause,
  stop,
  nextTrack,
  previousTrack,
  getPlayerState
} from '../lib/playback.js';

describe('Playback Control', () => {
  test('getPlayerState returns player state', async () => {
    const result = await getPlayerState();
    expect(result.success).toBe(true);
    expect(['playing', 'paused', 'stopped']).toContain(result.state);
  });

  test('playPause toggles playback', async () => {
    const result = await playPause();
    // Should succeed even if no track is loaded
    expect(result.success).toBe(true);
  });

  test('play starts playback', async () => {
    const result = await play();
    expect(result.success).toBe(true);
  });

  test('pause pauses playback', async () => {
    const result = await pause();
    expect(result.success).toBe(true);
  });

  test('nextTrack skips to next track', async () => {
    const result = await nextTrack();
    // May fail if no playlist active
    expect(result.success !== undefined).toBe(true);
  });

  test('previousTrack skips to previous track', async () => {
    const result = await previousTrack();
    // May fail if no playlist active
    expect(result.success !== undefined).toBe(true);
  });

  test('stop stops playback', async () => {
    const result = await stop();
    expect(result.success).toBe(true);
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/music/tests/playback.test.js
```

### Implementation

```javascript
// skills/music/lib/playback.js
import { runAppleScript, ensureMusicRunning } from './applescript-utils.js';

/**
 * Get current player state
 * @returns {Promise<{success: boolean, state?: string, error?: string}>}
 */
export async function getPlayerState() {
  const script = 'tell application "Music" to get player state as string';
  const result = await runAppleScript(script);

  if (result.success) {
    // Player state values: playing, paused, stopped
    const state = result.output.toLowerCase();
    return { success: true, state };
  }

  return { success: false, error: result.error };
}

/**
 * Start playback
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function play() {
  await ensureMusicRunning();
  const script = 'tell application "Music" to play';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Pause playback
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function pause() {
  const script = 'tell application "Music" to pause';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Toggle play/pause
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function playPause() {
  await ensureMusicRunning();
  const script = 'tell application "Music" to playpause';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Stop playback
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function stop() {
  const script = 'tell application "Music" to stop';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Skip to next track
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function nextTrack() {
  const script = 'tell application "Music" to next track';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Skip to previous track
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function previousTrack() {
  const script = 'tell application "Music" to previous track';
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Set playback volume (0-100)
 * @param {number} volume - Volume level (0-100)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setVolume(volume) {
  if (volume < 0 || volume > 100) {
    return { success: false, error: 'Volume must be between 0 and 100' };
  }

  const script = `tell application "Music" to set sound volume to ${volume}`;
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Get current volume (0-100)
 * @returns {Promise<{success: boolean, volume?: number, error?: string}>}
 */
export async function getVolume() {
  const script = 'tell application "Music" to get sound volume';
  const result = await runAppleScript(script);

  if (result.success) {
    const volume = parseInt(result.output, 10);
    return { success: true, volume };
  }

  return { success: false, error: result.error };
}

/**
 * Set player position (seek to time in seconds)
 * @param {number} seconds - Position in seconds
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setPlayerPosition(seconds) {
  const script = `tell application "Music" to set player position to ${seconds}`;
  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Get current player position (in seconds)
 * @returns {Promise<{success: boolean, position?: number, error?: string}>}
 */
export async function getPlayerPosition() {
  const script = 'tell application "Music" to get player position';
  const result = await runAppleScript(script);

  if (result.success) {
    const position = parseFloat(result.output);
    return { success: true, position };
  }

  return { success: false, error: result.error };
}
```

### Verification

```bash
npm test -- skills/music/tests/playback.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(music): add playback control module`

---

## Task 3: Now Playing Info Module

**Objective:** Create functions to get information about the currently playing track.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/lib/now-playing.js`
- `/Users/brokkrbot/brokkr-agent/skills/music/tests/now-playing.test.js`

### Test (TDD)

```javascript
// skills/music/tests/now-playing.test.js
import { describe, test, expect } from '@jest/globals';
import { getNowPlaying, getTrackInfo, isPlaying } from '../lib/now-playing.js';

describe('Now Playing Info', () => {
  test('isPlaying returns boolean', async () => {
    const result = await isPlaying();
    expect(typeof result).toBe('boolean');
  });

  test('getNowPlaying returns track info or error', async () => {
    const result = await getNowPlaying();
    expect(result.success !== undefined).toBe(true);
    // If successful, should have track property
    if (result.success) {
      expect(result.track).toBeTruthy();
      expect(result.track.name).toBeTruthy();
    }
  });

  test('getTrackInfo gets detailed track properties', async () => {
    const result = await getTrackInfo();
    expect(result.success !== undefined).toBe(true);
    // If playing, should have all properties
    if (result.success) {
      expect(result.track.name).toBeTruthy();
      expect(result.track.artist).toBeTruthy();
    }
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/music/tests/now-playing.test.js
```

### Implementation

```javascript
// skills/music/lib/now-playing.js
import { runAppleScript } from './applescript-utils.js';
import { getPlayerState } from './playback.js';

/**
 * Check if music is currently playing
 * @returns {Promise<boolean>} True if playing
 */
export async function isPlaying() {
  const result = await getPlayerState();
  return result.success && result.state === 'playing';
}

/**
 * Get basic info about currently playing track
 * @returns {Promise<{success: boolean, track?: {name: string, artist: string}, error?: string}>}
 */
export async function getNowPlaying() {
  const playing = await isPlaying();

  if (!playing) {
    return { success: false, error: 'No track currently playing' };
  }

  const script = `
    tell application "Music"
      if player state is playing then
        set trackName to name of current track
        set trackArtist to artist of current track
        return trackName & " by " & trackArtist
      else
        return "Not playing"
      end if
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (result.output === 'Not playing') {
      return { success: false, error: 'No track currently playing' };
    }

    // Parse "Song Name by Artist Name"
    const parts = result.output.split(' by ');
    return {
      success: true,
      track: {
        name: parts[0],
        artist: parts[1] || 'Unknown Artist'
      }
    };
  }

  return {
    success: false,
    error: result.error || 'Failed to get track info (may be streaming content)'
  };
}

/**
 * Get detailed info about currently playing track
 * @returns {Promise<{success: boolean, track?: object, error?: string}>}
 */
export async function getTrackInfo() {
  const playing = await isPlaying();

  if (!playing) {
    return { success: false, error: 'No track currently playing' };
  }

  const script = `
    tell application "Music"
      if player state is playing then
        set t to current track
        set trackInfo to {|name|:name of t, |artist|:artist of t, |album|:album of t, |duration|:duration of t, |genre|:genre of t, |year|:year of t}
        return trackInfo as string
      else
        return "Not playing"
      end if
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (result.output === 'Not playing') {
      return { success: false, error: 'No track currently playing' };
    }

    // Parse AppleScript record format: "name:Song, artist:Artist, ..."
    const track = parseAppleScriptRecord(result.output);
    return { success: true, track };
  }

  return {
    success: false,
    error: result.error || 'Failed to get track info (may be streaming content)'
  };
}

/**
 * Get album artwork for current track
 * @param {string} outputPath - Path to save artwork image
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function getArtwork(outputPath = '/tmp/music-artwork.jpg') {
  const playing = await isPlaying();

  if (!playing) {
    return { success: false, error: 'No track currently playing' };
  }

  const script = `
    tell application "Music"
      if player state is playing then
        set t to current track
        set artworkData to data of artwork 1 of t
        set artworkFile to open for access POSIX file "${outputPath}" with write permission
        write artworkData to artworkFile
        close access artworkFile
        return "success"
      else
        return "Not playing"
      end if
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success && result.output === 'success') {
    return { success: true, path: outputPath };
  }

  return {
    success: false,
    error: result.error || 'Failed to get artwork'
  };
}

/**
 * Format track duration from seconds to MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "3:42")
 */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse AppleScript record string to JavaScript object
 * @param {string} recordString - AppleScript record as string
 * @returns {object} Parsed object
 */
function parseAppleScriptRecord(recordString) {
  const obj = {};

  // Remove outer braces and split by comma
  const cleaned = recordString.replace(/^\{|\}$/g, '').trim();
  const pairs = cleaned.split(', ');

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split(':');
    const value = valueParts.join(':').trim();
    obj[key.replace(/\|/g, '')] = value;
  }

  return obj;
}
```

### Verification

```bash
npm test -- skills/music/tests/now-playing.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(music): add now playing info module`

---

## Task 4: Library Search Module

**Objective:** Create functions to search the music library.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/lib/library.js`
- `/Users/brokkrbot/brokkr-agent/skills/music/tests/library.test.js`

### Test (TDD)

```javascript
// skills/music/tests/library.test.js
import { describe, test, expect } from '@jest/globals';
import { searchLibrary, searchByArtist, searchByAlbum, getLibraryStats } from '../lib/library.js';

describe('Library Search', () => {
  test('getLibraryStats returns library statistics', async () => {
    const result = await getLibraryStats();
    expect(result.success).toBe(true);
    expect(result.stats).toBeTruthy();
    expect(typeof result.stats.trackCount).toBe('number');
  });

  test('searchLibrary searches for tracks', async () => {
    const result = await searchLibrary('test');
    expect(result.success !== undefined).toBe(true);
    // If successful, should have tracks array
    if (result.success) {
      expect(Array.isArray(result.tracks)).toBe(true);
    }
  });

  test('searchByArtist searches by artist name', async () => {
    const result = await searchByArtist('test artist');
    expect(result.success !== undefined).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.tracks)).toBe(true);
    }
  });

  test('searchByAlbum searches by album name', async () => {
    const result = await searchByAlbum('test album');
    expect(result.success !== undefined).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.tracks)).toBe(true);
    }
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/music/tests/library.test.js
```

### Implementation

```javascript
// skills/music/lib/library.js
import { runAppleScript, parseAppleScriptList } from './applescript-utils.js';

/**
 * Get music library statistics
 * @returns {Promise<{success: boolean, stats?: object, error?: string}>}
 */
export async function getLibraryStats() {
  const script = `
    tell application "Music"
      set trackCount to count of tracks of playlist "Library"
      set playlistCount to count of user playlists
      return trackCount & "," & playlistCount
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    const [trackCount, playlistCount] = result.output.split(',').map(n => parseInt(n, 10));
    return {
      success: true,
      stats: {
        trackCount,
        playlistCount
      }
    };
  }

  return { success: false, error: result.error };
}

/**
 * Search library for tracks
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum results to return
 * @returns {Promise<{success: boolean, tracks?: array, error?: string}>}
 */
export async function searchLibrary(query, options = {}) {
  const { limit = 10 } = options;

  const script = `
    tell application "Music"
      set foundTracks to search playlist "Library" for "${query.replace(/"/g, '\\"')}"
      set trackList to {}
      repeat with t in foundTracks
        if (count of trackList) >= ${limit} then exit repeat
        set trackInfo to name of t & "|" & artist of t & "|" & album of t
        set end of trackList to trackInfo
      end repeat
      return trackList
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, tracks: [] };
    }

    const trackStrings = parseAppleScriptList(result.output);
    const tracks = trackStrings.map(str => {
      const [name, artist, album] = str.split('|');
      return { name, artist, album };
    });

    return { success: true, tracks };
  }

  return { success: false, error: result.error };
}

/**
 * Search library by artist name
 * @param {string} artist - Artist name
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum results
 * @returns {Promise<{success: boolean, tracks?: array, error?: string}>}
 */
export async function searchByArtist(artist, options = {}) {
  const { limit = 10 } = options;

  const script = `
    tell application "Music"
      set foundTracks to (every track of playlist "Library" whose artist contains "${artist.replace(/"/g, '\\"')}")
      set trackList to {}
      repeat with t in foundTracks
        if (count of trackList) >= ${limit} then exit repeat
        set trackInfo to name of t & "|" & artist of t & "|" & album of t
        set end of trackList to trackInfo
      end repeat
      return trackList
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, tracks: [] };
    }

    const trackStrings = parseAppleScriptList(result.output);
    const tracks = trackStrings.map(str => {
      const [name, artist, album] = str.split('|');
      return { name, artist, album };
    });

    return { success: true, tracks };
  }

  return { success: false, error: result.error };
}

/**
 * Search library by album name
 * @param {string} album - Album name
 * @param {Object} options - Search options
 * @param {number} options.limit - Maximum results
 * @returns {Promise<{success: boolean, tracks?: array, error?: string}>}
 */
export async function searchByAlbum(album, options = {}) {
  const { limit = 10 } = options;

  const script = `
    tell application "Music"
      set foundTracks to (every track of playlist "Library" whose album contains "${album.replace(/"/g, '\\"')}")
      set trackList to {}
      repeat with t in foundTracks
        if (count of trackList) >= ${limit} then exit repeat
        set trackInfo to name of t & "|" & artist of t & "|" & album of t
        set end of trackList to trackInfo
      end repeat
      return trackList
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, tracks: [] };
    }

    const trackStrings = parseAppleScriptList(result.output);
    const tracks = trackStrings.map(str => {
      const [name, artist, album] = str.split('|');
      return { name, artist, album };
    });

    return { success: true, tracks };
  }

  return { success: false, error: result.error };
}

/**
 * Play a specific track from search results
 * @param {string} trackName - Track name
 * @param {string} artist - Artist name (optional, for disambiguation)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function playTrack(trackName, artist = null) {
  let script;

  if (artist) {
    script = `
      tell application "Music"
        set foundTracks to (every track of playlist "Library" whose name is "${trackName.replace(/"/g, '\\"')}" and artist is "${artist.replace(/"/g, '\\"')}")
        if (count of foundTracks) > 0 then
          play (item 1 of foundTracks)
          return "success"
        else
          return "not found"
        end if
      end tell
    `;
  } else {
    script = `
      tell application "Music"
        set foundTracks to (every track of playlist "Library" whose name is "${trackName.replace(/"/g, '\\"')}")
        if (count of foundTracks) > 0 then
          play (item 1 of foundTracks)
          return "success"
        else
          return "not found"
        end if
      end tell
    `;
  }

  const result = await runAppleScript(script);

  if (result.success) {
    if (result.output === 'not found') {
      return { success: false, error: `Track not found: ${trackName}` };
    }
    return { success: true };
  }

  return { success: false, error: result.error };
}
```

### Verification

```bash
npm test -- skills/music/tests/library.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(music): add library search module`

---

## Task 5: Playlist Management Module

**Objective:** Create functions to manage playlists (create, list, add tracks).

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/lib/playlists.js`
- `/Users/brokkrbot/brokkr-agent/skills/music/tests/playlists.test.js`

### Test (TDD)

```javascript
// skills/music/tests/playlists.test.js
import { describe, test, expect } from '@jest/globals';
import { getPlaylists, createPlaylist, deletePlaylist } from '../lib/playlists.js';

describe('Playlist Management', () => {
  test('getPlaylists returns list of playlists', async () => {
    const result = await getPlaylists();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.playlists)).toBe(true);
    // Should at least have "Library" playlist
    expect(result.playlists.length).toBeGreaterThan(0);
  });

  test('createPlaylist creates new playlist', async () => {
    const testName = `Test Playlist ${Date.now()}`;
    const result = await createPlaylist(testName);
    expect(result.success).toBe(true);

    // Cleanup
    await deletePlaylist(testName);
  });

  test('deletePlaylist removes playlist', async () => {
    const testName = `Test Playlist ${Date.now()}`;
    await createPlaylist(testName);

    const result = await deletePlaylist(testName);
    expect(result.success).toBe(true);
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/music/tests/playlists.test.js
```

### Implementation

```javascript
// skills/music/lib/playlists.js
import { runAppleScript, parseAppleScriptList } from './applescript-utils.js';

/**
 * Get list of all playlists
 * @returns {Promise<{success: boolean, playlists?: string[], error?: string}>}
 */
export async function getPlaylists() {
  const script = `
    tell application "Music"
      set playlistNames to name of user playlists
      return playlistNames
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    const playlists = parseAppleScriptList(result.output);
    return { success: true, playlists };
  }

  return { success: false, error: result.error };
}

/**
 * Create a new playlist
 * @param {string} name - Playlist name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createPlaylist(name) {
  const script = `
    tell application "Music"
      make new user playlist with properties {name:"${name.replace(/"/g, '\\"')}"}
      return "success"
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Delete a playlist
 * @param {string} name - Playlist name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deletePlaylist(name) {
  const script = `
    tell application "Music"
      try
        delete user playlist "${name.replace(/"/g, '\\"')}"
        return "success"
      on error errMsg
        return "error: " & errMsg
      end try
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success && result.output === 'success') {
    return { success: true };
  }

  return {
    success: false,
    error: result.output?.startsWith('error:')
      ? result.output.replace('error: ', '')
      : result.error
  };
}

/**
 * Add track to playlist
 * @param {string} playlistName - Playlist name
 * @param {string} trackName - Track name
 * @param {string} artist - Artist name (optional, for disambiguation)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function addTrackToPlaylist(playlistName, trackName, artist = null) {
  let script;

  if (artist) {
    script = `
      tell application "Music"
        set foundTracks to (every track of playlist "Library" whose name is "${trackName.replace(/"/g, '\\"')}" and artist is "${artist.replace(/"/g, '\\"')}")
        if (count of foundTracks) > 0 then
          duplicate (item 1 of foundTracks) to user playlist "${playlistName.replace(/"/g, '\\"')}"
          return "success"
        else
          return "track not found"
        end if
      end tell
    `;
  } else {
    script = `
      tell application "Music"
        set foundTracks to (every track of playlist "Library" whose name is "${trackName.replace(/"/g, '\\"')}")
        if (count of foundTracks) > 0 then
          duplicate (item 1 of foundTracks) to user playlist "${playlistName.replace(/"/g, '\\"')}"
          return "success"
        else
          return "track not found"
        end if
      end tell
    `;
  }

  const result = await runAppleScript(script);

  if (result.success && result.output === 'success') {
    return { success: true };
  }

  if (result.output === 'track not found') {
    return { success: false, error: `Track not found: ${trackName}` };
  }

  return { success: false, error: result.error };
}

/**
 * Get tracks in a playlist
 * @param {string} playlistName - Playlist name
 * @param {Object} options - Options
 * @param {number} options.limit - Maximum tracks to return
 * @returns {Promise<{success: boolean, tracks?: array, error?: string}>}
 */
export async function getPlaylistTracks(playlistName, options = {}) {
  const { limit = 20 } = options;

  const script = `
    tell application "Music"
      set trackList to {}
      set allTracks to tracks of user playlist "${playlistName.replace(/"/g, '\\"')}"
      repeat with t in allTracks
        if (count of trackList) >= ${limit} then exit repeat
        set trackInfo to name of t & "|" & artist of t & "|" & album of t
        set end of trackList to trackInfo
      end repeat
      return trackList
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, tracks: [] };
    }

    const trackStrings = parseAppleScriptList(result.output);
    const tracks = trackStrings.map(str => {
      const [name, artist, album] = str.split('|');
      return { name, artist, album };
    });

    return { success: true, tracks };
  }

  return { success: false, error: result.error };
}

/**
 * Play a playlist
 * @param {string} playlistName - Playlist name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function playPlaylist(playlistName) {
  const script = `
    tell application "Music"
      play user playlist "${playlistName.replace(/"/g, '\\"')}"
      return "success"
    end tell
  `;

  const result = await runAppleScript(script);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}
```

### Verification

```bash
npm test -- skills/music/tests/playlists.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(music): add playlist management module`

---

## Task 6: Skill Documentation

**Objective:** Create comprehensive skill documentation.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/music/skill.md`

### Implementation

```markdown
# Music Control Skill

Control Apple Music playback and manage music library via AppleScript.

## Capabilities

- **Playback Control:** Play, pause, stop, next track, previous track
- **Now Playing Info:** Get current track name, artist, album, duration
- **Library Search:** Search by artist, album, or track name
- **Playlist Management:** Create, delete, add tracks to playlists
- **Volume Control:** Set and get playback volume
- **Player Position:** Seek to specific time in track

## Usage Examples

### Playback Control

```javascript
import { play, pause, nextTrack, getPlayerState } from './skills/music/lib/playback.js';

// Check player state
const state = await getPlayerState();
console.log(state.state); // 'playing', 'paused', or 'stopped'

// Toggle playback
await play();
await pause();
await nextTrack();
```

### Now Playing Info

```javascript
import { getNowPlaying, getTrackInfo } from './skills/music/lib/now-playing.js';

// Get basic info
const nowPlaying = await getNowPlaying();
console.log(`${nowPlaying.track.name} by ${nowPlaying.track.artist}`);

// Get detailed info
const trackInfo = await getTrackInfo();
console.log(trackInfo.track);
// { name: '...', artist: '...', album: '...', duration: 240, genre: '...', year: 2023 }
```

### Library Search

```javascript
import { searchLibrary, searchByArtist, playTrack } from './skills/music/lib/library.js';

// Search library
const results = await searchLibrary('bohemian rhapsody');
console.log(results.tracks);

// Search by artist
const artistTracks = await searchByArtist('Queen');

// Play a specific track
await playTrack('Bohemian Rhapsody', 'Queen');
```

### Playlist Management

```javascript
import { createPlaylist, addTrackToPlaylist, playPlaylist } from './skills/music/lib/playlists.js';

// Create playlist
await createPlaylist('My Favorites');

// Add tracks
await addTrackToPlaylist('My Favorites', 'Bohemian Rhapsody', 'Queen');

// Play playlist
await playPlaylist('My Favorites');
```

## Architecture

### AppleScript Execution

All functions execute AppleScript commands via `osascript`:
- Commands run in isolated processes (no persistent state)
- Timeout protection (default: 10 seconds)
- Automatic error handling and parsing

### Error Handling

All functions return `{ success: boolean, data?, error? }`:
- Success: `{ success: true, data: ... }`
- Music not running: `{ success: false, error: 'Music.app not running' }`
- No track playing: `{ success: false, error: 'No track currently playing' }`
- Streaming content: `{ success: false, error: 'Current track is streaming (not in library)' }`

### Known Limitations (macOS 2026)

**Current Track Issues:**
- `current track` works only for library tracks, NOT Apple Music streams
- Always check player state before accessing track properties
- Wrap track operations in try-catch for graceful handling

## Integration with Brokkr

### Commands

Music skill can be invoked via WhatsApp/iMessage/webhook:

```
/claude play some music
/claude what's playing?
/claude search for songs by The Beatles
/claude create a playlist called Workout Mix
```

### Auto-start

Music.app is automatically launched if not running when commands execute.

## Dependencies

- AppleScript (built-in on macOS)
- Music.app (built-in on macOS)
- Node.js child_process (for osascript execution)

## Files

```
skills/music/
  skill.md              # This file
  lib/
    applescript-utils.js  # AppleScript execution utilities
    playback.js           # Playback control functions
    now-playing.js        # Now playing info functions
    library.js            # Library search functions
    playlists.js          # Playlist management functions
  tests/
    applescript-utils.test.js
    playback.test.js
    now-playing.test.js
    library.test.js
    playlists.test.js
```

## Future Enhancements

- Smart playlist creation based on criteria
- Lyrics retrieval
- Rating management (star ratings)
- Shuffle and repeat mode control
- AirPlay device selection
- Apple Music subscription integration (if available)
- Voice control integration via macOS Speech Recognition
```

### Verification

Manual review of skill.md for completeness.

**Commit:** `docs(music): add skill documentation`

---

## Task 7: Integration Testing

**Objective:** Perform end-to-end testing of Music skill.

### Manual Test Script

Create `/Users/brokkrbot/brokkr-agent/skills/music/manual-test.js`:

```javascript
// skills/music/manual-test.js
import { getPlayerState, play, pause, nextTrack } from './lib/playback.js';
import { getNowPlaying, isPlaying } from './lib/now-playing.js';
import { searchLibrary, getLibraryStats } from './lib/library.js';
import { getPlaylists, createPlaylist, deletePlaylist } from './lib/playlists.js';

async function testMusicSkill() {
  console.log('Starting Music skill integration test...\n');

  try {
    // 1. Get player state
    console.log('1. Checking player state...');
    const state = await getPlayerState();
    console.log(`✓ Player state: ${state.state || 'unknown'}\n`);

    // 2. Get library stats
    console.log('2. Getting library statistics...');
    const stats = await getLibraryStats();
    if (stats.success) {
      console.log(`✓ Library has ${stats.stats.trackCount} tracks and ${stats.stats.playlistCount} playlists\n`);
    } else {
      console.log(`⚠ Failed to get stats: ${stats.error}\n`);
    }

    // 3. Search library
    console.log('3. Searching library...');
    const searchResults = await searchLibrary('music', { limit: 3 });
    if (searchResults.success) {
      console.log(`✓ Found ${searchResults.tracks.length} tracks:`);
      searchResults.tracks.forEach(t => {
        console.log(`  - ${t.name} by ${t.artist}`);
      });
      console.log();
    } else {
      console.log(`⚠ Search failed: ${searchResults.error}\n`);
    }

    // 4. Check if playing
    console.log('4. Checking playback status...');
    const playing = await isPlaying();
    console.log(`✓ Is playing: ${playing}\n`);

    if (playing) {
      // 5. Get now playing
      console.log('5. Getting now playing info...');
      const nowPlaying = await getNowPlaying();
      if (nowPlaying.success) {
        console.log(`✓ Now playing: ${nowPlaying.track.name} by ${nowPlaying.track.artist}\n`);
      } else {
        console.log(`⚠ Failed: ${nowPlaying.error}\n`);
      }
    } else {
      console.log('5. Skipping now playing (nothing playing)\n');
    }

    // 6. List playlists
    console.log('6. Listing playlists...');
    const playlists = await getPlaylists();
    if (playlists.success) {
      console.log(`✓ Found ${playlists.playlists.length} playlists:`);
      playlists.playlists.slice(0, 5).forEach(p => console.log(`  - ${p}`));
      console.log();
    } else {
      console.log(`⚠ Failed: ${playlists.error}\n`);
    }

    // 7. Create and delete test playlist
    console.log('7. Testing playlist creation...');
    const testPlaylistName = `Test Playlist ${Date.now()}`;
    const createResult = await createPlaylist(testPlaylistName);
    if (createResult.success) {
      console.log(`✓ Created playlist: ${testPlaylistName}`);

      const deleteResult = await deletePlaylist(testPlaylistName);
      if (deleteResult.success) {
        console.log(`✓ Deleted playlist: ${testPlaylistName}\n`);
      } else {
        console.log(`⚠ Failed to delete: ${deleteResult.error}\n`);
      }
    } else {
      console.log(`⚠ Failed to create: ${createResult.error}\n`);
    }

    console.log('✅ All tests completed!');
    console.log('\nNote: Some tests may show warnings if Music.app has limited content or is not playing.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMusicSkill();
```

### Execution

```bash
cd /Users/brokkrbot/brokkr-agent
node skills/music/manual-test.js
```

**Expected Output (example):**
```
Starting Music skill integration test...

1. Checking player state...
✓ Player state: paused

2. Getting library statistics...
✓ Library has 42 tracks and 3 playlists

3. Searching library...
✓ Found 3 tracks:
  - Song Name by Artist Name
  - Another Song by Artist
  - Third Song by Artist

4. Checking playback status...
✓ Is playing: false

5. Skipping now playing (nothing playing)

6. Listing playlists...
✓ Found 3 playlists:
  - Library
  - My Favorites
  - Workout Mix

7. Testing playlist creation...
✓ Created playlist: Test Playlist 1738501234567
✓ Deleted playlist: Test Playlist 1738501234567

✅ All tests completed!
```

### Verification

```bash
# Run all unit tests
npm test -- skills/music/tests/
```

**Expected:** Manual test completes successfully, all unit tests pass.

**Commit:** `test(music): add integration test script`

---

## Completion Checklist

- [ ] AppleScript utilities module
- [ ] Playback control module
- [ ] Now playing info module
- [ ] Library search module
- [ ] Playlist management module
- [ ] Skill documentation complete
- [ ] Integration testing passed
- [ ] All unit tests passing
- [ ] Code committed with descriptive messages

## Success Criteria

1. All unit tests pass (`npm test -- skills/music/tests/`)
2. Manual integration test completes successfully
3. Playback control works (play/pause/next/prev)
4. Library search returns relevant results
5. Playlist creation and deletion works
6. Error handling provides clear messages
7. Skill documentation explains all capabilities

## Future Enhancements

- Smart playlists based on criteria (genre, year, rating)
- Lyrics retrieval and display
- Track rating management
- Shuffle and repeat mode control
- AirPlay device selection
- Integration with Apple Music subscription features
- Automated playlist generation based on mood/activity
- Voice control via macOS Speech Recognition

## Documentation Updates

After completion, update:
1. `/Users/brokkrbot/brokkr-agent/CLAUDE.md` - Add Music skill to capabilities
2. `/Users/brokkrbot/brokkr-agent/docs/concepts/2026-01-31-brokkr-self-improvement-system.md` - Mark Music skill as complete

---

**Implementation Notes:**

- Works only with tracks in Music library (not streaming content)
- AppleScript timeout protection prevents hanging
- Music.app is auto-launched if not running
- All track operations check player state first
- Error messages distinguish between "not playing" and "streaming content"
- Playlist operations use user playlists (not smart playlists)
- Search uses Music.app's built-in search functionality
