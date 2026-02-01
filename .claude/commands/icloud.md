---
name: icloud
description: Manage iCloud storage paths for recordings, exports, attachments, and research
argument-hint: [action] [category] [filename]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the iCloud skill and process: $ARGUMENTS

Available actions:
- path <category> [filename] - Get storage path
- ensure <category> - Ensure directory exists
- list <category> - List today's files in category

Categories:
- recordings - Screen recordings, audio files
- exports - Generated reports, documents
- attachments - Downloaded files, email attachments
- research - Agent research outputs

Examples:
```
/icloud path recordings capture.mov
/icloud ensure exports
/icloud list research
```
