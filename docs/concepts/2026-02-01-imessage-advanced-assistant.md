# iMessage Advanced Assistant Architecture

> **Status:** Design Complete - Ready for Implementation
> **Created:** 2026-02-01
> **Related:** Apple Integration Suite, iMessage Skill

## Overview

Transform the iMessage bot from a Tommy-only command processor into a general-purpose AI assistant ("Brokkr") accessible to anyone who messages the bot's iCloud account.

## Core Design Principles

1. **Universal Access** - Any iMessage contact can message the bot's iCloud account
2. **Natural Conversation** - Normal messages (without `/`) treated as `/claude` commands
3. **Context from DB** - Pull conversation history from chat.db at invocation time (not heavy session state)
4. **Privacy-Aware** - Self-expanding permissions system, contacts start "not trusted"
5. **Silent Consultation** - No response to uncertain requests until Tommy approves
6. **Human-Like Persona** - Responds as "Brokkr", never reveals filtering (acts like it "doesn't know")

## Finalized Design Decisions

### 1. Contact Metadata Structure

**Decision:** Minimal core with agent-learned enrichments

The contact record combines essential data with fields the agent populates over time:

```json
{
  "+15551234567": {
    "id": "+15551234567",
    "service": "iMessage",
    "country": "us",
    "display_name": null,

    "trust_level": "not_trusted",
    "permissions": { ... },
    "denied_requests": [ ... ],
    "approved_requests": [ ... ],

    "response_style": "casual",
    "topics_discussed": ["work", "scheduling"],
    "sentiment_history": "positive",

    "spam_score": 0,
    "ignore": false,

    "first_seen": "2026-01-10T08:00:00Z",
    "last_interaction": "2026-02-01T14:30:00Z"
  }
}
```

**Core fields** (set immediately): id, service, country, trust_level, timestamps

**Agent-learned fields** (populated over time): response_style, topics_discussed, sentiment_history, spam_score

**Trust progression:** `not_trusted` → `partial_trust` → `trusted` OR degrades to `ignore`

### 2. Apple Contacts Integration

**Decision:** Defer integration, research capabilities, add to contacts plan

- No name resolution in this implementation
- Use phone numbers as identifiers
- Research findings added to `docs/plans/2026-02-01-contacts-skill-plan.md`
- Integration planned as part of contacts skill implementation

### 3. Group Chat Identification

**Decision:** Natural responses with context-aware introductions

- Respond naturally, never "Brokkr here, <message>"
- Use appropriate tone for the conversation
- For NEW group messages with no chat history, introduce naturally: "Hi, this is Brokkr, I am wondering..."
- Agent uses best judgment based on intent and conversation history

### 4. Rate Limiting / Spam Handling

**Decision:** No rate limiting, smart spam filtering

- Trust the consultation flow
- Agent evaluates messages to detect spam before escalating
- Only genuine inquiries go to Tommy for approval
- Spam detection noted in contact permissions (builds/degrades trust over time)
- `ignore` flag option for confirmed spam (set by Tommy)

### 5. Notification Preferences

**Decision:** Real-time for genuine inquiries + on-demand digest

- Immediate notification when agent determines a real question needs approval
- Spam filtered out, never notified
- Daily digest saved (not auto-sent) and accessed via `/digest` command
- Last 7 days by default, command arguments for more
- Digest generation is a scheduled job (to be planned separately)

## Architectural Decisions

### Message Handling

| Message Type | From Tommy | From Others |
|--------------|------------|-------------|
| `/command` syntax | Process as command | Process as command |
| Normal message | Process as `/claude` | Process as `/claude` |
| Pre-alert messages | Send (e.g., "Starting... Session: /k7") | Do NOT send |
| Session codes | Display in responses | Do NOT display |

### Context Retrieval Strategy

**Decision:** Pull context from chat.db at invocation time rather than maintaining heavy session state.

**Rationale:**
- Messages database already contains full conversation history
- Reduces memory overhead for long-running bot process
- Enables retrieval of arbitrarily old context on demand
- Simplifies session management

**Implementation:**
- At agent invocation, query chat.db for recent messages with that contact
- Provide conversation context to Claude as system prompt
- Allow agent to request additional historical context via skill scripts

### Session Persistence

