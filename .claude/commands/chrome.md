---
name: chrome
description: Control Google Chrome - navigate, interact with pages, extract content
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Chrome skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Skill Location

`skills/chrome/SKILL.md`

## Quick Reference

**Navigation:**
```
/chrome open "https://example.com"
/chrome navigate "https://other.com"
/chrome refresh
/chrome close
```

**Content extraction:**
```
/chrome extract "h1"
/chrome execute "document.title"
```

**Screenshots:**
```
/chrome screenshot
/chrome screenshot --output ~/Desktop/page.png
```

**Tab management:**
```
/chrome tabs
/chrome switch 2
```

## Status

PLACEHOLDER - Not yet implemented. See `skills/chrome/SKILL.md` for roadmap.
