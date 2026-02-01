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

### 2. Notification Processing Pipeline (Three-Tier System)

Notifications are processed through three tiers, optimized for speed and efficiency:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THREE-TIER NOTIFICATION PROCESSING                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                           │
│  │ Notification │                                                           │
│  │ Received     │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TIER 1: CORE LOGIC (No Agent - Instant)                              │   │
│  │ ════════════════════════════════════════                             │   │
│  │ Pure JavaScript rules, no AI overhead, < 1ms                         │   │
│  │                                                                       │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                │   │
│  │  │ Blacklist   │   │ Whitelist   │   │ Pattern     │                │   │
│  │  │ Check       │   │ Check       │   │ Match       │                │   │
│  │  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                │   │
│  │         │                 │                 │                        │   │
│  │         ▼                 ▼                 ▼                        │   │
│  │    ┌─────────┐      ┌─────────┐      ┌───────────┐                  │   │
│  │    │  DROP   │      │  QUEUE  │      │  UNSURE   │                  │   │
│  │    │ (logged)│      │ CRITICAL│      │ → Tier 2  │                  │   │
│  │    └─────────┘      └─────────┘      └─────┬─────┘                  │   │
│  └─────────────────────────────────────────────┼───────────────────────┘   │
│                                                │                            │
│         ┌──────────────────────────────────────┘                            │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TIER 2: NOTIFICATION-PROCESSOR SUBAGENT (Only if unsure)             │   │
│  │ ════════════════════════════════════════════════════════             │   │
│  │ Haiku model, fast evaluation, ~500ms                                 │   │
│  │                                                                       │   │
│  │  Input: Notification + context                                       │   │
│  │  Output: { queue: bool, command: str, priority: str, reason: str }   │   │
│  │                                                                       │   │
│  │         ┌─────────┐              ┌─────────┐                         │   │
│  │         │  DROP   │              │  QUEUE  │                         │   │
│  │         │ (logged)│              │ + reason│                         │   │
│  │         └─────────┘              └────┬────┘                         │   │
│  └───────────────────────────────────────┼─────────────────────────────┘   │
│                                          │                                  │
│         ┌────────────────────────────────┘                                  │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TIER 3: AGENT EXECUTION FLOW                                         │   │
│  │ ════════════════════════════                                         │   │
│  │                                                                       │   │
│  │  ┌──────────┐   ┌──────────────┐   ┌────────────────┐               │   │
│  │  │ Command  │──▶│ Load Primary │──▶│ Review         │               │   │
│  │  │ Issued   │   │ Skill(s)     │   │ Notification   │               │   │
│  │  └──────────┘   └──────────────┘   └───────┬────────┘               │   │
│  │                                            │                         │   │
│  │                                            ▼                         │   │
│  │                                   ┌────────────────┐                 │   │
│  │                                   │ Need More      │                 │   │
│  │                                   │ Skills?        │                 │   │
│  │                                   └───────┬────────┘                 │   │
│  │                          ┌────────────────┼────────────────┐        │   │
│  │                          ▼                ▼                ▼        │   │
│  │                    ┌──────────┐    ┌──────────────┐  ┌──────────┐  │   │
│  │                    │ No       │    │ Load Add'l   │  │ Delegate │  │   │
│  │                    │ Continue │    │ Skills       │  │ Subagent │  │   │
│  │                    └────┬─────┘    └──────┬───────┘  └────┬─────┘  │   │
│  │                         │                 │               │        │   │
│  │                         └─────────────────┴───────────────┘        │   │
│  │                                            │                         │   │
│  │                                            ▼                         │   │
│  │                                   ┌────────────────┐                 │   │
│  │                                   │ Execute Task   │                 │   │
│  │                                   │ to Completion  │                 │   │
│  │                                   └────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tier 1: Core Logic (No Agent)

Pure JavaScript rules that execute instantly. **No AI overhead.**

**Location:** `lib/notification-filter.js`

