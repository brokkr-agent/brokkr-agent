# Brokkr Self-Improvement System

**Status:** Concept (requires research before implementation)
**Created:** 2026-01-31
**Owner:** Tommy Johnson (tommyjohnson90@gmail.com)

## Overview

Brokkr is Tommy's autonomous personal assistant running 24/7 on a dedicated MacBook Pro (8GB RAM). It supports Tommy directly and handles brokkr.co tasks via webhooks. The system should proactively self-improve, creating reusable skills and scripts that make future work more efficient.

## Core Principles

1. **Full Autonomy** - This machine is dedicated to Brokkr. It has complete authority to manage it.
2. **Proactive Skill Usage** - ALWAYS load ALL relevant skills on activation and as workflow progresses.
3. **Self-Improvement** - Scripts developed for tasks should be reusable. Store in skill directories.
4. **No Blocking** - Never ask for help. Find workarounds. Asking blocks the system.
5. **RAM Conscious** - 8GB limit. Serial execution. Unload resources when not needed.

## Input Channels

### Existing
- **WhatsApp** - Mobile commands via whatsapp-web.js
- **Webhooks** - HTTP API for brokkr.co automated tasks

### New
- **iMessage** - Commands + urgent outbound notifications
- **System Notifications** - React to macOS notification center events

All channels share one session pool. Sessions track originating channel but any channel can continue any session.

## System Notification Triggers

Brokkr should react to macOS system notifications:

| Source | Trigger | Action |
|--------|---------|--------|
| iMessage | New message from Tommy | Process as command or conversation |
| Calendar | Shared calendar update | Check for conflicts, notify if relevant |
| Calendar | Event reminder | Send briefing or reminder |
| Notes | Shared note update | Review changes, act if actionable |
| Reminders | Reminder due | Notify Tommy or take action |
| Mail | New email | Triage, flag urgent, optionally respond |

**Research Needed:**
- How to subscribe to macOS notification center programmatically
- AppleScript vs EventKit vs notification observers
- Polling vs push for each app type

## Skill Architecture

Each capability is a self-contained skill:

```
skills/
  imessage/
    skill.md              # Definition, usage, examples
    send.scpt             # Send message to contact
    read-recent.scpt      # Get recent messages
    poll-messages.scpt    # Check for new messages

  calendar/
    skill.md
    list-today.scpt       # Today's events
    list-week.scpt        # Week's events
    add-event.scpt        # Create event
    check-conflicts.scpt  # Find scheduling conflicts

  notes/
    skill.md
    create-note.scpt      # Create new note
    search-notes.scpt     # Find by keyword
    append-note.scpt      # Add to existing note
    list-recent.scpt      # Recent notes

  reminders/
    skill.md
    create-reminder.scpt  # Create with due date
    list-due.scpt         # Upcoming reminders
    complete-reminder.scpt # Mark done

  email/
    skill.md
    read-inbox.scpt       # Get inbox messages
    read-message.scpt     # Get specific message content
    compose.scpt          # Create new email
    reply.scpt            # Reply to message
    reply-all.scpt        # Reply all
    forward.scpt          # Forward message
    delete.scpt           # Delete message
    move-to-folder.scpt   # Organize into folders
    search.scpt           # Search by sender/subject/content
    mark-read.scpt        # Mark as read
    mark-unread.scpt      # Mark as unread
    flag.scpt             # Flag message
    list-folders.scpt     # List mailboxes/folders
```

## iMessage Integration

### Inbound (Tommy → Brokkr)

Monitor Messages.app for messages from +1 206-909-0025. Same command syntax as WhatsApp:

| Command | Action |
|---------|--------|
| `/claude <task>` | New task |
| `/<xx>` | Resume session |
| `/status` | Bot status |
| `/help` | Show commands |

No anti-loop needed - Tommy and Brokkr are separate iCloud accounts.

### Outbound (Brokkr → Tommy)

Brokkr sends iMessages when it judges something is urgent. Uses adaptive thresholds that learn from Tommy's feedback.

**Examples:**
- "Webhook failed 3 times for brokkr.co checkout"
- "Reminder: Call with investor in 30 minutes"
- "Found 2 negative app reviews posted today"

