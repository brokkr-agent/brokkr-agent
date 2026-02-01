---
name: record
description: Start or stop screen recording using macOS screencapture
argument-hint: [stop|window|region] [--duration <seconds>]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the screen-capture skill and process: $ARGUMENTS

Available actions:
- (no args) - Start full-screen recording
- stop - Stop current recording
- window - Record specific window (will list available windows)
- region - Record a screen region (interactive selection)
- --duration <seconds> - Record for specified duration
- --window <id> - Record specific window by ID
- status - Check if recording is in progress
- list - List available recordings (alias: /recordings)

Examples:
- /record - Start continuous full-screen recording
- /record stop - Stop the current recording
- /record --duration 30 - Record for 30 seconds
- /record window - Show window list and record selected window

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