```javascript
const RULES = {
  // BLACKLIST: Always drop (return 'drop')
  blacklist: {
    imessage: {
      senders: ['+1800*', '+1888*', '+1877*'],  // Toll-free (spam)
      patterns: [/^(?:spam|unsubscribe)/i]
    },
    email: {
      senders: ['*@marketing.*', '*@newsletter.*', 'noreply@*'],
      subjects: [/^(?:unsubscribe|sale|deal|offer)/i]
    },
    calendar: {
      titles: [/^(?:declined|cancelled)/i]
    },
    system: {
      apps: ['com.apple.wifi', 'com.apple.battery']
    }
  },

  // WHITELIST: Always queue with CRITICAL priority (return 'queue')
  whitelist: {
    imessage: {
      senders: ['+12069090025'],  // Tommy's phone
      patterns: [/^\//, /^brokkr/i]  // Command prefix
    },
    email: {
      senders: ['tommyjohnson90@gmail.com'],
      flags: ['flagged', 'important']
    },
    calendar: {
      patterns: [/\[AGENT\]/i, /\[BROKKR\]/i]
    },
    reminders: {
      lists: ['Agent Tasks'],
      patterns: [/\[AGENT\]/i]
    }
  },

  // PATTERNS: Specific matches → queue with priority (return 'queue' + priority)
  patterns: {
    imessage: [
      { match: /urgent/i, priority: 'CRITICAL' },
      { match: /when you can/i, priority: 'LOW' }
    ],
    email: [
      { match: /action required/i, priority: 'HIGH' },
      { match: /fyi/i, priority: 'LOW' }
    ]
  }
};

function filterNotification(notification) {
  const { type, sender, content, metadata } = notification;
  const typeRules = RULES[type] || {};

  // Check blacklist first (instant drop)
  if (matchesBlacklist(notification, typeRules.blacklist)) {
    return { decision: 'drop', reason: 'blacklisted', tier: 1 };
  }

  // Check whitelist (instant queue as CRITICAL)
  if (matchesWhitelist(notification, typeRules.whitelist)) {
    return {
      decision: 'queue',
      priority: 'CRITICAL',
      command: getCommandForType(type, notification),
      reason: 'whitelisted',
      tier: 1
    };
  }

  // Check patterns (queue with specific priority)
  const patternMatch = matchesPatterns(notification, typeRules.patterns);
  if (patternMatch) {
    return {
      decision: 'queue',
      priority: patternMatch.priority,
      command: getCommandForType(type, notification),
      reason: `pattern: ${patternMatch.match}`,
      tier: 1
    };
  }

  // No match → send to Tier 2
  return { decision: 'unsure', tier: 1 };
}

module.exports = { filterNotification, RULES };
```

**Performance:** < 1ms per notification

---

#### Tier 2: Notification Processor Subagent (Only If Unsure)

Only invoked when Tier 1 returns `unsure`. Uses Haiku for fast evaluation.

**Location:** `.claude/agents/notification-processor.md`

```yaml
---
name: notification-processor
description: Evaluate uncertain notifications - only called when core logic is unsure
tools: Read, Grep
model: haiku
permissionMode: dontAsk
---

You are evaluating a notification that didn't match clear rules.

## Notification Data
$ARGUMENTS

## Decision Criteria

**QUEUE if:**
- Sender has history of important messages (check recent context)
- Content implies action needed but uses unusual phrasing
- Time-sensitive information even without explicit markers
- Related to active projects or ongoing conversations

**DROP if:**
- Appears to be automated/bulk despite passing blacklist
- No actionable content after analysis
- Duplicate of recently processed notification
- Low relevance to current priorities

## Output Format (JSON only)

{
  "decision": "queue" | "drop",
  "priority": "CRITICAL" | "HIGH" | "NORMAL" | "LOW",
  "command": "/<integration> <action> <context>",
  "skills": ["primary-skill", "additional-skill-if-needed"],
  "reason": "Brief explanation"
}
```

