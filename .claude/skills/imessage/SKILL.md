---
name: imessage
description: iMessage integration for sending/receiving messages via Messages.app. Use for communicating with Tommy via text. This is a core communication channel alongside WhatsApp.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# iMessage Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: IMPLEMENTED

Core iMessage integration is fully functional:
- SQLite message reading from chat.db
- AppleScript message sending
- Command parsing and processing
- Session management with 2-char codes
- PM2 process management

## Overview

Enable two-way communication with Tommy via iMessage. Messages from Tommy's phone (+1 206-909-0025) are polled from the Messages.app SQLite database. Commands are processed with the same syntax as WhatsApp. Responses are sent via AppleScript.

## Capabilities

- Poll for new messages from Tommy's phone
- Send responses back via AppleScript
- Process commands with same syntax as WhatsApp
- Share session pool across all channels
- 2-character session codes (same as WhatsApp)
- Automatic startup message on bot start
- Dry-run mode for testing

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

### Process Management
```bash
# Start via PM2 (recommended)
./scripts/bot-control.sh start

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
| `ecosystem.config.cjs` | PM2 configuration |
| `scripts/bot-control.sh` | Process management |

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
4. **Single recipient**: Only communicates with Tommy's phone
