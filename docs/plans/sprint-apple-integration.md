# Apple Integration Sprint

## Overview

Integrate macOS native applications and services with the Brokkr agent system. Enables Tommy to interact with the agent via multiple channels (iMessage, Email) and allows the agent to create tutorial videos and receive system notifications.

**Target System:** macOS 14.8.3 (Sonoma)

**RAM Constraint:** 8GB total - all processes must be memory-efficient

## Plans

| Plan | Status | Priority | Dependencies | Est. Tasks |
|------|--------|----------|--------------|------------|
| [iMessage Skill](./2026-02-01-imessage-skill-plan.md) | Not Started | High | None | 10 |
| [Email Skill](./2026-02-01-email-skill-plan.md) | Not Started | High | None | 15 |
| [Screen Recording & Remotion](./2026-02-01-screen-recording-remotion-plan.md) | Not Started | Medium | None | 17 |
| [Apple Notifications](./2026-02-01-apple-notification-integration-plan.md) | Not Started | Medium | None | 11 |

## Architecture Principles

### Separate Processes

Each input channel runs as a separate process for isolation:
- `whatsapp-bot.js` - WhatsApp polling (existing)
- `imessage-bot.js` - iMessage polling (planned)
- `webhook-server.js` - HTTP webhooks (existing)
- `notification-monitor.js` - Notification Center polling (planned)

### Shared Infrastructure

All processes share:
- `lib/queue.js` - Priority job queue
- `lib/sessions.js` - Session management (2-char for CRITICAL, 3-char for HIGH)
- `lib/worker.js` - Claude execution
- `lib/message-parser.js` - Command parsing

### AppleScript Strategy

Use `osascript` for all Apple app automation:
- Messages.app - read/send iMessages
- Mail.app - read/compose/reply/delete emails
- Screen recording - `screencapture -v` (native)
- Notifications - System Events scripting

## Completion Criteria

### Phase 1: Communication Channels
- [ ] iMessage bot receives commands from Tommy's phone
- [ ] iMessage bot sends responses via Messages.app
- [ ] Email commands work via Mail.app
- [ ] Sessions shared across all channels

### Phase 2: Content Creation
- [ ] Screen recording captures tutorial videos
- [ ] Remotion generates polished tutorial content
- [ ] Videos shareable via iCloud

### Phase 3: Proactive Notifications
- [ ] Agent receives macOS notifications
- [ ] Logical processing determines action
- [ ] Agent can initiate contact when needed

## Technical Notes

### Session Codes

| Channel | Code Length | Priority |
|---------|-------------|----------|
| WhatsApp | 2-char | CRITICAL (100) |
| iMessage | 2-char | CRITICAL (100) |
| Webhook | 3-char | HIGH (75) |

### Memory Budget

| Process | Estimated RAM |
|---------|---------------|
| WhatsApp bot (Puppeteer) | 200-300MB |
| Webhook server | 50MB |
| iMessage bot | 50-100MB |
| Notification monitor | 50MB |
| Claude execution | Variable |

Total baseline: ~450MB, leaving headroom for Claude execution.

## Research Status (2026-02-01)

Research completed using parallel agents against official Apple documentation:

| Topic | Status | Key Findings |
|-------|--------|--------------|
| Messages.app AppleScript | ✅ Complete | **CRITICAL:** No message class in sdef - use SQLite chat.db instead |
| Mail.app AppleScript | ✅ Complete | 90% plan coverage, add forward/BCC/attachments |
| screencapture CLI | ✅ Complete | Add cursor capture, audio sources, permissions docs |
| Notification Center | ✅ Complete | SQLite polling works, no real-time API exists |
| Focus Modes | 🔲 Pending | Shortcuts integration needed |

### Key Research Findings

1. **iMessage** - AppleScript cannot read messages. Must use `~/Library/Messages/chat.db` (SQLite) with `better-sqlite3`. AppleScript sender still works.

2. **Email** - AppleScript fully functional. HTML composition broken since El Capitan. Forward command has duplication bug.

3. **Screen Recording** - `screencapture -v` works. Add `-C` for cursor. Remotion 4.0 is 281% faster.

4. **Notifications** - Poll `$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db`. No permissions on Sonoma. Sequoia adds TCC.

### Documentation Sources

All plans updated with official documentation URLs from:
- developer.apple.com
- Objective-See security research
- MacForensics tools
- Remotion official docs

## Related Documentation

- [Self-Improvement System Concept](../concepts/2026-01-31-brokkr-self-improvement-system.md)
- [BrokkrMVP Webhook Protocol](./2026-01-31-brokkr-mvp-webhook-protocol.md)
