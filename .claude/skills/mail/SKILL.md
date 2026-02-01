---
name: mail
description: Apple Mail.app integration for reading, composing, and managing emails via AppleScript. Use for email triage, responses, and organization. (Note - different from /email which uses Chrome/iCloud)
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Apple Mail Skill (Mail.app via AppleScript)

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill scaffold validates the directory structure. Implementation pending.

## Capabilities (Planned)

- Read inbox and specific messages
- Compose and send new emails
- Reply to messages (with reply-all option)
- Delete messages (move to trash)
- Search by sender, subject, or content
- Flag/unflag messages
- Move messages between folders
- Auto-triage based on urgency keywords
- Save attachments to iCloud
- Forward emails (with workaround for duplication bug)

## Usage

### Via Command (Manual)
/mail
/mail read <id>
/mail compose <to> <subject>
/mail reply <id>
/mail search <query>
/mail flag <id>
/mail folders
/mail triage

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.

## Notification Processing Criteria

| Criteria | Queue If | Drop If |
|----------|----------|---------|
| Sender | From whitelist/urgent senders | Marketing, newsletters, bulk |
| Subject | Contains urgent keywords | Regular notifications |
| Importance | Marked as important | Low priority |
| Flags | Already flagged | Already processed |
| Content | Actionable keywords present | Informational only |

## Known Limitations

1. **HTML Email Composition BROKEN** - `html content` property non-functional since macOS El Capitan (2015)
2. **Message ID Volatility** - IDs change when messages are moved between mailboxes
3. **Forward Command Bug** - Using `forward` may duplicate original message; use manual copy workaround

## Implementation Notes

### AppleScript Patterns
All scripts output JSON for easy parsing. Use timeout wrappers for long operations:
```applescript
with timeout of 600 seconds
    -- Long-running operations
end timeout
```

### Memory Considerations (8GB RAM)
- Fetch messages in batches (max 50 at a time)
- Don't load full message content until requested
- Release references after processing

## Reference Documentation

See `reference/` directory for detailed docs once implemented.
