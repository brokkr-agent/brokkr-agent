---
name: imessage
description: iMessage integration for sending/receiving messages via Messages.app. Use for communicating with Tommy via text.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# iMessage Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill scaffold validates the directory structure. Implementation pending.

## Capabilities (Planned)

- Poll for new messages from Tommy's phone (+1 206-909-0025)
- Send responses back via AppleScript
- Process commands with same syntax as WhatsApp
- Share session pool across all channels (iMessage, WhatsApp, Webhook)
- Read messages via SQLite database (~/Library/Messages/chat.db)
- Handle attachments and store in iCloud

## Usage

### Via Command (Manual)
/imessage send "Hello Tommy"
/imessage check

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.

## Notification Processing Criteria

| Criteria | Queue If | Drop If |
|----------|----------|---------|
| Sender | From Tommy (+1 206-909-0025) | Unknown numbers |
| Content | Starts with `/` (command) | Regular conversation |
| Chat Type | Direct message | Group chats |
| Status | Unread messages | Already processed |

## Implementation Notes

### AppleScript Limitation
Messages.app AppleScript scripting dictionary has NO "message" class for reading. Must use SQLite database at `~/Library/Messages/chat.db` for reading messages. Sending works via AppleScript.

### Permission Requirements
1. **Full Disk Access** - For reading chat.db
2. **Automation** - For sending via AppleScript

### Session Type
- iMessage sessions use type `'imessage'`
- Code length: 2 characters (CRITICAL priority)
- Sessions shared across all channels

## Reference Documentation

See `reference/` directory for detailed docs once implemented.
