---
name: mail
description: Read, compose, and manage email via Apple Mail
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the email skill and process: $ARGUMENTS

## Skill Location

`skills/email/SKILL.md`

## Available Actions (Planned)

- (no args) - Check inbox summary
- `read <id>` - Read specific message
- `compose <to> <subject>` - Compose new email
- `reply <id>` - Reply to message
- `search <query>` - Search messages
- `flag <id>` - Toggle flag on message
- `folders` - List all mailboxes
- `triage` - Identify urgent messages

## Context

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Implementation Status

This command is a PLACEHOLDER. The email skill is not yet implemented.
See `docs/plans/2026-02-01-email-skill-plan.md` for implementation details.
