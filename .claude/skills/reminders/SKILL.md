---
name: reminders
description: Manage Apple Reminders - list, create, complete, and organize tasks
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Reminders Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill scaffold validates the directory structure. Implementation pending.

## Capabilities (Planned)

- List reminders by list or due date
- Create new reminders with due dates
- Mark reminders as complete
- Update reminder details (due date, notes, priority)
- Delete reminders
- Create and manage reminder lists
- Integration with notification system
- iCloud storage for reminder exports

## Usage

### Via Command (Manual)
```
/reminders list
/reminders list "Agent Tasks"
/reminders create "Review PR" --due tomorrow
/reminders complete <reminder-id>
/reminders delete <reminder-id>
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met:
- Reminders in "Agent Tasks" list are auto-queued as CRITICAL
- `[AGENT]` in reminder title
- Due within 1 hour -> HIGH priority

## Reference Documentation

See `reference/` directory for detailed docs (to be populated).

## Integration Points

- **Notification Filter:** Reminders in "Agent Tasks" or "Brokkr" lists are auto-queued as CRITICAL
- **iCloud Storage:** Reminder exports saved to `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/`
- **AppleScript:** Primary interface for Reminders.app automation
