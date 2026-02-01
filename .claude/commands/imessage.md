---
name: imessage
description: Process iMessage notification or send message to Tommy
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the iMessage skill and process: $ARGUMENTS

## Skill Location

`skills/imessage/SKILL.md`

## Available Actions (Planned)

- `send <message>` - Send a message to Tommy
- `check` - Check for new messages
- `status` - Show iMessage bot status

## Context

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Implementation Status

This command is a PLACEHOLDER. The iMessage skill is not yet implemented.
See `docs/plans/2026-02-01-imessage-skill-plan.md` for implementation details.