**Performance:** ~500ms (Haiku is fast)

---

#### Tier 3: Agent Execution Flow

When a notification is queued, the agent follows this structured flow:

```
1. COMMAND ISSUED
   └─▶ Queue job with: command, priority, notification context

2. LOAD PRIMARY SKILL(S)
   └─▶ Based on command: /imessage → skills/imessage
   └─▶ Skills loaded into agent context

3. REVIEW NOTIFICATION
   └─▶ Agent reads full notification context
   └─▶ Understands: sender, content, metadata, history

4. DETERMINE ADDITIONAL SKILLS (if needed)
   └─▶ Email with attachment? → Load skills/icloud (for storage)
   └─▶ Message mentions calendar? → Load skills/calendar
   └─▶ Complex research needed? → Delegate to subagent

5. EXECUTE TASK
   └─▶ Perform requested action
   └─▶ Use loaded skills' capabilities
   └─▶ Store outputs in iCloud if applicable

6. COMPLETION
   └─▶ Send response via appropriate channel
   └─▶ Log action taken
   └─▶ Clear notification context
```

**Skill Loading Logic (in worker):**

```javascript
async function executeNotificationJob(job) {
  const { command, priority, notification } = job;

  // 1. Parse command to get primary skill
  const primarySkill = parseCommandSkill(command);

  // 2. Set notification context for agent
  setNotificationContext(notification);

  // 3. Build prompt with skill loading instructions
  const prompt = `
Load skill: ${primarySkill}

Notification context:
${JSON.stringify(notification, null, 2)}

Process this notification. After reviewing, determine if additional skills
are needed and load them. Then complete the task.

Available skills: imessage, email, calendar, reminders, notes, contacts,
chrome, finder, music, bluetooth, icloud, shortcuts, screen-capture, video-creation
`;

  // 4. Execute with Claude
  await executeWithClaude(prompt, { priority });

  // 5. Cleanup
  clearNotificationContext();
}
```

---

#### Tier 1 Filter Criteria by Integration

| Integration | DROP (Blacklist) | QUEUE CRITICAL (Whitelist) | QUEUE with Priority (Patterns) | UNSURE → Tier 2 |
|-------------|------------------|---------------------------|-------------------------------|-----------------|
| **iMessage** | Toll-free numbers, spam patterns | Tommy's phone, `/` prefix | `urgent` → CRITICAL | Unknown sender with substantive content |
| **Email** | Marketing domains, noreply | Tommy's email, flagged | `action required` → HIGH | Unknown sender, professional domain |
| **Calendar** | Declined/cancelled events | `[AGENT]` in notes | 15min reminder → NORMAL | Event from unknown organizer |
| **Reminders** | Completed items | Agent Tasks list | Due within 1hr → HIGH | Shared list updates |
| **System** | Wifi/battery changes | Focus mode → work | Device connect → NORMAL | Unusual system events |
| **Bluetooth** | Routine disconnects | Known device connect | New device paired → HIGH | Unknown device nearby |

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

| Subagent | Purpose | When Used | Tools | Model |
|----------|---------|-----------|-------|-------|
| `notification-processor` | Evaluate uncertain notifications (Tier 2 only) | Core logic returns `unsure` | Read, Grep | Haiku |
| `device-researcher` | Research newly connected devices | New Bluetooth device paired | Read, Grep, Glob, WebSearch, WebFetch | Sonnet |
| `content-analyzer` | Analyze attachments, recordings, exports | Media processing needed | Read, Grep, Task | Sonnet |

**Important:** The `notification-processor` is NOT called for every notification. It's only invoked when Tier 1 core logic cannot make a deterministic decision. Most notifications are filtered instantly by `lib/notification-filter.js` without any AI overhead.

**Example: Device Researcher Subagent**

