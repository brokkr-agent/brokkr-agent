---
name: music
description: Control Apple Music - play, pause, search, manage playback
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Music skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Skill Location

`skills/music/SKILL.md`

## Quick Reference

**Playback:**
```
/music play
/music pause
/music stop
/music next
/music prev
```

**Play specific content:**
```
/music play "Dark Side of the Moon"
/music play artist "Pink Floyd"
/music play playlist "Chill Vibes"
```

**Search:**
```
/music search "Beatles"
/music search album "Abbey Road"
```

**Volume:**
```
/music volume 50
/music volume up
/music volume down
```

**Info:**
```
/music now
/music playlists
```

**Modes:**
```
/music shuffle on
/music repeat all
```

## Status

PLACEHOLDER - Not yet implemented. See `skills/music/SKILL.md` for roadmap.
