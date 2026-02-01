---
name: notes
description: Manage Apple Notes - create, search, append, and organize notes
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Notes Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill scaffold validates the directory structure. Implementation pending.

## Capabilities (Planned)

- Create new notes
- Search notes by title or content
- Append content to existing notes
- List notes in a folder
- Move notes between folders
- Delete notes
- Integration with notification system
- iCloud storage for note exports

## Usage

### Via Command (Manual)
```
/notes create "<title>" --body "<content>"
/notes search "<query>"
/notes append "<note-title>" "<content>"
/notes list [folder]
/notes delete "<note-title>"
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met:
- Notes shared with agent account
- `[AGENT]` in note title

## Reference Documentation

See `reference/` directory for detailed docs (to be populated).

## Integration Points

- **Notification Filter:** Notes with `[AGENT]` tag are queued for processing
- **iCloud Storage:** Note exports saved to `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/`
- **AppleScript:** Primary interface for Notes.app automation