```yaml
# .claude/agents/device-researcher.md
---
name: device-researcher
description: Research newly connected Bluetooth devices to discover capabilities
tools: Read, Grep, Glob, WebSearch, WebFetch
model: sonnet
permissionMode: default
---

Research the newly paired Bluetooth device and discover its capabilities.

## Device Information
$ARGUMENTS

## Research Goals

1. Identify device type and manufacturer
2. Find official documentation for device controls
3. Discover available commands/protocols
4. Document battery status capabilities (if applicable)
5. Find audio routing options (if applicable)

## Output

Create reference documentation at:
`skills/bluetooth/devices/<device-name>/reference.md`

Include:
- Device capabilities discovered
- Control scripts that work
- Known limitations
- Source URLs for documentation
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

### Core Library: `lib/notification-filter.js`

The Tier 1 filter that processes all notifications without AI overhead.

```javascript
/**
 * Notification Filter - Tier 1 Core Logic
 *
 * Processes notifications instantly using deterministic rules.
 * No AI invocation. < 1ms per notification.
 *
 * Returns:
 *   { decision: 'drop', reason, tier: 1 }
 *   { decision: 'queue', priority, command, reason, tier: 1 }
 *   { decision: 'unsure', tier: 1 } → sends to Tier 2 subagent
 */

