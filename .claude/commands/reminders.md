---
name: reminders
description: Manage Apple Reminders - list, create, complete, delete tasks
argument-hint: <action> [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Reminders skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Available Actions

- `list [list-name]` - List all reminders or from a specific list
- `create "<title>" [--due <date>] [--list <name>]` - Create a reminder
- `complete <reminder-id>` - Mark reminder as done
- `update <reminder-id> [--due <date>] [--notes <text>]` - Update reminder
- `delete <reminder-id>` - Delete a reminder

## Examples

```
/reminders list
/reminders list "Agent Tasks"
/reminders create "Review code changes" --due tomorrow
/reminders create "Call Tommy" --due "2pm" --list "Agent Tasks"
/reminders complete abc123
/reminders delete abc123
```

## Skill Location

`skills/reminders/SKILL.md`
