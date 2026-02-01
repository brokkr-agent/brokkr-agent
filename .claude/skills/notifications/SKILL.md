---
name: notifications
description: Central notification monitor for Apple Integration suite - evaluates and routes all system notifications. This is the CORE notification processing skill.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Notification Monitoring Skill

> **For Claude:** This skill is the CENTRAL notification monitor for the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: IMPLEMENTED

Core notification monitoring is fully functional:
- Database polling and binary plist parsing working
- Trigger rules engine with pattern matching
- Case-insensitive bundle ID mapping
- Action handlers for invoke/log/webhook

## Overview

Monitor macOS Notification Center for notifications from integrated apps (Messages, Mail, Calendar) and invoke the appropriate skills when trigger conditions are met. This skill implements the **Three-Tier Notification Processing** system.

## Capabilities

- Poll Notification Center database every 5 seconds
- Parse binary plist notification data
- **Tier 1:** Core logic filtering (instant, no AI overhead)
- **Tier 2:** `notification-processor` subagent for uncertain notifications
- **Tier 3:** Route to appropriate skills (iMessage, Mail, Calendar, etc.)
- Store notification logs in iCloud via lib/icloud-storage.js

## Three-Tier Processing Architecture

```
Notification Received
        |
        v
+------------------+
| TIER 1: Core     |  < 1ms, no AI
| Logic Filter     |
+------------------+
        |
   +----+----+
   |    |    |
DROP  QUEUE  UNSURE
        |       |
        v       v
+------------------+
| TIER 2: Subagent |  ~500ms, Haiku model
| (only if unsure) |
+------------------+
        |
   +----+----+
   |         |
DROP      QUEUE
             |
             v
+------------------+
| TIER 3: Agent    |  Full execution
| Execution Flow   |
+------------------+
```

## Usage

### Via Command (Manual)
```
/notifications status          # Check notification monitor status
/notifications recent 10       # List recent notifications
/notifications rules           # Show active trigger rules
/notifications test <rule>     # Test a specific rule
```

### Via Automatic Monitoring
Runs as a background process managed by PM2. Automatically invokes skills based on trigger rules.

## How This Skill Invokes Other Skills

When a notification matches a rule:

1. **Tier 1 core logic** evaluates instantly (blacklist/whitelist/patterns)
2. If unsure, **notification-processor subagent** evaluates (Haiku model)
3. Returns which skill/command to invoke
4. Notification monitor queues the job with appropriate priority
5. Worker loads the required skill and executes

Example flow:
```
iMessage notification received
    |
Tier 1: Whitelist match (Tommy's phone)
    |
Queue job: /imessage respond "Tommy: Hey, check the server"
    |
Worker loads skills/imessage/SKILL.md and processes
```

## Configuration

**Config file:** `skills/notifications/config.json`

### Rule Format

```json
{
  "rules": [
    {
      "name": "rule-name",
      "description": "What this rule does",
      "app": "imessage",
      "condition": {
        "titleContains": "string",
        "bodyContains": "string",
        "senderContains": "string",
        "anyContains": "string",
        "keywords": ["word1", "word2"],
        "pattern": "regex",
        "any": true
      },
      "action": "invoke|log|webhook|ignore",
      "priority": 100,
      "taskPrefix": "Optional task prefix"
    }
  ]
}
```

### Available Apps

| App ID | Bundle ID | Description |
|--------|-----------|-------------|
| `imessage` | com.apple.MobileSMS | iMessage/SMS |
| `mail` | com.apple.mail | Apple Mail |
| `calendar` | com.apple.iCal | Calendar |
| `facetime` | com.apple.FaceTime | FaceTime |
| `reminders` | com.apple.Reminders | Reminders |

### Actions

| Action | Description |
|--------|-------------|
| `invoke` | Queue task for Brokkr agent |
| `log` | Log to console/file |
| `webhook` | POST to external URL |
| `ignore` | Do nothing |

## Database Location

**Sonoma (14.x):**
```bash
$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db
```

**Sequoia (15.x+):**
```bash
~/Library/Group Containers/group.com.apple.usernoted/db2/db
```
Note: Sequoia requires TCC authorization.

## Running

### Via PM2 (Recommended)

```bash
./scripts/bot-control.sh start  # Starts all services
./scripts/bot-control.sh status # Check status
```

### Manual

```bash
# Live mode
node notification-monitor.js

# Dry-run mode (no actions)
node notification-monitor.js --dry-run

# Verbose output
node notification-monitor.js --verbose --debug
```

## State Management

**State file:** `.notification-state.json`

Tracks:
- Last processed timestamp
- Recently processed notification IDs

Persisted every 60 seconds and on shutdown.

## Related Subagent

The `notification-processor` subagent (`.claude/agents/notification-processor.md`) is invoked ONLY when Tier 1 core logic returns "unsure". Uses Haiku model for fast evaluation (~500ms).

## Limitations

1. **Polling delay**: 5-second interval (not real-time)
2. **Read-only**: Cannot dismiss or interact with notifications
3. **Binary format**: Content requires plist decoding
4. **Sequoia**: Will require TCC consent on macOS 15+

## Reference Documentation

See `reference/` directory for detailed docs:
- `database-schema.md` - Notification Center DB schema
- `app-identifiers.md` - Bundle ID to friendly name mapping
