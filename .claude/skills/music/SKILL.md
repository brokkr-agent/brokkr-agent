---
name: music
description: Control Apple Music - play, pause, search, manage playback
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Music Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill is a placeholder scaffold. Implementation pending.

## Planned Capabilities

- Play/pause/stop playback
- Skip to next/previous track
- Search music library
- Play specific songs, albums, or playlists
- Control volume
- Get current track information
- Create and manage playlists
- Add songs to queue
- Control shuffle and repeat modes

## Usage

### Via Command (Manual)
```
/music play
/music pause
/music play "Dark Side of the Moon"
/music search "Beatles"
/music volume 50
```

### Via Notification (Automatic)
Triggered when music control is requested by other skills.

## Technical Approach

Uses AppleScript via `osascript` to interact with Music.app (formerly iTunes).

## Reference Documentation

See `reference/` directory for detailed docs (to be added).

## Dependencies

- Apple Music app
- AppleScript access permissions
- Music library configured

## Next Steps

- [ ] Research Music.app AppleScript dictionary
- [ ] Implement playback controls (play, pause, stop, skip)
- [ ] Implement search functionality
- [ ] Add playlist management
- [ ] Implement queue management
- [ ] Create test suite
