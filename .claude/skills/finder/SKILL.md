---
name: finder
description: Control Finder - navigate folders, manage files, search filesystem
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Finder Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill is a placeholder scaffold. Implementation pending.

## Planned Capabilities

- Navigate to folders in Finder
- Get selected items in Finder
- Move, copy, rename files via Finder
- Create new folders
- Search for files using Spotlight
- Get file metadata (creation date, size, etc.)
- Manage tags on files
- Open files with specific applications
- Reveal files in Finder

## Usage

### Via Command (Manual)
```
/finder open "~/Documents"
/finder search "project notes"
/finder reveal "/path/to/file"
/finder tag "important" "/path/to/file"
```

### Via Notification (Automatic)
Triggered when file management is needed by other skills.

## Technical Approach

Uses AppleScript via `osascript` to interact with Finder.app, combined with
`mdfind` for Spotlight searches.

## Reference Documentation

See `reference/` directory for detailed docs (to be added).

## Dependencies

- macOS Finder
- AppleScript access permissions
- Spotlight indexing enabled

## Next Steps

- [ ] Research Finder AppleScript dictionary
- [ ] Implement basic navigation
- [ ] Implement file operations (copy, move, rename)
- [ ] Add Spotlight search integration
- [ ] Implement tagging support
- [ ] Create test suite
