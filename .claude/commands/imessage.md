---
name: imessage
description: Process iMessage notification or send message to Tommy
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the iMessage skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
