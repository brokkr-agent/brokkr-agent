---
name: imessage
description: iMessage automation - read/send messages, manage contacts, handle group chats. Primary communication channel for Brokkr assistant.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# iMessage Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: IMPLEMENTED

Core iMessage integration and Advanced Assistant are fully functional:
- SQLite message reading from chat.db
- AppleScript message sending
- Command parsing and processing
- Session management with 2-char codes
- PM2 process management
- Universal access mode for any contact
- Contact permissions and trust levels
- Silent consultation for untrusted contacts

## Overview

Enable two-way communication via iMessage. In standard mode, only Tommy's phone (+1 206-909-0025) is processed. In universal mode (--universal flag), messages from any contact are processed with automatic trust management.

## Capabilities

### Core Features
- Poll for new messages from chat.db
- Send responses back via AppleScript
- Process commands with same syntax as WhatsApp
- Share session pool across all channels
- 2-character session codes (same as WhatsApp)
- Automatic startup message on bot start
- Dry-run mode for testing

### Advanced Assistant (--universal mode)
- Accept messages from any contact
- Natural conversation (no / prefix required)
- Self-expanding permissions system
- Silent consultation for untrusted contacts
- Group conversation state machine
- Contact-specific response styles
- Approval queue for sensitive requests

## Architecture

```
Tommy's iPhone
     |
     v (iCloud sync)
Messages.app (chat.db)
     |
     v (SQLite polling every 2s)
imessage-bot.js
     |
     +-> lib/imessage-reader.js   (read messages)
     +-> lib/imessage-sender.js   (send messages)
     +-> lib/message-parser.js    (parse commands)
     +-> lib/queue.js             (job queue)
     +-> lib/sessions.js          (session management)
     +-> lib/worker.js            (task execution)
```

## Usage

### Via iMessage (Automatic)
Send commands from Tommy's phone:
- `/claude <task>` - Start new task
- `/<xx>` - Resume session
- `/<xx> <message>` - Continue session with message
- `/status` - Bot status
- `/help` - Show commands
- `/sessions` - List active sessions
- `/questions` - View pending approval requests
- `/digest [days]` - View daily digest (default 7 days)
- `/<xx> allow` - Approve pending request
- `/<xx> deny` - Deny pending request

### Process Management
```bash
# Start via PM2 - standard mode (Tommy only)
./scripts/bot-control.sh start

# Start via PM2 - universal mode (all contacts)
./scripts/bot-control.sh start --universal

# Start manually for debugging
./scripts/bot-control.sh live

# Start in dry-run mode
./scripts/bot-control.sh test

# Check status
./scripts/bot-control.sh status

# View logs
./scripts/bot-control.sh logs
tail -f /tmp/imessage-bot.log
```

## Configuration

**Config file:** `.claude/skills/imessage/config.json`

| Setting | Value | Description |
|---------|-------|-------------|
| tommy_phone | +12069090025 | Tommy's phone number |
| polling_interval_ms | 2000 | Poll interval (ms) |
| session_type | imessage | Session type identifier |
| code_length | 2 | Session code length |
| priority | CRITICAL | Queue priority |

## Notification Processing Criteria

| Criteria | Queue If | Drop If |
|----------|----------|---------|
| Sender | From Tommy (+1 206-909-0025) | Unknown numbers |
| Content | Starts with `/` (command) | Regular conversation |
| Chat Type | Direct message | Group chats |
| Status | Not already processed | Already in processedIds |

## Files

| File | Purpose |
|------|---------|
| `imessage-bot.js` | Main process, polls and processes messages |
| `lib/imessage-reader.js` | SQLite database reader |
| `lib/imessage-sender.js` | AppleScript message sender |
| `lib/imessage-permissions.js` | Contact trust levels and permissions |
| `lib/imessage-pending.js` | Approval queue for untrusted contacts |
| `lib/imessage-context.js` | Conversation context retrieval |
| `lib/imessage-consultation.js` | Silent consultation flow |
| `lib/group-monitor.js` | Group chat state machine |
| `lib/command-permissions.js` | Command access control |
| `.claude/skills/imessage/contacts.json` | Contact permissions storage |
| `.claude/skills/imessage/pending-questions.json` | Approval queue storage |
| `ecosystem.config.cjs` | PM2 configuration |
| `scripts/bot-control.sh` | Process management |

## Contact Trust Levels

| Level | Description |
|-------|-------------|
| `not_trusted` | Default for new contacts, requires consultation |
| `partial_trust` | Some permissions granted by Tommy |
| `trusted` | Full access (Tommy only by default) |

## Command Permissions

Command permissions are separate from trust levels:
- Tommy has `["*"]` (all commands)
- Other contacts have explicit lists like `["/status", "/help"]`
- Contacts with 0 command permissions: commands treated as natural messages
- Contacts with 1+ permissions: unknown commands return "not found"

## Database Location

**Messages database:**
```
~/Library/Messages/chat.db
```

**Mac Absolute Time:** Timestamps use seconds since 2001-01-01. Convert with:
```javascript
unixTime = macTime + 978307200
```

## Permission Requirements

1. **Full Disk Access** (for reading chat.db):
   - System Settings > Privacy & Security > Full Disk Access
   - Add Terminal.app or node binary

2. **Automation** (for sending via AppleScript):
   - System Settings > Privacy & Security > Automation
   - Allow Terminal to control Messages.app

## Troubleshooting

### Messages not being read
1. Check Full Disk Access permissions
2. Verify database path exists: `ls ~/Library/Messages/chat.db`
3. Check logs: `tail -f /tmp/imessage-bot.log`

### Messages not being sent
1. Check Automation permissions
2. Verify Messages.app is running
3. Test AppleScript manually: `osascript -e 'tell app "Messages" to activate'`

### Bot not starting
1. Check lock file: `cat imessage-bot.lock`
2. Remove stale lock: `rm imessage-bot.lock`
3. Check logs: `tail -f /tmp/imessage-bot.log`

## Anti-Loop Protection

The bot skips messages that:
- Have sender `me` (bot's own messages)
- Start with known bot response prefixes
- Contain help text output patterns
- Have already been processed (by message ID)

## Related Skills

- **notifications** - Central notification monitor
- **whatsapp** - Similar architecture, different transport

## Limitations

1. **Polling delay**: 2-second interval (not real-time)
2. **Read-only database**: Cannot mark messages as read
3. **iCloud sync**: Messages must sync before polling sees them
4. **Standard mode**: Only communicates with Tommy's phone
5. **Universal mode**: Requires Tommy approval for untrusted contacts