| Aspect | Value |
|--------|-------|
| Active session timeout | 30 days |
| Historical context | Unlimited (via chat.db queries) |
| Per-contact sessions | Yes (separate session pool per contact) |
| Cross-channel sessions | No (iMessage sessions separate from WhatsApp) |

## Contact Permissions System

### Trust Levels

Contacts start at "not trusted" and expand case-by-case based on Tommy's approvals.

```
┌─────────────────┐
│   Not Trusted   │ ← Default for new contacts
└────────┬────────┘
         │ (Tommy approves specific request)
         ▼
┌─────────────────┐
│ Partial Trust   │ ← Specific permissions granted
└────────┬────────┘
         │ (Multiple approvals over time)
         ▼
┌─────────────────┐
│   Trusted       │ ← Broad access granted
└─────────────────┘
```

### Consultation Flow (Silent Mode)

When Brokkr is uncertain about a request:

```
Contact asks sensitive question
         │
         ▼
┌─────────────────────────┐
│ Evaluate: spam/genuine? │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ Genuine?│
    └────┬────┘
    Yes  │  No (spam)
    │    │
    │    ▼
    │  Note spam_score
    │  Do not respond
    ▼
┌─────────────────────────┐
│ Check permissions.json  │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ Allowed?│
    └────┬────┘
    Yes  │  No/Uncertain
    │    │
    ▼    ▼
┌──────┐ ┌──────────────────────────────┐
│Reply │ │ Add to pending queue         │
└──────┘ │ Send Tommy: "Sarah asked:    │
         │ 'What's Tommy's schedule?'   │
         │ Session: /a3 - Allow/Deny?"  │
         └──────────────────────────────┘
                    │
         ┌─────────┴─────────┐
         │ Wait for approval │
         └─────────┬─────────┘
                   │
         ┌────┬────┴────┬────┐
         ▼    ▼         ▼    ▼
      Allow  Deny   Timeout  Ignore
         │    │         │      │
         ▼    ▼         ▼      ▼
      Reply  Save    Re-ask   Drop +
             denial  in 24h   set ignore
```

### Commands

| Command | Description |
|---------|-------------|
| `/questions` | View pending approval requests |
| `/digest` | View daily digests (last 7 days default) |
| `/digest 14` | View last 14 days of digests |
| `/<session> allow` | Approve a pending request |
| `/<session> deny` | Deny a pending request |

### Rejection Behavior

**Critical:** Never reveal that information is being filtered.

| Don't Say | Do Say |
|-----------|--------|
| "Permission denied" | "I don't have that information" |
| "Tommy doesn't want you to know" | "I'm not sure about that" |
| "I can't share that" | "That's not something I know" |
| "That's private information" | "Hmm, I'd have to check on that" |

## Group Conversation State Machine

### States

```
┌─────────┐
│  IDLE   │ ← Not monitoring this group
└────┬────┘
     │ "Brokkr" mentioned + question/reason to respond
     ▼
┌─────────┐
│ ACTIVE  │ ← Monitoring, will respond if addressed
└────┬────┘
     │ Evaluates each message
     ▼
┌────────────┐
│ EVALUATING │ ← Deciding if message is directed at Brokkr
└─────┬──────┘
      │
   ┌──┴──┐
   │     │
   ▼     ▼
Reply  Continue monitoring
   │     │
   └──┬──┘
      │
      ▼
┌─────────────────────────────┐
│ Check: 20 messages OR       │
│ 30 minutes since last reply │
│ OR topic changed            │
└──────────────┬──────────────┘
               │
          ┌────┴────┐
          │ Timeout?│
          └────┬────┘
          Yes  │  No
          │    │
          ▼    ▼
       IDLE  ACTIVE
```

### Monitoring Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Trigger | "Brokkr" mentioned | Activates monitoring |
| Message window | 20 messages | From all participants combined |
| Time window | 30 minutes | Since last Brokkr response |
| Topic change | Detected via NLP | Returns to IDLE |

### Example Flow

```
Contact1: "Brokkr, what do you think about the proposal?"
  → Brokkr: [responds with opinion] → State: ACTIVE

Contact2: "I disagree with Brokkr on point 3"
  → Brokkr: [evaluates: talking about Brokkr, not TO Brokkr]
  → [decides not to respond] → State: ACTIVE

Contact3: "Did everyone see the game last night?"
  → Brokkr: [evaluates: topic changed] → State: IDLE

Contact1: "Is that what you were getting at?"
  → Brokkr: [IDLE, not monitoring] → [no response]

Contact1: "Brokkr, is that what you meant?"
  → Brokkr: [triggered by name] → State: ACTIVE → [responds]
```

