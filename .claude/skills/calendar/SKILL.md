---
name: calendar
description: Manage Apple Calendar - list, create, update, and delete events
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Calendar Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill scaffold validates the directory structure. Implementation pending.

## Capabilities (Planned)

- List events for a date range
- Create new calendar events
- Update existing events (time, location, notes)
- Delete events
- Handle event reminders and alerts
- Integration with notification system
- iCloud storage for event exports

## Usage

### Via Command (Manual)
```
/calendar list today
/calendar create "Meeting with Tommy" tomorrow 2pm
/calendar update <event-id> --time 3pm
/calendar delete <event-id>
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met:
- Event reminders (15 min, 5 min before)
- `[AGENT]` or `[BROKKR]` in event title/notes

## Reference Documentation

See `reference/` directory for detailed docs (to be populated).

## Integration Points

- **Notification Filter:** Calendar events with `[AGENT]` tag are auto-queued as CRITICAL
- **iCloud Storage:** Event exports saved to `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/`
- **AppleScript:** Primary interface for Calendar.app automation
