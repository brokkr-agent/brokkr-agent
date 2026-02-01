# Claude Code Configuration Directory

This directory contains Claude Code customizations for the Brokkr agent system.

## Directory Structure

```
.claude/
├── CLAUDE.md              # This file - structure standards
├── settings.local.json    # Local settings (gitignored)
├── commands/              # Slash commands for manual invocation
│   └── <name>.md
├── agents/                # Custom subagent definitions
│   └── <name>.md
└── skills/                # Self-contained skill packages
    └── <name>/
        ├── SKILL.md       # Main instructions (required)
        ├── config.json    # Skill configuration
        ├── lib/           # JavaScript modules
        ├── reference/     # Documentation
        ├── scripts/       # Shell/AppleScript automation
        └── tests/         # Test files
```

---

## Skills

### Location
All skills MUST be in `.claude/skills/<name>/` to be auto-discovered by Claude Code.

### Required Files

**SKILL.md** (required):
```yaml
---
name: <skill-name>
description: <Clear description including when to use>
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# <Skill Name>

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER | IMPLEMENTED

## Capabilities
- Capability 1
- Capability 2

## Usage

### Via Command (Manual)
/<command> <action>

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.
```

**config.json** (required):
```json
{
  "name": "<skill-name>",
  "version": "0.0.1",
  "status": "placeholder | implemented",
  "notificationTriggers": {
    "bundleId": "com.apple.<app>",
    "patterns": []
  }
}
```

### Apple Integration Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| imessage | `/imessage` | Messages.app via AppleScript + SQLite |
| mail | `/mail` | Mail.app via AppleScript |
| calendar | `/calendar` | Calendar.app via AppleScript |
| reminders | `/reminders` | Reminders.app via AppleScript |
| notes | `/notes` | Notes.app via AppleScript |
| contacts | `/contacts` | Contacts.app via AppleScript |
| chrome | `/chrome` | Chrome browser automation |
| finder | `/finder` | Finder & file system operations |
| music | `/music` | Music.app playback control |
| bluetooth | `/bluetooth` | Bluetooth via blueutil CLI |
| notifications | `/notifications` | Central notification monitor |
| icloud | `/icloud` | iCloud Drive storage operations |
| shortcuts | `/shortcuts` | Apple Shortcuts bridge |
| screen-capture | `/record` | Screen recording via screencapture |
| video-creation | `/video` | Video rendering via Remotion |

---

## Commands

### Location
`.claude/commands/<name>.md`

### Format
```yaml
---
name: <command-name>
description: <Brief description>
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the <skill> skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

### Naming Convention
- Command name matches skill name (e.g., `imessage.md` → `/imessage`)
- Exception: `record.md` → `/record` (for screen-capture skill)
- Exception: `video.md` → `/video` (for video-creation skill)

---

## Subagents

### Location
`.claude/agents/<name>.md`

### Format
```yaml
---
name: <agent-name>
description: <When Claude should delegate to this agent>
tools: Read, Grep, Glob  # Restricted tool set
model: haiku | sonnet | opus
permissionMode: default | dontAsk | bypassPermissions
---

<Agent instructions>

## Output Format
<Expected output structure, usually JSON>
```

### Standard Subagents

| Agent | Model | Purpose |
|-------|-------|---------|
| notification-processor | haiku | Tier 2 notification evaluation (only if Tier 1 unsure) |
| device-researcher | sonnet | Research new Bluetooth device capabilities |
| content-analyzer | sonnet | Analyze video content for chapters |

---

## Shared Libraries

Shared code lives in the root `lib/` directory (not `.claude/`).

### Notification System

| File | Purpose |
|------|---------|
| `lib/notification-filter.js` | Tier 1 core logic - instant filtering, no AI |
| `lib/notification-context.js` | Pass notification data to agent |
| `lib/icloud-storage.js` | Standardized iCloud paths |

### Three-Tier Notification Processing

```
Tier 1: lib/notification-filter.js
        Pure JS rules, <1ms, no AI
        Returns: drop | queue | unsure
                    ↓
Tier 2: .claude/agents/notification-processor.md
        Only if Tier 1 returns 'unsure'
        Haiku model, ~500ms
                    ↓
Tier 3: Agent execution flow
        command → skill(s) → review → execute
```

---

## iCloud Storage

All large files stored in iCloud with standardized paths:

```
~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/
├── Recordings/YYYY-MM-DD/    # Screen recordings, audio
├── Exports/YYYY-MM-DD/       # Generated content, reports
├── Attachments/YYYY-MM-DD/   # Email attachments, downloads
└── Research/YYYY-MM-DD/      # Agent research outputs
```

Use `lib/icloud-storage.js`:
```javascript
import { getPath } from '../../lib/icloud-storage.js';
const outputPath = getPath('recordings', 'screen-capture.mov');
```

---

## Creating New Skills

1. Create directory: `.claude/skills/<name>/`
2. Create `SKILL.md` with standard header
3. Create `config.json` with notification triggers
4. Create `lib/<name>.js` with placeholder exports
5. Create `.claude/commands/<name>.md`
6. Add notification filter rules to `lib/notification-filter.js`
7. Update this file's skill table

### Checklist
- [ ] SKILL.md with YAML frontmatter
- [ ] config.json with status and triggers
- [ ] lib/<name>.js module
- [ ] .claude/commands/<name>.md
- [ ] Reference to architecture doc in SKILL.md
- [ ] Notification criteria defined

---

## Architecture Reference

Full architecture documentation:
- `docs/concepts/2026-02-01-apple-integration-architecture.md`

Sprint planning:
- `docs/plans/sprint-apple-integration.md`

Individual skill plans:
- `docs/plans/2026-02-01-<skill>-skill-plan.md`
