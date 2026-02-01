---
name: notes
description: Manage Apple Notes - create, search, append, list, delete notes
argument-hint: <action> [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Notes skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Available Actions

- `create "<title>" --body "<content>"` - Create a new note
- `search "<query>"` - Search notes by title or content
- `append "<note-title>" "<content>"` - Append to existing note
- `list [folder]` - List notes, optionally by folder
- `get "<note-title>"` - Get full note content
- `delete "<note-title>"` - Delete a note

## Examples

```
/notes create "Meeting Notes" --body "Discussed Q1 goals"
/notes search "project ideas"
/notes append "Meeting Notes" "Action item: Follow up with Tommy"
/notes list
/notes list "Brokkr"
/notes get "Meeting Notes"
/notes delete "Old Draft"
```

## Skill Location

`skills/notes/SKILL.md`
