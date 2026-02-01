---
name: video
description: Create and manage tutorial videos using Remotion
argument-hint: <create|render|preview|share|list> [recording] [--title "Title"]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the video-creation skill and process: $ARGUMENTS

Available actions:
- create "Title" - Full workflow: render most recent recording + share to iCloud
- render <recording> --title "Title" - Render specific recording with Remotion
- preview - Open Remotion Studio for live preview
- share <video> - Share video to iCloud Family Sharing
- list - List available rendered videos

Examples:
- /video create "How to Use Brokkr" - Create video from most recent recording
- /video render recording-2026-02-01.mov --title "Demo" - Render specific recording
- /video preview - Open Remotion Studio
- /video share tutorial.mp4 - Share to iCloud Family Sharing
- /video list - Show all rendered videos

Workflow:
1. /record - Capture screen activity
2. /video create "Title" - Process with Remotion
3. Video automatically shared via iCloud

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