## Data Available from iMessage Database

### chat.db Schema Summary

**Available directly:**

| Data | Source | Notes |
|------|--------|-------|
| Phone number/email | `handle.id` | Primary contact identifier |
| Country code | `handle.country` | e.g., "us" |
| Service type | `handle.service` | "iMessage" or "SMS" |
| Group chat name | `chat.display_name` | User-configured |
| Group members | `chat_handle_join` | All participants |
| Message content | `message.text` | Plain text |
| Timestamps | `message.date` | Mac Absolute Time format |
| Read/delivery status | `message.is_read`, etc. | iMessage only |

**NOT available (requires Apple Contacts integration):**

| Data | Alternative |
|------|-------------|
| Contact display name | Query Contacts.app via AppleScript |
| Contact full name | Query Contacts.app via AppleScript |
| Contact photo | Query Contacts.app via AppleScript |
| Relationship | Manual entry or Contacts.app |

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `.claude/skills/imessage/contacts.json` | Contact permissions storage |
| `.claude/skills/imessage/pending-questions.json` | Approval queue |
| `.claude/skills/imessage/digests/` | Daily digest storage |
| `.claude/skills/imessage/scripts/get-contact-history.js` | Context retrieval |
| `.claude/skills/imessage/scripts/get-group-history.js` | Group context |
| `.claude/skills/imessage/scripts/search-messages.js` | Message search |
| `lib/imessage-permissions.js` | Permissions management |
| `lib/imessage-context.js` | Context retrieval |
| `lib/group-monitor.js` | Group conversation state machine |
| `lib/spam-detector.js` | Spam evaluation |

### Modified Files

| File | Changes |
|------|---------|
| `imessage-bot.js` | Add universal access, context loading, permission checks |
| `lib/imessage-reader.js` | Add group query functions |
| `lib/message-parser.js` | Handle non-command messages as `/claude` |
| `lib/command-registry.js` | Add `/questions`, `/digest` commands |
| `.claude/skills/imessage/SKILL.md` | Document new capabilities |
| `.claude/skills/imessage/config.json` | Add new settings |

## User Testing Requirements

### Phase 1: Direct Message Testing (Tommy Only)

1. Send normal messages (no `/`) and verify treated as `/claude`
2. Verify session codes displayed in responses
3. Test all existing commands still work
4. Verify context retrieval from chat.db

### Phase 2: Multi-Contact Permission Testing

Test with 1-2 additional contacts with different trust levels:

1. **Untrusted contact tests:**
   - Send message, verify consultation sent to Tommy
   - Verify no session codes in responses
   - Test spam detection (send spammy messages)
   - Verify `/questions` command shows pending

2. **Partial trust contact tests:**
   - Grant specific permissions via `/<session> allow`
   - Verify permitted requests get responses
   - Verify unpermitted requests still require consultation

3. **Trust degradation tests:**
   - Deny requests and verify saved
   - Test ignore flag functionality

### Phase 3: Group Chat Testing

1. Create group with Tommy + 1-2 contacts
2. Test "Brokkr" trigger activates monitoring
3. Test response to direct questions
4. Test non-response to indirect mentions
5. Test topic change detection returns to IDLE
6. Test permission checking applies in group context

### Phase 4: Command Testing

1. Test `/questions` shows all pending approvals correctly
2. Test `/<session> allow` grants permission and responds
3. Test `/<session> deny` saves denial and responds appropriately
4. Test `/digest` shows saved digests (once implemented)

### Validation Criteria

All functionality validated only when:
- [ ] Direct messages work for Tommy with full features
- [ ] Untrusted contacts trigger consultation flow
- [ ] Permissions are correctly checked and saved
- [ ] Group conversations follow state machine rules
- [ ] No information leakage to untrusted contacts
- [ ] All commands work as documented
- [ ] Integration tests pass
- [ ] Manual testing with real contacts complete

## Next Steps

1. ~~Finalize remaining design decisions via brainstorming~~ COMPLETE
2. Add Apple Contacts research to contacts skill plan
3. Write implementation plan with bite-sized tasks
4. Implement using TDD with subagent-driven development
5. Comprehensive user testing per requirements above
