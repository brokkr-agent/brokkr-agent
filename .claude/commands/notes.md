---
name: notes
description: Manage Notes.app - create, search, read, append, modify notes
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the notes skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Available Actions

### Listing
- `folders` - List all folders
- `list [folder]` - List notes in folder (default: "Notes")
- `recent [count]` - List recently modified notes (default: 10)

### Reading
- `find "<query>"` - Find notes by title
- `read <note-id>` - Read full note content
- `search "<query>"` - Search notes by content

### Writing
- `create "<title>" "<body>" [folder]` - Create new note
- `append <note-id> "<content>"` - Append to existing note
- `modify <note-id> [--title "..."] [--body "..."]` - Modify note

### Deleting
- `delete <note-id>` - Delete note (moves to Recently Deleted)

## Examples

```
/notes folders
/notes list
/notes list "Work"
/notes recent 5
/notes create "Meeting Notes" "Discussed Q1 goals"
/notes create "Project Idea" "New feature concept" "Ideas"
/notes find "meeting"
/notes read x-coredata://...
/notes search "project ideas"
/notes append x-coredata://... "Action item: Follow up"
/notes modify x-coredata://... --title "Updated Title"
/notes delete x-coredata://...
```

## Skill Location

`skills/notes/SKILL.md`
