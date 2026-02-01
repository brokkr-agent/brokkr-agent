---
name: calendar
description: Manage Apple Calendar events - list, create, update, delete
argument-hint: <action> [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Calendar skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Available Actions

- `list [date]` - List events for today or specified date
- `create "<title>" <date> <time>` - Create a new event
- `update <event-id> [--time <time>] [--location <loc>]` - Update event
- `delete <event-id>` - Delete an event

## Examples

```
/calendar list today
/calendar list 2026-02-15
/calendar create "Team standup" tomorrow 9am
/calendar update abc123 --time 10am
/calendar delete abc123
```

## Skill Location

`skills/calendar/SKILL.md`
