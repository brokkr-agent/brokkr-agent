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

## Automation Capabilities

### Auto-Triage

The `/email triage` command scans inbox and identifies urgent messages based on:

1. **Urgent Senders** - Contacts in `config.json` `urgent_senders` array
2. **Urgent Keywords** - Words like "urgent", "asap", "emergency" in subject

Urgent messages are automatically flagged.

### Configuration for Automation

Edit `skills/email/config.json`:

```json
{
  "auto_triage": true,
  "urgent_senders": [
    "boss@company.com",
    "important-client@example.com"
  ],
  "urgent_keywords": [
    "urgent", "asap", "emergency", "critical",
    "time-sensitive", "action required"
  ]
}
```

### Planned Automations (Phase 7+)

1. **New Email Notification** - When urgent email arrives, notify Tommy via iMessage
2. **Daily Digest** - Morning summary of important emails
3. **Auto-Response Drafts** - Generate draft responses for common email types
4. **Smart Folder Organization** - Auto-move emails to folders based on rules

## AppleScript Reference

All scripts output JSON for easy parsing. Common error format:

```json
{"error": "Error message here"}
```

### Script Arguments

| Script | Arguments |
|--------|-----------|
| list-inbox.scpt | [max_count:20] |
| read-message.scpt | message_id |
| compose.scpt | to, subject, body, [send_now:false] |
| reply.scpt | message_id, body, [reply_all:false], [send_now:false] |
| delete.scpt | message_id |
| search.scpt | query, [field:all], [mailbox:all], [max:20] |
| flag.scpt | message_id, [set:toggle] |
| mark-read.scpt | message_id, [read:true] |
| list-folders.scpt | (none) |
| move-to-folder.scpt | message_id, folder_name, [account] |

## Troubleshooting

### "Mail got an error: AppleEvent handler failed"

Mail.app may not be running. The scripts will launch it, but first invocation may be slow.

### "Not authorized to send Apple events"

Check System Settings > Privacy & Security > Automation. Terminal needs permission to control Mail.

### "Message ID not found"

Message IDs are unique but temporary. After moving/deleting, the ID changes. Always get fresh IDs from list-inbox.
