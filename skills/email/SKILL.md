---
name: email
description: Apple Mail integration for reading, composing, and managing emails. Use for email triage, responses, and organization.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Apple Mail Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Read inbox and specific messages
- Compose and send new emails
- Reply to messages (with reply-all option)
- Delete messages (move to trash)
- Search by sender, subject, or content
- Flag/unflag messages
- Move messages between folders
- Auto-triage based on urgency keywords
- Save attachments to iCloud

## Usage

### Via Command (Manual)
```
/email
/email read <id>
/email compose <to> <subject>
/email reply <id>
/email search <query>
/email flag <id>
/email folders
/email triage
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.

## Configuration

Edit `skills/email/config.json` to customize:

- `account`: Mail account name (default: "iCloud")
- `batch_size`: Max messages to fetch at once (default: 50)
- `auto_triage`: Enable automatic triage on inbox check
- `urgent_senders`: List of senders to always flag as urgent
- `urgent_keywords`: Keywords in subject/body that indicate urgency

## Known Limitations

1. **HTML Email Composition BROKEN** - `html content` property non-functional since macOS El Capitan (2015)
2. **Message ID Volatility** - IDs change when messages are moved between mailboxes
3. **Forward Command Bug** - Using `forward` may duplicate original message; use manual copy workaround

## Reference Documentation

See `reference/` directory for detailed docs:
- `applescript-mail.md` - AppleScript patterns and limitations
