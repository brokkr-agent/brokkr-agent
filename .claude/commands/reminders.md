---
name: reminders
description: Manage Reminders.app - list, create, complete, modify reminders
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the reminders skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
