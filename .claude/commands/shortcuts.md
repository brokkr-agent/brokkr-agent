---
name: shortcuts
description: Run and manage Apple Shortcuts from the command line
argument-hint: [action] [shortcut-name] [--input "text"]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Shortcuts skill and process: $ARGUMENTS

Available actions:
- list - List all available shortcuts
- run <name> - Run a shortcut
- run <name> --input "text" - Run with text input
- exists <name> - Check if shortcut exists

Examples:
```
/shortcuts list
/shortcuts run "AirPods Noise Control"
/shortcuts run "Process Text" --input "Hello World"
/shortcuts exists "Toggle Dark Mode"
```
