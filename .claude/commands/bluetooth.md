---
name: bluetooth
description: Control Bluetooth power and manage device connections
argument-hint: [action] [device-name]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Bluetooth skill and process: $ARGUMENTS

Available actions:
- power on/off/toggle
- list (paired/connected devices)
- connect <device-name>
- disconnect <device-name>
- status <device-name>
- research <device-name> (deploy device-researcher subagent)

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