**Learning:**
When Tommy responds with feedback ("Don't message me about that", "This should have been urgent", "Good call"), Brokkr logs to `data/urgency-feedback.json` and adjusts.

## Email Integration

### Commands

| Command | Description |
|---------|-------------|
| `/email` | Check inbox summary |
| `/email read <id>` | Read specific message |
| `/email compose <to> <subject>` | Start composing |
| `/email reply <id>` | Reply to message |
| `/email delete <id>` | Delete message |
| `/email search <query>` | Search messages |

### Automation Capabilities

- Triage incoming email by sender/subject patterns
- Auto-flag urgent messages
- Draft responses for review
- Organize into folders based on rules
- Daily digest of important emails

**Research Needed:**
- Apple Mail AppleScript dictionary
- Handling HTML vs plain text emails
- Attachment handling
- Multiple mailbox/account support

## Self-Improvement System

### Building New Capabilities

When Brokkr develops a new capability:
1. Create skill directory with `skill.md` + scripts
2. Add tests via `dry-run-test.js` for command parsing
3. Update CLAUDE.md with new capability
4. Commit to git with descriptive message

### Learning Data

```
data/
  urgency-feedback.json    # Learns what's worth an iMessage
  command-history.json     # Patterns in requests
  task-outcomes.json       # What worked, what didn't
  email-rules.json         # Learned email triage rules
```

### Proactive Optimization

Brokkr identifies inefficiencies and fixes them:
- "I've run this AppleScript 50 times - caching the result would save time"
- "This webhook always fails at 3am - adding retry logic"
- "Created a shortcut for your common request pattern"

### Self-Maintenance (LOW priority)

During idle time:
- Prune old session data
- Clean up temp files
- Check for stale processes
- Update CLAUDE.md with learnings

## Implementation Phases

### Phase 1 - iMessage Foundation
1. iMessage skill (send/receive scripts)
2. Message polling integration
3. Shared session handling across channels

### Phase 2 - Email Integration
4. Email skill with full CRUD operations
5. Basic triage automation
6. Email command parsing

### Phase 3 - Apple Apps
7. Calendar skill
8. Reminders skill
9. Notes skill

### Phase 4 - System Notifications
10. Notification trigger system
11. Shared calendar/notes/reminders reactions
12. Email notification handling

### Phase 5 - Self-Improvement
13. Urgency learning system
14. Self-maintenance routines
15. Pattern detection and shortcuts

### Phase 6 - Refinement
16. Morning briefing automation
17. Cross-skill workflows
18. Adaptive optimization

## Research Required Before Implementation

### iMessage
- [ ] AppleScript for reading Messages.app conversations
- [ ] AppleScript for sending messages
- [ ] Polling strategy (interval, efficiency)
- [ ] Handling group messages vs direct messages

### Email
- [ ] Apple Mail AppleScript dictionary and capabilities
- [ ] Reading message content (plain text + HTML)
- [ ] Composing and sending via script
- [ ] Handling multiple accounts
- [ ] Attachment support

### System Notifications
- [ ] macOS notification center API access
- [ ] AppleScript vs native notification observers
- [ ] Which apps support notification subscription
- [ ] Polling vs event-driven approaches

### Calendar/Notes/Reminders
- [ ] EventKit vs AppleScript trade-offs
- [ ] Shared item detection (via iCloud)
- [ ] Creating vs modifying items
- [ ] Syncing considerations

## Constraints

- **8GB RAM** - Serial execution, unload resources aggressively
- **No blocking** - Never wait for human input, find workarounds
- **iCloud sync** - All Apple apps sync via iCloud, respect sync delays
- **Privacy** - Credentials in CLAUDE.md, don't log sensitive content

## Success Criteria

1. Tommy can command Brokkr from iMessage with same syntax as WhatsApp
2. Brokkr proactively notifies Tommy of genuinely urgent items
3. Email can be triaged and managed without opening Mail.app
4. Calendar/notes/reminders accessible via commands
5. System notifications trigger appropriate Brokkr responses
6. Brokkr creates reusable skills that improve efficiency over time
