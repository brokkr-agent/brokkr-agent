---
name: notifications
description: Monitor and process macOS Notification Center notifications
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Notifications skill and process: $ARGUMENTS

Available actions:
- status - Check notification monitor status
- recent [count] - List recent notifications
- rules - Show active trigger rules
- test <rule-name> - Test a specific rule

This skill is the central notification monitor that invokes other skills:
- iMessage notifications -> /imessage skill
- Mail notifications -> /mail skill
- Calendar notifications -> /calendar skill

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