const RULES = {
  // ═══════════════════════════════════════════════════════════════
  // BLACKLIST: Always drop instantly
  // ═══════════════════════════════════════════════════════════════
  blacklist: {
    imessage: {
      senders: [
        /^\+1800/,        // Toll-free
        /^\+1888/,
        /^\+1877/,
        /^\+1866/
      ],
      content: [
        /unsubscribe/i,
        /click here to stop/i,
        /reply stop/i
      ]
    },
    email: {
      senders: [
        /@marketing\./i,
        /@newsletter\./i,
        /@promo\./i,
        /^noreply@/i,
        /^no-reply@/i
      ],
      subjects: [
        /^(?:sale|deal|offer|discount)/i,
        /unsubscribe/i,
        /weekly digest/i
      ]
    },
    calendar: {
      titles: [
        /^declined:/i,
        /^cancelled:/i
      ]
    },
    system: {
      bundleIds: [
        'com.apple.wifi.proxy',
        'com.apple.battery',
        'com.apple.photoanalysisd'
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // WHITELIST: Always queue as CRITICAL
  // ═══════════════════════════════════════════════════════════════
  whitelist: {
    imessage: {
      senders: [
        '+12069090025'    // Tommy's phone
      ],
      content: [
        /^\//,            // Command prefix
        /^brokkr/i,       // Direct address
        /^hey brokkr/i
      ]
    },
    email: {
      senders: [
        'tommyjohnson90@gmail.com'
      ],
      flags: ['flagged', 'important'],
      subjects: [
        /\[AGENT\]/i,
        /\[BROKKR\]/i
      ]
    },
    calendar: {
      content: [
        /\[AGENT\]/i,
        /\[BROKKR\]/i
      ]
    },
    reminders: {
      lists: ['Agent Tasks', 'Brokkr'],
      content: [
        /\[AGENT\]/i
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // PATTERNS: Match → queue with specific priority
  // ═══════════════════════════════════════════════════════════════
  patterns: {
    imessage: [
      { match: /urgent/i, priority: 'CRITICAL' },
      { match: /asap/i, priority: 'HIGH' },
      { match: /when you (?:can|get a chance)/i, priority: 'LOW' },
      { match: /fyi/i, priority: 'LOW' }
    ],
    email: [
      { match: /action required/i, priority: 'HIGH' },
      { match: /please review/i, priority: 'NORMAL' },
      { match: /fyi|for your information/i, priority: 'LOW' }
    ],
    calendar: [
      { match: /interview/i, priority: 'HIGH' },
      { match: /deadline/i, priority: 'HIGH' }
    ],
    bluetooth: [
      { match: /airpods/i, priority: 'NORMAL' },
      { match: /new device/i, priority: 'HIGH' }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════
// COMMAND MAPPING: notification type → skill command
// ═══════════════════════════════════════════════════════════════
const COMMANDS = {
  imessage: (n) => `/imessage respond "${n.sender}"`,
  email: (n) => `/email process "${n.messageId}"`,
  calendar: (n) => `/calendar handle "${n.eventId}"`,
  reminders: (n) => `/reminders process "${n.reminderId}"`,
  bluetooth: (n) => `/bluetooth handle "${n.deviceId}"`,
  system: (n) => `/system handle "${n.type}"`
};

function matchesAny(value, patterns) {
  if (!patterns || !value) return false;
  return patterns.some(p => {
    if (p instanceof RegExp) return p.test(value);
    if (typeof p === 'string') return value.includes(p);
    return false;
  });
}

function filterNotification(notification) {
  const { type, sender, content, subject, metadata = {} } = notification;
  const blacklist = RULES.blacklist[type] || {};
  const whitelist = RULES.whitelist[type] || {};
  const patterns = RULES.patterns[type] || [];

  // ─────────────────────────────────────────────────────────────
  // BLACKLIST CHECK (instant drop)
  // ─────────────────────────────────────────────────────────────
  if (matchesAny(sender, blacklist.senders) ||
      matchesAny(content, blacklist.content) ||
      matchesAny(subject, blacklist.subjects) ||
      matchesAny(metadata.bundleId, blacklist.bundleIds)) {
    return { decision: 'drop', reason: 'blacklisted', tier: 1 };
  }

  // ─────────────────────────────────────────────────────────────
  // WHITELIST CHECK (instant queue as CRITICAL)
  // ─────────────────────────────────────────────────────────────
  if (matchesAny(sender, whitelist.senders) ||
      matchesAny(content, whitelist.content) ||
      matchesAny(subject, whitelist.subjects) ||
      (metadata.flags && whitelist.flags?.some(f => metadata.flags.includes(f))) ||
      (metadata.list && whitelist.lists?.includes(metadata.list))) {
    return {
      decision: 'queue',
      priority: 'CRITICAL',
      command: COMMANDS[type]?.(notification) || `/system handle`,
      reason: 'whitelisted',
      tier: 1
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PATTERN CHECK (queue with specific priority)
  // ─────────────────────────────────────────────────────────────
  const searchText = `${content || ''} ${subject || ''}`;
  for (const pattern of patterns) {
    if (pattern.match.test(searchText)) {
      return {
        decision: 'queue',
        priority: pattern.priority,
        command: COMMANDS[type]?.(notification) || `/system handle`,
        reason: `pattern: ${pattern.match}`,
        tier: 1
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // NO MATCH → Send to Tier 2 (notification-processor subagent)
  // ─────────────────────────────────────────────────────────────
  return { decision: 'unsure', tier: 1 };
}

module.exports = { filterNotification, RULES, COMMANDS };
```

---

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

## Design Decisions

### Resolved

1. **Single notification monitor process** - One `notification-monitor.js` handles all notification types, routes to appropriate skills via commands
2. **Three-tier processing** - Core logic (no AI) → Subagent (only if unsure) → Agent execution
3. **Device research in skill directory** - Results stored in `skills/bluetooth/devices/<device>/`

### Open Questions

1. How to handle rate limiting for rapid notification bursts? (Debounce? Queue batching?)
2. Should Tier 1 rules be configurable via JSON or hardcoded for performance?
3. How to handle notification context expiry? (TTL on temp files?)

## Next Steps

- [x] ~~Update existing Bluetooth plan to follow these patterns~~
- [x] ~~Create notification-processor subagent definition~~
- [x] ~~Update all Phase 1-6 plans with standardized structure~~
- [ ] Implement `lib/notification-filter.js` (Tier 1 core logic)
- [ ] Implement `lib/icloud-storage.js` shared library
- [ ] Implement `lib/notification-context.js` shared library
- [ ] Create `.claude/agents/notification-processor.md`
- [ ] Create `.claude/agents/device-researcher.md`
- [ ] Update `notification-monitor.js` to use three-tier system
