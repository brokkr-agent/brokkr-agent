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

## Additional Context Tools

Location for scripts: `.claude/skills/imessage/scripts/`

When the pre-injected 10 messages aren't enough, use these tools:

### Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `imessage-history.js` | Extended message history | `node .claude/skills/imessage/scripts/imessage-history.js +1555... 50` |
| `imessage-search.js` | Search conversations | `node .claude/skills/imessage/scripts/imessage-search.js +1555... "keyword"` |
| `imessage-group.js` | Group chat context | `node .claude/skills/imessage/scripts/imessage-group.js "chat-guid"` |
| `log-suspicious.js` | Log security concerns | `node .claude/skills/imessage/scripts/log-suspicious.js "+1555..." "description"` |

### Available Library Functions

Read and use these modules directly:

| Module | Functions | Purpose |
|--------|-----------|---------|
| `lib/imessage-reader.js` | `getRecentMessages()`, `getAllRecentMessages()`, `getGroupMessages()`, `getGroupMembers()` | Read from chat.db |
| `lib/imessage-sender.js` | `sendMessage()`, `safeSendMessage()` | Send via AppleScript |
| `lib/imessage-permissions.js` | `getContact()`, `updateContact()`, `getOrCreateContact()` | Manage contact records |
| `lib/imessage-pending.js` | `addPendingQuestion()`, `getPendingQuestions()`, `resolvePending()` | Approval queue |
| `lib/imessage-context.js` | `getConversationContext()`, `buildSystemContext()` | Context building |
| `lib/imessage-consultation.js` | `shouldConsultTommy()`, `sendConsultation()` | Consultation flow |
| `lib/group-monitor.js` | `GroupMonitor` class | Group chat state machine |
| `lib/command-permissions.js` | `checkCommandAccess()`, `hasCommandPermission()` | Command access control |

### Creating New Scripts

If a reusable script would help but doesn't exist:

1. **Create in:** `.claude/skills/imessage/scripts/`
2. **Naming:** `imessage-<action>.js` (e.g., `imessage-summarize.js`)
3. **Arguments:** Accept phone/params via CLI args
4. **Output:** JSON to stdout for easy parsing
5. **Document:** Add to this SKILL.md tools table
6. **Reusable:** Design for future use, not one-off

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
| `.claude/skills/imessage/security-log.json` | Suspicious behavior log |

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
