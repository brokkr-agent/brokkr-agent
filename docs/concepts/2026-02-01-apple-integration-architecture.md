# Apple Integration Architecture Concept

## Overview

Establishes standardized patterns for all Apple Integration skills. Ensures consistency across iMessage, Email, Calendar, Notes, Reminders, Bluetooth, Chrome, Finder, Music, and other integrations.

## Research Summary

### Official Documentation Sources
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Code Subagents Documentation](https://code.claude.com/docs/en/sub-agents)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Agent Skills Specification](https://agentskills.io)
- [Claude Code Changelog v2.1.29](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Key Capabilities (v2.1.29)
- Skills support YAML frontmatter with `context: fork`, `agent:`, `skills:`, `hooks:`
- Commands and skills merged - skills recommended for bundled resources
- Custom subagents defined in `.claude/agents/` with tool/model/permission control
- Hooks support `Notification` event with type-specific matchers
- Agent hooks can run multi-turn LLM evaluation before decisions

---

## Architecture Principles

### 1. iCloud Storage for Large Files

All large files (recordings, exports, attachments, research docs) stored in iCloud with standardized organization:

```
~/Library/Mobile Documents/com~apple~CloudDocs/
└── Brokkr/
    ├── Recordings/              # Screen recordings, audio
    │   └── YYYY-MM-DD/
    ├── Exports/                 # Generated content, reports
    │   └── YYYY-MM-DD/
    ├── Attachments/             # Email attachments, downloads
    │   └── YYYY-MM-DD/
    └── Research/                # Agent research outputs
        └── YYYY-MM-DD/
```

**Pattern:** All skills use `lib/icloud-storage.js` helper for consistent paths.

### 2. Notification Processing Pipeline

Each integration that receives notifications follows this flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NOTIFICATION PROCESSING                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌────────────────┐     ┌──────────────────┐  │
│  │ Notification │ ──▶ │ Logical Filter │ ──▶ │ Queue Decision   │  │
│  │ Monitor      │     │ (per-skill)    │     │                  │  │
│  └──────────────┘     └────────────────┘     └──────────────────┘  │
│         │                     │                       │             │
│         │                     │                       ▼             │
│         │                     │              ┌──────────────────┐  │
│         │                     │              │ Drop / Log Only  │  │
│         │                     │              └──────────────────┘  │
│         │                     │                       │             │
│         │                     ▼                       │             │
│         │              ┌────────────────┐             │             │
│         │              │ Queue Job with │ ◀───────────┘             │
│         │              │ Custom Command │                           │
│         │              └────────────────┘                           │
│         │                     │                                     │
│         │                     ▼                                     │
│         │              ┌────────────────┐                           │
│         │              │ Worker Loads   │                           │
│         │              │ Required Skills│                           │
│         │              └────────────────┘                           │
│         │                     │                                     │
│         │                     ▼                                     │
│         │              ┌────────────────┐                           │
│         │              │ Agent Executes │                           │
│         │              │ with Context   │                           │
│         │              └────────────────┘                           │
│         │                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Logical Filter Criteria (per integration):**

| Integration | Queue If | Drop If |
|-------------|----------|---------|
| iMessage | From known contacts, contains command prefix | Spam, unknown numbers, group chats |
| Email | Marked important, from whitelist, actionable keywords | Marketing, bulk, newsletters |
| Calendar | Reminder for event with agent notes | Past events, declined events |
| Reminders | Has agent tag, near due date | Already completed |
| System | Focus mode changes, device connects | Routine battery/wifi |

### 3. Custom Commands Per Integration

Each integration defines a command that:
1. Loads the integration's skill(s)
2. Provides notification context
3. Enables both agent and manual invocation

**Command Location:** `.claude/commands/<integration>.md`

**Skill Location:** `skills/<integration>/SKILL.md`

**Pattern:**

```yaml
# .claude/commands/imessage.md
---
name: imessage
description: Process iMessage notification or send message
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the iMessage skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

### 4. Skill Structure Standard

All Apple Integration skills follow this structure:

```
skills/<integration>/
├── SKILL.md                    # Main instructions
├── config.json                 # Integration-specific config
├── lib/
│   ├── <integration>.js        # Core functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── *.md
├── scripts/                    # Reusable automation scripts
│   └── *.sh
└── tests/
    └── *.test.js
```

**SKILL.md Standard Header:**

```yaml
---
name: <integration>
description: <Clear description including when to use>
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# <Integration> Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Capability 1
- Capability 2

## Usage

### Via Command (Manual)
```
/imessage send "Hello" to +1234567890
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.

## Reference Documentation

See `reference/` directory for detailed docs.
```

### 5. Custom Subagents

Define integration-specific subagents for specialized tasks:

**Location:** `.claude/agents/<integration>-<task>.md`

**Standard Subagents:**

| Subagent | Purpose | Tools |
|----------|---------|-------|
| `notification-processor` | Evaluate if notification warrants agent action | Read, Grep |
| `device-researcher` | Research newly connected devices | Read, Grep, Glob, WebSearch, WebFetch |
| `content-analyzer` | Analyze attachments, recordings, exports | Read, Grep, Task |

**Example: Notification Processor Subagent**

```yaml
# .claude/agents/notification-processor.md
---
name: notification-processor
description: Evaluate system notifications and decide if agent should be queued
tools: Read, Grep
model: haiku
permissionMode: dontAsk
---

You are a notification filter. Analyze the notification and decide:

1. Should the agent be queued? (yes/no)
2. What command should be issued?
3. What priority? (CRITICAL/HIGH/NORMAL/LOW)

Notification data: $ARGUMENTS

Decision criteria:
- iMessage from known contact with command → CRITICAL
- Email marked important with action needed → HIGH
- Calendar reminder with agent notes → NORMAL
- Routine system notifications → DROP

Output JSON:
{
  "queue": true/false,
  "command": "/imessage respond ...",
  "priority": "HIGH",
  "reason": "Why this decision"
}
```

### 6. Hooks Configuration

**Location:** `.claude/settings.json` (project-level)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Apple Integration skills available. Use /help for commands.'"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "notification-processor",
        "hooks": [
          {
            "type": "command",
            "command": "cat ~/.claude/notification-context.json"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/cleanup-temp-files.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Standard Files

### Shared Library: `lib/icloud-storage.js`

```javascript
const path = require('path');
const fs = require('fs');

const ICLOUD_BASE = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Brokkr'
);

const CATEGORIES = {
  recordings: 'Recordings',
  exports: 'Exports',
  attachments: 'Attachments',
  research: 'Research'
};

function getDateFolder() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function ensureDirectory(category) {
  const dir = path.join(ICLOUD_BASE, CATEGORIES[category], getDateFolder());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getPath(category, filename) {
  const dir = ensureDirectory(category);
  return path.join(dir, filename);
}

module.exports = { ICLOUD_BASE, ensureDirectory, getPath };
```

### Shared Library: `lib/notification-context.js`

```javascript
const fs = require('fs');
const path = require('path');

const CONTEXT_FILE = '/tmp/brokkr-notification-context.json';

function setNotificationContext(data) {
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2));
}

function getNotificationContext() {
  try {
    return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function clearNotificationContext() {
  try {
    fs.unlinkSync(CONTEXT_FILE);
  } catch {}
}

module.exports = { setNotificationContext, getNotificationContext, clearNotificationContext };
```

---

## Integration Checklist

When creating a new Apple Integration skill:

- [ ] Create `skills/<integration>/SKILL.md` with standard header
- [ ] Create `skills/<integration>/config.json` for integration config
- [ ] Create `skills/<integration>/lib/<integration>.js` for core logic
- [ ] Create `.claude/commands/<integration>.md` for manual invocation
- [ ] Define notification filter criteria in processor subagent
- [ ] Add iCloud storage paths for any large file output
- [ ] Create reference docs in `skills/<integration>/reference/`
- [ ] Write tests in `skills/<integration>/tests/`
- [ ] Update sprint index with new plan status

---

## Open Questions

1. Should notification monitor be a single process or per-integration?
2. How to handle rate limiting for rapid notification bursts?
3. Should device research results be shared across skills?

## Next Steps

- [ ] Update existing Bluetooth plan to follow these patterns
- [ ] Create notification-processor subagent definition
- [ ] Implement `lib/icloud-storage.js` shared library
- [ ] Update all Phase 1-6 plans with standardized structure
