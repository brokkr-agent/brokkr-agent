---
name: screen-capture
description: Screen recording using macOS native screencapture. Use for capturing tutorials, demos, and screen content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Screen Capture Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Overview

Capture screen recordings using macOS native `screencapture -v` command. Recordings are stored in iCloud for automatic sync and sharing.

## Capabilities

- Full-screen recording
- Window-specific recording with `-l <windowid>`
- Region selection recording with `-R <x,y,w,h>`
- Timed recordings with `-V <seconds>`
- Cursor capture with `-C` flag
- Audio source selection with `-G <audioid>`
- Sound suppression with `-x` flag
- Delayed start with `-T <seconds>`

## Usage

### Via Command (Manual)
```
/record                      # Start full-screen recording
/record window               # Record specific window (will list windows)
/record region               # Record screen region (interactive)
/record stop                 # Stop current recording
/record --duration 30        # Record for 30 seconds
/record --window <id>        # Record specific window by ID
/recordings                  # List available recordings
```

### Via Notification (Automatic)
Can be triggered by calendar events with [AGENT] marker for scheduled recordings.

## Configuration

**Config file:** `skills/screen-capture/config.json`

```json
{
  "recordings_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings",
  "default_format": "mov",
  "capture_cursor": true,
  "suppress_sounds": true
}
```

## iCloud Storage

Recordings are stored using `lib/icloud-storage.js`:
```
~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings/YYYY-MM-DD/
```

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/record.sh` | Start a recording |
| `scripts/stop.sh` | Stop current recording |
| `scripts/list-windows.sh` | List available windows with IDs |
| `scripts/list-recordings.sh` | List available recordings |
| `scripts/list-audio-sources.sh` | List audio input sources |

## Permission Requirements

1. **Screen Recording** (required):
   - System Settings -> Privacy & Security -> Privacy -> Screen Recording
   - Add Terminal.app

2. **Automation** (for window ID retrieval):
   - Allow Terminal to control target applications

## Lock File

Active recordings create a lock file at:
```
/Users/brokkrbot/brokkr-agent/recordings/.recording.lock
```

Contains:
- Line 1: Process ID
- Line 2: Output file path
- Line 3: Start timestamp

## Key Flags Reference

| Flag | Description |
|------|-------------|
| `-v` | Capture video (continuous) |
| `-V <seconds>` | Capture video for duration |
| `-C` | Capture cursor |
| `-x` | Suppress screenshot sounds |
| `-l <windowid>` | Capture specific window |
| `-R <x,y,w,h>` | Capture specific region |
| `-D <display>` | Capture specific display |
| `-G <audioid>` | Include audio source |
| `-T <seconds>` | Delay before capture |

## Workflow with Video Creation

1. Use `/record` to capture screen activity
2. Use `/video create "Title"` to process with Remotion
3. Video automatically shared via iCloud Family Sharing

## Limitations

1. **Format**: Only .mov output (QuickTime format)
2. **Audio**: System audio capture requires separate configuration
3. **Permissions**: Requires Screen Recording permission in System Settings
4. **RAM**: Large recordings can consume significant memory

## Reference Documentation

See `reference/` directory for detailed docs:
- `screencapture-cli.md` - CLI options and patterns
