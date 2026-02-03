# Apple Integration Sprint

## Overview

Integrate macOS native applications and services with the Brokkr agent system. Enables Tommy to interact with the agent via multiple channels (iMessage, Email) and allows the agent to create tutorial videos and receive system notifications.

**Target System:** macOS 14.8.3 (Sonoma)

**RAM Constraint:** 8GB total - all processes must be memory-efficient

## Plans

### Phase 1: Communication Channels (Priority: High)

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [iMessage Skill](./2026-02-01-imessage-skill-plan.md) | ✅ Implemented | None | 9 |
| [iMessage Advanced Assistant](./2026-02-01-imessage-advanced-assistant-plan.md) | ✅ Implemented | iMessage Skill (verify complete) | 26 |
| [Email Skill](./2026-02-01-email-skill-plan.md) | ✅ Implemented | None | 15 |

### Phase 2: Apple Notifications (Priority: High - Foundation for Others)

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [Apple Notifications](./2026-02-01-apple-notification-integration-plan.md) | ✅ Implemented | None | 11 |

### Phase 3: Core Apple Apps

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [Calendar Skill](./2026-02-01-calendar-skill-plan.md) | ✅ Implemented | Notifications | 12 |
| [Reminders Skill](./2026-02-01-reminders-skill-plan.md) | ✅ Implemented | Notifications | 11 |
| [Notes Skill](./2026-02-01-notes-skill-plan.md) | Not Started | Notifications | 13 |
| [iCloud Sharing Skill](./2026-02-01-icloud-sharing-skill-plan.md) | Not Started | None | 9 |

### Phase 4: Extended Apps

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [Contacts Skill](./2026-02-01-contacts-skill-plan.md) | Not Started | None | 14 |
| [Chrome Skill](./2026-02-01-chrome-skill-plan.md) | Not Started | None | 10 |
| [Finder & System Skill](./2026-02-01-finder-system-skill-plan.md) | Not Started | None | 9 |
| [Music Skill](./2026-02-01-music-skill-plan.md) | Not Started | None | 7 |
| [Bluetooth Skill](./2026-02-01-bluetooth-skill-plan.md) | Not Started | None | 11 |

### Phase 5: Content Creation

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [Screen Recording & Remotion](./2026-02-01-screen-recording-remotion-plan.md) | Not Started | None | 17 |

### Phase 6: Automation Bridge

| Plan | Status | Dependencies | Est. Tasks |
|------|--------|--------------|------------|
| [Shortcuts & Automation](./2026-02-01-shortcuts-automation-skill-plan.md) | Not Started | None | 10 |

**Total: 15 plans, ~175 tasks**

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
| Focus Modes | ⏸️ Deferred | **BRAINSTORM NEEDED:** Discuss benefit/use cases before planning. See Shortcuts plan. |
| Bluetooth Control | ✅ Complete | Use blueutil CLI, no native AppleScript support |

### Key Research Findings

1. **iMessage** - AppleScript cannot read messages. Must use `~/Library/Messages/chat.db` (SQLite) with `better-sqlite3`. AppleScript sender still works.

2. **Email** - AppleScript fully functional. HTML composition broken since El Capitan. Forward command has duplication bug.

3. **Screen Recording** - `screencapture -v` works. Add `-C` for cursor. Remotion 4.0 is 281% faster. **Delivery:** Recordings sent to Tommy via iMessage attachment.

4. **Notifications** - Poll `$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db`. No permissions on Sonoma. Sequoia adds TCC.

5. **Bluetooth** - No native AppleScript support. Use `blueutil` CLI (`brew install blueutil`) for power, discovery, connect, disconnect, and pairing.

### Documentation Sources

All plans updated with official documentation URLs from:
- developer.apple.com
- Objective-See security research
- MacForensics tools
- Remotion official docs

## Standardization Architecture

**REQUIRED:** All skills in this sprint MUST follow the patterns in [Apple Integration Architecture](../concepts/2026-02-01-apple-integration-architecture.md).

### Key Standards

| Pattern | Location | Purpose |
|---------|----------|---------|
| Skill Structure | `skills/<integration>/` | Self-contained with lib/, reference/, tests/ |
| Commands | `.claude/commands/<integration>.md` | Manual + agent invocation |
| Subagents | `.claude/agents/` | Notification processing, device research |
| iCloud Storage | `~/...CloudDocs/Brokkr/` | Large files organized by date |
| Hooks | `.claude/settings.json` | Session lifecycle automation |

### Shared Libraries

| Library | Purpose |
|---------|---------|
| `lib/icloud-storage.js` | Consistent iCloud paths for all integrations |
| `lib/notification-context.js` | Pass notification data to agent |

### Custom Subagents

| Subagent | Purpose |
|----------|---------|
| `notification-processor` | Evaluate if notification warrants agent action |
| `device-researcher` | Research newly connected devices (Bluetooth) |
| `content-analyzer` | Analyze attachments and exports |

### Claude Code Research (v2.1.29)

Research completed on Claude Code documentation:
- Skills support `context: fork`, `agent:`, `skills:`, `hooks:` in frontmatter
- Commands and skills merged - skills recommended for bundled resources
- Custom subagents support `tools`, `model`, `permissionMode`, `skills`
- Hooks support `Notification` event with matchers and agent-type evaluation

## Related Documentation

- [Apple Integration Architecture](../concepts/2026-02-01-apple-integration-architecture.md) - **REQUIRED READING**
- [Self-Improvement System Concept](../concepts/2026-01-31-brokkr-self-improvement-system.md)
- [BrokkrMVP Webhook Protocol](./2026-01-31-brokkr-mvp-webhook-protocol.md)
