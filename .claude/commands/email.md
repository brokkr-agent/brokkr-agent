---
name: email
description: Read, compose, and manage email via Apple Mail
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the email skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
