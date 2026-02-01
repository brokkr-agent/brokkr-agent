---
name: finder
description: Control Finder - navigate folders, manage files, search filesystem
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Finder skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Skill Location

`skills/finder/SKILL.md`

## Quick Reference

**Navigation:**
```
/finder open "~/Documents"
/finder reveal "/path/to/file"
```

**File operations:**
```
/finder move /source /dest
/finder copy /source /dest
/finder rename /path/file.txt newname.txt
/finder mkdir ~/Documents/NewFolder
```

**Search:**
```
/finder search "project notes"
/finder search "kind:pdf" --scope ~/Documents
```

**Tags:**
```
/finder tag "important" /path/to/file
/finder untag "old" /path/to/file
/finder tags /path/to/file
```

**Selection:**
```
/finder selection
```

## Status

PLACEHOLDER - Not yet implemented. See `skills/finder/SKILL.md` for roadmap.
