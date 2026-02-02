# Apple Mail Integration Implementation Plan

> **Architecture:** This plan follows [Apple Integration Architecture](../concepts/2026-02-01-apple-integration-architecture.md).

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Enable Brokkr to read, compose, reply, delete, and search emails via Apple Mail AppleScript integration, with automation for triage, flagging, and organization.

**Architecture:** Create a self-contained `skills/email/` skill with AppleScript files for each operation. Register `/email` command with subcommands (read, compose, reply, delete, search). All scripts communicate via JSON for structured data exchange. Use polling for inbox checks rather than push notifications (Phase 7 handles notifications).

**Tech Stack:** AppleScript (.scpt), Node.js (command handler), Apple Mail.app on macOS 14.8.3 (Sonoma)

---

## Standardized Skill Structure

```
skills/email/
├── SKILL.md                    # Main instructions (with frontmatter)
├── config.json                 # Integration-specific config
├── lib/
│   ├── email.js                # Core functionality (handler)
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── applescript-mail.md
├── scripts/                    # Reusable AppleScript files
│   ├── list-inbox.scpt
│   ├── read-message.scpt
│   ├── compose.scpt
│   ├── reply.scpt
│   ├── delete.scpt
│   ├── search.scpt
│   ├── flag.scpt
│   ├── mark-read.scpt
│   ├── list-folders.scpt
│   ├── move-to-folder.scpt
│   ├── forward.scpt
│   └── save-attachments.scpt
└── tests/
    └── email.test.js
```

## Command File

**Location:** `.claude/commands/email.md`

```yaml
---
name: email
description: Read, compose, and manage email via Apple Mail
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the email skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## SKILL.md Standard Header

**Location:** `skills/email/SKILL.md`

```yaml
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

## Usage

### Via Command (Manual)
```
/email
/email read <id>
/email compose <to> <subject>
/email reply <id>
/email search <query>
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met.

## Reference Documentation

See `reference/` directory for detailed docs.
```

## iCloud Storage Integration

Email attachments stored using `lib/icloud-storage.js`:

```javascript
// Attachments from emails → iCloud
const { getPath } = require('../../lib/icloud-storage.js');
const attachmentPath = getPath('attachments', `email-${messageId}-${filename}`);
// → ~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Attachments/YYYY-MM-DD/email-*.ext
```

## Notification Processing Criteria

| Criteria | Queue If | Drop If |
|----------|----------|---------|
| Sender | From whitelist/urgent senders | Marketing, newsletters, bulk |
| Subject | Contains urgent keywords | Regular notifications |
| Importance | Marked as important | Low priority |
| Flags | Already flagged | Already processed |
| Content | Actionable keywords present | Informational only |

---

## Research Validation (2026-02-01)

### Plan Status: 90% Production-Ready

Research against official Apple documentation confirms the plan is comprehensive and well-architected.

### Missing Features to Add

1. **Forward functionality** - Add `forward.scpt` (workaround needed for duplication bug)
2. **BCC support** - Extend compose.scpt for BCC recipients
3. **Attachment saving** - Add `save-attachments.scpt` for downloading attachments
4. **Timeout wrappers** - Add `with timeout of 600 seconds` to read-message.scpt and search.scpt

### Known Limitations (Must Document)

1. **HTML Email Composition BROKEN** - `html content` property non-functional since macOS El Capitan (2015)
2. **Message ID Volatility** - IDs change when messages are moved between mailboxes
3. **Forward Command Bug** - Using `forward` may duplicate original message; use manual copy workaround

### Recommended Timeout Wrapper

```applescript
with timeout of 600 seconds
    -- Long-running operations (read large message, search)
end timeout
```

### Official Documentation Sources

- [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/)
- [Mail Rules with AppleScript](https://support.apple.com/guide/mail/use-scripts-as-rule-actions-mlhlp1171/mac)
- [AppleScript Mail Introduction - MacTech](http://preserve.mactech.com/articles/mactech/Vol.21/21.09/ScriptingMail/index.html)

---

## Research Summary

### Apple Mail AppleScript Dictionary

Mail.app has a comprehensive AppleScript dictionary with these key classes:

| Class | Key Properties | Key Elements |
|-------|---------------|--------------|
| `application` | inbox, drafts, sent, junk, trash | accounts, mailboxes, messages |
| `account` | name, enabled, email addresses | mailboxes |
| `mailbox` | name, unread count | messages |
| `message` | subject, sender, date sent, date received, read status, flagged status, content, source | recipients, cc recipients, attachments |
| `outgoing message` | subject, content, visible | to recipients, cc recipients, attachments |
| `attachment` | name, MIME type | (file reference) |

### Key AppleScript Patterns

**Reading inbox messages:**
```applescript
tell application "Mail"
    set msgs to messages of inbox
    repeat with m in msgs
        set subj to subject of m
        set sndr to sender of m
        set rcvd to date received of m
        set body to content of m
    end repeat
end tell
```

**Getting message content (plain text):**
```applescript
tell application "Mail"
    set msgContent to content of message id theId of mailbox "INBOX" of account "iCloud"
end tell
```

**Composing and sending:**
```applescript
tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:"Test", content:"Body text", visible:true}
    tell newMessage
        make new to recipient at end of to recipients with properties {address:"test@example.com"}
    end tell
    send newMessage
end tell
```

**Replying to a message:**
```applescript
tell application "Mail"
    set theMsg to message id theId of mailbox "INBOX" of account "iCloud"
    reply theMsg with opening window
    -- or: reply theMsg with reply to all
end tell
```

**Searching:**
```applescript
tell application "Mail"
    set results to messages of inbox whose subject contains "keyword"
    -- or: whose sender contains "person@example.com"
    -- or: whose content contains "search term"
end tell
```

### macOS 14.8.3 (Sonoma) Compatibility

- Mail.app AppleScript dictionary unchanged from Ventura
- Automation permissions already granted (verified in Phase 0)
- `osascript` can execute .scpt files or inline AppleScript
- JXA (JavaScript for Automation) also available as alternative

### Memory/Performance Considerations (8GB RAM)

- Fetch messages in batches (max 50 at a time)
- Don't load full message content until requested
- Release references after processing
- Avoid keeping Mail.app in memory between operations

---

## Task 1: Create Skill Directory Structure (Standardized)

**Files:**
- Create: `skills/email/SKILL.md` (with frontmatter)
- Create: `skills/email/config.json`
- Create: `skills/email/lib/` directory
- Create: `skills/email/reference/` directory
- Create: `skills/email/scripts/` directory
- Create: `skills/email/tests/` directory
- Create: `.claude/commands/email.md`

**Step 1: Create skill directory structure**

```bash
mkdir -p skills/email/lib
mkdir -p skills/email/reference
mkdir -p skills/email/scripts
mkdir -p skills/email/tests
mkdir -p .claude/commands
```

**Step 2: Create SKILL.md with frontmatter**

```yaml
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
```

**Step 3: Create config.json**

```json
{
  "account": "iCloud",
  "email": "brokkrassist@icloud.com",
  "batch_size": 50,
  "auto_triage": false,
  "urgent_senders": [],
  "urgent_keywords": ["urgent", "asap", "emergency", "critical", "time-sensitive", "action required"],
  "timeout_seconds": 600,
  "icloud_attachments_path": "Attachments"
}
```

**Step 4: Create command file**

Create `.claude/commands/email.md`:

```yaml
---
name: email
description: Read, compose, and manage email via Apple Mail
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the email skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

**Step 5: Create reference documentation**

Create `skills/email/reference/applescript-mail.md`:

```markdown
# Apple Mail AppleScript Reference

## Official Documentation Sources

- [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/)
- [Mail Rules with AppleScript](https://support.apple.com/guide/mail/use-scripts-as-rule-actions-mlhlp1171/mac)
- [AppleScript Mail Introduction - MacTech](http://preserve.mactech.com/articles/mactech/Vol.21/21.09/ScriptingMail/index.html)

## Key Limitations

1. **HTML Email Composition BROKEN** - `html content` property non-functional since macOS El Capitan (2015)
2. **Message ID Volatility** - IDs change when messages are moved between mailboxes
3. **Forward Command Bug** - Using `forward` may duplicate original message

## Recommended Timeout Wrapper

```applescript
with timeout of 600 seconds
    -- Long-running operations (read large message, search)
end timeout
```

## Memory Considerations (8GB RAM)

- Fetch messages in batches (max 50 at a time)
- Don't load full message content until requested
- Release references after processing
```

**Step 6: Commit**

```bash
git add skills/email/ .claude/commands/email.md
git commit -m "feat(email): create standardized email skill structure"
```

---

## Task 2: Create List Inbox Script

**Files:**
- Create: `skills/email/list-inbox.scpt`
- Create: `skills/email/test-scripts.js`

**Step 1: Create list-inbox.scpt**

```applescript
-- list-inbox.scpt
-- Lists recent inbox messages with metadata
-- Output: JSON array of message objects

on run argv
    set maxCount to 20
    if (count of argv) > 0 then
        set maxCount to item 1 of argv as integer
    end if

    set jsonOutput to "["
    set isFirst to true

    tell application "Mail"
        set inboxMessages to messages of inbox
        set msgCount to count of inboxMessages

        if msgCount > maxCount then
            set msgCount to maxCount
        end if

        repeat with i from 1 to msgCount
            set theMsg to item i of inboxMessages

            set msgId to id of theMsg
            set msgSubject to subject of theMsg
            set msgSender to sender of theMsg
            set msgDate to date received of theMsg
            set msgRead to read status of theMsg
            set msgFlagged to flagged status of theMsg

            -- Escape quotes in subject and sender
            set msgSubject to my escapeJSON(msgSubject)
            set msgSender to my escapeJSON(msgSender)

            -- Format date as ISO string
            set msgDateStr to my formatDate(msgDate)

            if not isFirst then
                set jsonOutput to jsonOutput & ","
            end if
            set isFirst to false

            set jsonOutput to jsonOutput & "{" & ¬
                "\"id\":" & msgId & "," & ¬
                "\"subject\":\"" & msgSubject & "\"," & ¬
                "\"sender\":\"" & msgSender & "\"," & ¬
                "\"date\":\"" & msgDateStr & "\"," & ¬
                "\"read\":" & msgRead & "," & ¬
                "\"flagged\":" & msgFlagged & ¬
                "}"
        end repeat
    end tell

    set jsonOutput to jsonOutput & "]"
    return jsonOutput
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON

on formatDate(theDate)
    set y to year of theDate
    set m to month of theDate as integer
    set d to day of theDate
    set h to hours of theDate
    set min to minutes of theDate
    set s to seconds of theDate

    -- Zero-pad values
    if m < 10 then set m to "0" & m
    if d < 10 then set d to "0" & d
    if h < 10 then set h to "0" & h
    if min < 10 then set min to "0" & min
    if s < 10 then set s to "0" & s

    return "" & y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end formatDate
```

**Step 2: Create test script**

```javascript
#!/usr/bin/env node
// skills/email/test-scripts.js
// Test runner for email AppleScript files

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, scriptName);
  const cmd = `osascript "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`;

  console.log(`\n--- Running: ${scriptName} ${args.join(' ')} ---`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    console.log('Output:', output.trim());

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(output.trim());
      console.log('Parsed:', JSON.stringify(parsed, null, 2).slice(0, 500));
      return { success: true, data: parsed };
    } catch {
      return { success: true, data: output.trim() };
    }
  } catch (err) {
    console.error('Error:', err.message);
    return { success: false, error: err.message };
  }
}

// Test list-inbox
console.log('=== Email Script Tests ===');

const listResult = runScript('list-inbox.scpt', ['5']);
if (listResult.success && Array.isArray(listResult.data)) {
  console.log(`\n[PASS] list-inbox.scpt returned ${listResult.data.length} messages`);
} else {
  console.log('\n[FAIL] list-inbox.scpt did not return valid JSON array');
}
```

**Step 3: Test the script**

Run: `node skills/email/test-scripts.js`
Expected: JSON array of inbox messages (or empty array if inbox is empty)

**Step 4: Commit**

```bash
git add skills/email/list-inbox.scpt skills/email/test-scripts.js
git commit -m "feat(email): add list-inbox AppleScript"
```

---

## Task 3: Create Read Message Script

**Files:**
- Create: `skills/email/read-message.scpt`
- Modify: `skills/email/test-scripts.js`

**Step 1: Create read-message.scpt**

```applescript
-- read-message.scpt
-- Reads full content of a specific message by ID
-- Args: message_id
-- Output: JSON object with full message details

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer

    tell application "Mail"
        try
            -- Find message by ID across all mailboxes
            set theMsg to message id msgId

            set msgSubject to subject of theMsg
            set msgSender to sender of theMsg
            set msgDateSent to date sent of theMsg
            set msgDateRecv to date received of theMsg
            set msgRead to read status of theMsg
            set msgFlagged to flagged status of theMsg
            set msgContent to content of theMsg
            set msgMailbox to name of mailbox of theMsg

            -- Get recipients
            set toList to ""
            repeat with r in to recipients of theMsg
                if toList is not "" then set toList to toList & ", "
                set toList to toList & (address of r)
            end repeat

            -- Get CC recipients
            set ccList to ""
            repeat with r in cc recipients of theMsg
                if ccList is not "" then set ccList to ccList & ", "
                set ccList to ccList & (address of r)
            end repeat

            -- Get attachments
            set attachList to ""
            repeat with a in mail attachments of theMsg
                if attachList is not "" then set attachList to attachList & ", "
                set attachList to attachList & (name of a)
            end repeat

            -- Mark as read
            set read status of theMsg to true

            -- Escape strings
            set msgSubject to my escapeJSON(msgSubject)
            set msgSender to my escapeJSON(msgSender)
            set msgContent to my escapeJSON(msgContent)
            set toList to my escapeJSON(toList)
            set ccList to my escapeJSON(ccList)
            set attachList to my escapeJSON(attachList)
            set msgMailbox to my escapeJSON(msgMailbox)

            set jsonOutput to "{" & ¬
                "\"id\":" & msgId & "," & ¬
                "\"subject\":\"" & msgSubject & "\"," & ¬
                "\"sender\":\"" & msgSender & "\"," & ¬
                "\"to\":\"" & toList & "\"," & ¬
                "\"cc\":\"" & ccList & "\"," & ¬
                "\"date_sent\":\"" & my formatDate(msgDateSent) & "\"," & ¬
                "\"date_received\":\"" & my formatDate(msgDateRecv) & "\"," & ¬
                "\"mailbox\":\"" & msgMailbox & "\"," & ¬
                "\"read\":" & msgRead & "," & ¬
                "\"flagged\":" & msgFlagged & "," & ¬
                "\"attachments\":\"" & attachList & "\"," & ¬
                "\"content\":\"" & msgContent & "\"" & ¬
                "}"

            return jsonOutput

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON

on formatDate(theDate)
    set y to year of theDate
    set m to month of theDate as integer
    set d to day of theDate
    set h to hours of theDate
    set min to minutes of theDate
    set s to seconds of theDate

    if m < 10 then set m to "0" & m
    if d < 10 then set d to "0" & d
    if h < 10 then set h to "0" & h
    if min < 10 then set min to "0" & min
    if s < 10 then set s to "0" & s

    return "" & y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end formatDate
```

**Step 2: Add to test-scripts.js**

Add after list-inbox test:

```javascript
// Test read-message (use first message ID from list-inbox if available)
if (listResult.success && Array.isArray(listResult.data) && listResult.data.length > 0) {
  const firstMsgId = listResult.data[0].id;
  const readResult = runScript('read-message.scpt', [firstMsgId.toString()]);

  if (readResult.success && readResult.data.content !== undefined) {
    console.log(`[PASS] read-message.scpt returned message content (${readResult.data.content.length} chars)`);
  } else if (readResult.data?.error) {
    console.log(`[FAIL] read-message.scpt error: ${readResult.data.error}`);
  } else {
    console.log('[FAIL] read-message.scpt did not return expected format');
  }
} else {
  console.log('[SKIP] read-message.scpt - no messages to test with');
}
```

**Step 3: Test**

Run: `node skills/email/test-scripts.js`
Expected: Message content retrieved successfully

**Step 4: Commit**

```bash
git add skills/email/read-message.scpt skills/email/test-scripts.js
git commit -m "feat(email): add read-message AppleScript"
```

---

## Task 4: Create Compose Script

**Files:**
- Create: `skills/email/compose.scpt`
- Modify: `skills/email/test-scripts.js`

**Step 1: Create compose.scpt**

```applescript
-- compose.scpt
-- Creates and optionally sends a new email
-- Args: to_address, subject, body, [send_now: true/false]
-- Output: JSON with status

on run argv
    if (count of argv) < 3 then
        return "{\"error\": \"Required: to_address, subject, body\"}"
    end if

    set toAddress to item 1 of argv
    set msgSubject to item 2 of argv
    set msgBody to item 3 of argv
    set sendNow to false

    if (count of argv) > 3 then
        if item 4 of argv is "true" then
            set sendNow to true
        end if
    end if

    tell application "Mail"
        try
            set newMsg to make new outgoing message with properties {subject:msgSubject, content:msgBody, visible:not sendNow}

            tell newMsg
                make new to recipient at end of to recipients with properties {address:toAddress}
            end tell

            if sendNow then
                send newMsg
                return "{\"status\": \"sent\", \"to\": \"" & toAddress & "\", \"subject\": \"" & my escapeJSON(msgSubject) & "\"}"
            else
                return "{\"status\": \"draft\", \"to\": \"" & toAddress & "\", \"subject\": \"" & my escapeJSON(msgSubject) & "\", \"note\": \"Draft created and opened in Mail\"}"
            end if

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 2: Add to test-scripts.js**

Add test (draft mode only to avoid sending):

```javascript
// Test compose (draft mode only - don't actually send)
const composeResult = runScript('compose.scpt', [
  'test@example.com',
  'Test Subject from Brokkr',
  'This is a test email body.',
  'false' // Don't send, just create draft
]);

if (composeResult.success && composeResult.data.status === 'draft') {
  console.log('[PASS] compose.scpt created draft successfully');
} else if (composeResult.data?.error) {
  console.log(`[FAIL] compose.scpt error: ${composeResult.data.error}`);
} else {
  console.log('[FAIL] compose.scpt did not return expected format');
}
```

**Step 3: Test**

Run: `node skills/email/test-scripts.js`
Expected: Draft created in Mail.app

**Step 4: Commit**

```bash
git add skills/email/compose.scpt skills/email/test-scripts.js
git commit -m "feat(email): add compose AppleScript"
```

---

## Task 5: Create Reply Script

**Files:**
- Create: `skills/email/reply.scpt`
- Modify: `skills/email/test-scripts.js`

**Step 1: Create reply.scpt**

```applescript
-- reply.scpt
-- Creates a reply to a specific message
-- Args: message_id, body, [reply_all: true/false], [send_now: true/false]
-- Output: JSON with status

on run argv
    if (count of argv) < 2 then
        return "{\"error\": \"Required: message_id, body\"}"
    end if

    set msgId to item 1 of argv as integer
    set replyBody to item 2 of argv
    set replyAll to false
    set sendNow to false

    if (count of argv) > 2 then
        if item 3 of argv is "true" then
            set replyAll to true
        end if
    end if

    if (count of argv) > 3 then
        if item 4 of argv is "true" then
            set sendNow to true
        end if
    end if

    tell application "Mail"
        try
            set theMsg to message id msgId
            set origSubject to subject of theMsg
            set origSender to sender of theMsg

            if replyAll then
                set replyMsg to reply theMsg with opening window and reply to all
            else
                set replyMsg to reply theMsg with opening window
            end if

            -- Set the reply body (prepended to quoted original)
            set content of replyMsg to replyBody & return & return & content of replyMsg

            if sendNow then
                send replyMsg
                return "{\"status\": \"sent\", \"reply_to\": \"" & my escapeJSON(origSender) & "\", \"subject\": \"Re: " & my escapeJSON(origSubject) & "\", \"reply_all\": " & replyAll & "}"
            else
                return "{\"status\": \"draft\", \"reply_to\": \"" & my escapeJSON(origSender) & "\", \"subject\": \"Re: " & my escapeJSON(origSubject) & "\", \"reply_all\": " & replyAll & ", \"note\": \"Reply draft opened in Mail\"}"
            end if

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 2: Add to test-scripts.js**

```javascript
// Test reply (draft mode only)
if (listResult.success && Array.isArray(listResult.data) && listResult.data.length > 0) {
  const firstMsgId = listResult.data[0].id;
  const replyResult = runScript('reply.scpt', [
    firstMsgId.toString(),
    'Thanks for your email. This is a test reply.',
    'false', // not reply all
    'false'  // don't send
  ]);

  if (replyResult.success && replyResult.data.status === 'draft') {
    console.log('[PASS] reply.scpt created reply draft successfully');
  } else if (replyResult.data?.error) {
    console.log(`[FAIL] reply.scpt error: ${replyResult.data.error}`);
  } else {
    console.log('[FAIL] reply.scpt did not return expected format');
  }
} else {
  console.log('[SKIP] reply.scpt - no messages to test with');
}
```

**Step 3: Test**

Run: `node skills/email/test-scripts.js`
Expected: Reply draft created

**Step 4: Commit**

```bash
git add skills/email/reply.scpt skills/email/test-scripts.js
git commit -m "feat(email): add reply AppleScript"
```

---

## Task 6: Create Delete Script

**Files:**
- Create: `skills/email/delete.scpt`

**Step 1: Create delete.scpt**

```applescript
-- delete.scpt
-- Moves a message to trash
-- Args: message_id
-- Output: JSON with status

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer

    tell application "Mail"
        try
            set theMsg to message id msgId
            set msgSubject to subject of theMsg
            set msgMailbox to name of mailbox of theMsg

            -- Move to trash
            delete theMsg

            return "{\"status\": \"deleted\", \"id\": " & msgId & ", \"subject\": \"" & my escapeJSON(msgSubject) & "\", \"from_mailbox\": \"" & my escapeJSON(msgMailbox) & "\"}"

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 2: Commit**

```bash
git add skills/email/delete.scpt
git commit -m "feat(email): add delete AppleScript"
```

---

## Task 7: Create Search Script

**Files:**
- Create: `skills/email/search.scpt`
- Modify: `skills/email/test-scripts.js`

**Step 1: Create search.scpt**

```applescript
-- search.scpt
-- Searches messages by various criteria
-- Args: query, [field: subject/sender/content/all], [mailbox: name or "all"], [max_results: number]
-- Output: JSON array of matching messages

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Search query required\"}"
    end if

    set searchQuery to item 1 of argv
    set searchField to "all"
    set searchMailbox to "all"
    set maxResults to 20

    if (count of argv) > 1 then
        set searchField to item 2 of argv
    end if
    if (count of argv) > 2 then
        set searchMailbox to item 3 of argv
    end if
    if (count of argv) > 3 then
        set maxResults to item 4 of argv as integer
    end if

    set jsonOutput to "["
    set isFirst to true
    set foundCount to 0

    tell application "Mail"
        try
            -- Get mailboxes to search
            if searchMailbox is "all" then
                set mailboxesToSearch to every mailbox of every account
            else
                set mailboxesToSearch to {mailbox searchMailbox}
            end if

            -- Search inbox specifically for simplicity
            set inboxMsgs to messages of inbox

            repeat with theMsg in inboxMsgs
                if foundCount >= maxResults then exit repeat

                set matchFound to false
                set msgSubject to subject of theMsg
                set msgSender to sender of theMsg

                -- Check match based on field
                if searchField is "subject" or searchField is "all" then
                    if msgSubject contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if not matchFound and (searchField is "sender" or searchField is "all") then
                    if msgSender contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if not matchFound and (searchField is "content" or searchField is "all") then
                    set msgContent to content of theMsg
                    if msgContent contains searchQuery then
                        set matchFound to true
                    end if
                end if

                if matchFound then
                    set foundCount to foundCount + 1
                    set msgId to id of theMsg
                    set msgDate to date received of theMsg
                    set msgRead to read status of theMsg
                    set msgFlagged to flagged status of theMsg

                    if not isFirst then
                        set jsonOutput to jsonOutput & ","
                    end if
                    set isFirst to false

                    set jsonOutput to jsonOutput & "{" & ¬
                        "\"id\":" & msgId & "," & ¬
                        "\"subject\":\"" & my escapeJSON(msgSubject) & "\"," & ¬
                        "\"sender\":\"" & my escapeJSON(msgSender) & "\"," & ¬
                        "\"date\":\"" & my formatDate(msgDate) & "\"," & ¬
                        "\"read\":" & msgRead & "," & ¬
                        "\"flagged\":" & msgFlagged & ¬
                        "}"
                end if
            end repeat

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell

    set jsonOutput to jsonOutput & "]"
    return jsonOutput
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else if c is (ASCII character 10) then
            set output to output & "\\n"
        else if c is (ASCII character 13) then
            set output to output & "\\r"
        else if c is (ASCII character 9) then
            set output to output & "\\t"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON

on formatDate(theDate)
    set y to year of theDate
    set m to month of theDate as integer
    set d to day of theDate
    set h to hours of theDate
    set min to minutes of theDate
    set s to seconds of theDate

    if m < 10 then set m to "0" & m
    if d < 10 then set d to "0" & d
    if h < 10 then set h to "0" & h
    if min < 10 then set min to "0" & min
    if s < 10 then set s to "0" & s

    return "" & y & "-" & m & "-" & d & "T" & h & ":" & min & ":" & s
end formatDate
```

**Step 2: Add to test-scripts.js**

```javascript
// Test search
const searchResult = runScript('search.scpt', ['@', 'sender', 'all', '5']);

if (searchResult.success && Array.isArray(searchResult.data)) {
  console.log(`[PASS] search.scpt found ${searchResult.data.length} messages`);
} else if (searchResult.data?.error) {
  console.log(`[FAIL] search.scpt error: ${searchResult.data.error}`);
} else {
  console.log('[FAIL] search.scpt did not return expected format');
}
```

**Step 3: Test**

Run: `node skills/email/test-scripts.js`
Expected: Search results returned

**Step 4: Commit**

```bash
git add skills/email/search.scpt skills/email/test-scripts.js
git commit -m "feat(email): add search AppleScript"
```

---

## Task 8: Create Flag and Mark Read Scripts

**Files:**
- Create: `skills/email/flag.scpt`
- Create: `skills/email/mark-read.scpt`

**Step 1: Create flag.scpt**

```applescript
-- flag.scpt
-- Toggles the flagged status of a message
-- Args: message_id, [set_to: true/false/toggle]
-- Output: JSON with new status

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer
    set setTo to "toggle"

    if (count of argv) > 1 then
        set setTo to item 2 of argv
    end if

    tell application "Mail"
        try
            set theMsg to message id msgId
            set currentFlag to flagged status of theMsg

            if setTo is "toggle" then
                set newFlag to not currentFlag
            else if setTo is "true" then
                set newFlag to true
            else
                set newFlag to false
            end if

            set flagged status of theMsg to newFlag

            return "{\"id\": " & msgId & ", \"flagged\": " & newFlag & ", \"previous\": " & currentFlag & "}"

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 2: Create mark-read.scpt**

```applescript
-- mark-read.scpt
-- Sets the read status of a message
-- Args: message_id, [read: true/false]
-- Output: JSON with new status

on run argv
    if (count of argv) < 1 then
        return "{\"error\": \"Message ID required\"}"
    end if

    set msgId to item 1 of argv as integer
    set setRead to true

    if (count of argv) > 1 then
        if item 2 of argv is "false" then
            set setRead to false
        end if
    end if

    tell application "Mail"
        try
            set theMsg to message id msgId
            set previousRead to read status of theMsg
            set read status of theMsg to setRead

            return "{\"id\": " & msgId & ", \"read\": " & setRead & ", \"previous\": " & previousRead & "}"

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 3: Commit**

```bash
git add skills/email/flag.scpt skills/email/mark-read.scpt
git commit -m "feat(email): add flag and mark-read AppleScripts"
```

---

## Task 9: Create List Folders and Move Scripts

**Files:**
- Create: `skills/email/list-folders.scpt`
- Create: `skills/email/move-to-folder.scpt`

**Step 1: Create list-folders.scpt**

```applescript
-- list-folders.scpt
-- Lists all mailboxes/folders
-- Output: JSON array of mailbox objects

on run argv
    set jsonOutput to "["
    set isFirst to true

    tell application "Mail"
        repeat with acct in accounts
            set acctName to name of acct

            repeat with mbox in mailboxes of acct
                set mboxName to name of mbox
                set unreadCount to unread count of mbox
                set msgCount to count of messages of mbox

                if not isFirst then
                    set jsonOutput to jsonOutput & ","
                end if
                set isFirst to false

                set jsonOutput to jsonOutput & "{" & ¬
                    "\"account\":\"" & my escapeJSON(acctName) & "\"," & ¬
                    "\"name\":\"" & my escapeJSON(mboxName) & "\"," & ¬
                    "\"unread\":" & unreadCount & "," & ¬
                    "\"total\":" & msgCount & ¬
                    "}"
            end repeat
        end repeat
    end tell

    set jsonOutput to jsonOutput & "]"
    return jsonOutput
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 2: Create move-to-folder.scpt**

```applescript
-- move-to-folder.scpt
-- Moves a message to a specified mailbox
-- Args: message_id, mailbox_name, [account_name]
-- Output: JSON with status

on run argv
    if (count of argv) < 2 then
        return "{\"error\": \"Required: message_id, mailbox_name\"}"
    end if

    set msgId to item 1 of argv as integer
    set targetMailbox to item 2 of argv
    set targetAccount to "iCloud"

    if (count of argv) > 2 then
        set targetAccount to item 3 of argv
    end if

    tell application "Mail"
        try
            set theMsg to message id msgId
            set origMailbox to name of mailbox of theMsg

            -- Find target mailbox
            set destMailbox to mailbox targetMailbox of account targetAccount

            -- Move message
            move theMsg to destMailbox

            return "{\"status\": \"moved\", \"id\": " & msgId & ", \"from\": \"" & my escapeJSON(origMailbox) & "\", \"to\": \"" & my escapeJSON(targetMailbox) & "\"}"

        on error errMsg
            return "{\"error\": \"" & my escapeJSON(errMsg) & "\"}"
        end try
    end tell
end run

on escapeJSON(str)
    set output to ""
    repeat with c in characters of str
        if c is "\"" then
            set output to output & "\\\""
        else if c is "\\" then
            set output to output & "\\\\"
        else
            set output to output & c
        end if
    end repeat
    return output
end escapeJSON
```

**Step 3: Commit**

```bash
git add skills/email/list-folders.scpt skills/email/move-to-folder.scpt
git commit -m "feat(email): add list-folders and move-to-folder AppleScripts"
```

---

## Task 10: Create Email Handler Module

**Files:**
- Create: `skills/email/handler.js`
- Create: `tests/email-handler.test.js`

**Step 1: Write the failing test**

```javascript
// tests/email-handler.test.js
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock execSync before importing handler
const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync
}));

const { EmailHandler } = await import('../skills/email/handler.js');

describe('EmailHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new EmailHandler();
    mockExecSync.mockClear();
  });

  describe('listInbox', () => {
    it('should return parsed messages from AppleScript output', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { id: 1, subject: 'Test', sender: 'test@example.com', date: '2026-02-01T10:00:00', read: false, flagged: false }
      ]));

      const result = await handler.listInbox(10);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe('Test');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('list-inbox.scpt'),
        expect.any(Object)
      );
    });
  });

  describe('readMessage', () => {
    it('should return message content', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        id: 123,
        subject: 'Hello',
        content: 'Message body here',
        sender: 'sender@example.com'
      }));

      const result = await handler.readMessage(123);

      expect(result.content).toBe('Message body here');
      expect(result.subject).toBe('Hello');
    });

    it('should throw on message not found', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        error: 'Message not found'
      }));

      await expect(handler.readMessage(999)).rejects.toThrow('Message not found');
    });
  });

  describe('compose', () => {
    it('should create draft when sendNow is false', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'draft',
        to: 'recipient@example.com',
        subject: 'Test Subject'
      }));

      const result = await handler.compose('recipient@example.com', 'Test Subject', 'Body', false);

      expect(result.status).toBe('draft');
    });

    it('should send when sendNow is true', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 'sent',
        to: 'recipient@example.com',
        subject: 'Test Subject'
      }));

      const result = await handler.compose('recipient@example.com', 'Test Subject', 'Body', true);

      expect(result.status).toBe('sent');
    });
  });

  describe('search', () => {
    it('should return matching messages', async () => {
      mockExecSync.mockReturnValue(JSON.stringify([
        { id: 1, subject: 'Invoice 001', sender: 'vendor@example.com' },
        { id: 2, subject: 'Invoice 002', sender: 'vendor@example.com' }
      ]));

      const result = await handler.search('invoice');

      expect(result).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/email-handler.test.js`
Expected: FAIL with "Cannot find module '../skills/email/handler.js'"

**Step 3: Create handler.js**

```javascript
// skills/email/handler.js
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
let config = {
  account: 'iCloud',
  email: 'brokkrassist@icloud.com',
  batch_size: 50,
  auto_triage: false,
  urgent_senders: [],
  urgent_keywords: ['urgent', 'asap', 'emergency', 'critical']
};

try {
  const configPath = join(__dirname, 'config.json');
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch {
  console.log('[Email] Using default config');
}

/**
 * Runs an AppleScript and returns parsed JSON output
 */
function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, scriptName);
  const escapedArgs = args.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
  const cmd = `osascript "${scriptPath}" ${escapedArgs}`;

  const output = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024 // 10MB for large message content
  });

  const result = JSON.parse(output.trim());

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

export class EmailHandler {
  constructor(customConfig = null) {
    this.config = customConfig || config;
  }

  /**
   * List recent inbox messages
   * @param {number} count - Max messages to return
   * @returns {Promise<Array>} Array of message objects
   */
  async listInbox(count = 20) {
    const maxCount = Math.min(count, this.config.batch_size);
    return runScript('list-inbox.scpt', [maxCount]);
  }

  /**
   * Read full message content
   * @param {number} messageId - Message ID
   * @returns {Promise<Object>} Message object with content
   */
  async readMessage(messageId) {
    return runScript('read-message.scpt', [messageId]);
  }

  /**
   * Compose new email
   * @param {string} to - Recipient address
   * @param {string} subject - Email subject
   * @param {string} body - Email body
   * @param {boolean} sendNow - Send immediately or create draft
   * @returns {Promise<Object>} Status object
   */
  async compose(to, subject, body, sendNow = false) {
    return runScript('compose.scpt', [to, subject, body, sendNow ? 'true' : 'false']);
  }

  /**
   * Reply to a message
   * @param {number} messageId - Message ID to reply to
   * @param {string} body - Reply body
   * @param {boolean} replyAll - Reply to all recipients
   * @param {boolean} sendNow - Send immediately or create draft
   * @returns {Promise<Object>} Status object
   */
  async reply(messageId, body, replyAll = false, sendNow = false) {
    return runScript('reply.scpt', [messageId, body, replyAll ? 'true' : 'false', sendNow ? 'true' : 'false']);
  }

  /**
   * Delete a message (move to trash)
   * @param {number} messageId - Message ID
   * @returns {Promise<Object>} Status object
   */
  async delete(messageId) {
    return runScript('delete.scpt', [messageId]);
  }

  /**
   * Search messages
   * @param {string} query - Search query
   * @param {string} field - Field to search: subject, sender, content, all
   * @param {number} maxResults - Max results to return
   * @returns {Promise<Array>} Array of matching messages
   */
  async search(query, field = 'all', maxResults = 20) {
    return runScript('search.scpt', [query, field, 'all', maxResults]);
  }

  /**
   * Toggle or set message flag
   * @param {number} messageId - Message ID
   * @param {boolean|null} flagged - Set to true/false, or null to toggle
   * @returns {Promise<Object>} Status object
   */
  async flag(messageId, flagged = null) {
    const setTo = flagged === null ? 'toggle' : (flagged ? 'true' : 'false');
    return runScript('flag.scpt', [messageId, setTo]);
  }

  /**
   * Mark message as read or unread
   * @param {number} messageId - Message ID
   * @param {boolean} read - Set read status
   * @returns {Promise<Object>} Status object
   */
  async markRead(messageId, read = true) {
    return runScript('mark-read.scpt', [messageId, read ? 'true' : 'false']);
  }

  /**
   * List all mailboxes/folders
   * @returns {Promise<Array>} Array of mailbox objects
   */
  async listFolders() {
    return runScript('list-folders.scpt');
  }

  /**
   * Move message to a folder
   * @param {number} messageId - Message ID
   * @param {string} folderName - Target folder name
   * @returns {Promise<Object>} Status object
   */
  async moveToFolder(messageId, folderName) {
    return runScript('move-to-folder.scpt', [messageId, folderName, this.config.account]);
  }

  /**
   * Get inbox summary
   * @returns {Promise<Object>} Summary with unread count, total, recent messages
   */
  async getInboxSummary() {
    const messages = await this.listInbox(10);
    const unreadCount = messages.filter(m => !m.read).length;

    return {
      unread: unreadCount,
      total: messages.length,
      recent: messages.slice(0, 5).map(m => ({
        id: m.id,
        subject: m.subject,
        sender: m.sender,
        date: m.date,
        read: m.read,
        flagged: m.flagged
      }))
    };
  }

  /**
   * Triage inbox - identify urgent messages
   * @returns {Promise<Object>} Triage results with urgent messages
   */
  async triageInbox() {
    const messages = await this.listInbox(50);
    const urgent = [];

    for (const msg of messages) {
      // Check for urgent senders
      const isUrgentSender = this.config.urgent_senders.some(s =>
        msg.sender.toLowerCase().includes(s.toLowerCase())
      );

      // Check for urgent keywords in subject
      const hasUrgentKeyword = this.config.urgent_keywords.some(k =>
        msg.subject.toLowerCase().includes(k.toLowerCase())
      );

      if (isUrgentSender || hasUrgentKeyword) {
        urgent.push({
          ...msg,
          reason: isUrgentSender ? 'urgent_sender' : 'urgent_keyword'
        });

        // Auto-flag urgent messages
        if (!msg.flagged) {
          await this.flag(msg.id, true);
        }
      }
    }

    return {
      total_scanned: messages.length,
      urgent_count: urgent.length,
      urgent_messages: urgent
    };
  }
}

// Export singleton instance
export const emailHandler = new EmailHandler();
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/email-handler.test.js`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add skills/email/handler.js tests/email-handler.test.js
git commit -m "feat(email): add EmailHandler module"
```

---

## Task 11: Register Email Command (Standardized)

**Files:**
- Verify: `.claude/commands/email.md` (created in Task 1)

**Step 1: Verify command file exists**

The command file was created in Task 1 at `.claude/commands/email.md`. Verify it exists:

```bash
cat .claude/commands/email.md
```

Expected output:
```yaml
---
name: email
description: Read, compose, and manage email via Apple Mail
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the email skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

**Step 2: Test command invocation**

```bash
node dry-run-test.js "/email"
node dry-run-test.js "/email read 123"
node dry-run-test.js "/email compose test@example.com \"Test Subject\""
```

Expected: Commands parsed correctly with skill handler

**Step 3: Commit (if not already committed)**

```bash
git add .claude/commands/email.md
git commit -m "feat(email): register /email command via Claude commands"
```

---

## Task 12: Create Email Skill Executor

**Files:**
- Create: `skills/email/executor.js`

**Step 1: Create executor.js**

This file handles the skill invocation and routes to appropriate handler methods.

```javascript
// skills/email/executor.js
import { EmailHandler } from './handler.js';

const handler = new EmailHandler();

/**
 * Execute email skill
 * @param {string} action - Subcommand: read, compose, reply, delete, search, flag, folders
 * @param {string[]} args - Additional arguments
 * @returns {Promise<string>} Formatted response
 */
export async function execute(action, args = []) {
  // Default action is inbox summary
  if (!action || action === 'inbox' || action === 'check') {
    return await handleInboxSummary();
  }

  switch (action.toLowerCase()) {
    case 'read':
      return await handleRead(args);
    case 'compose':
    case 'send':
      return await handleCompose(args);
    case 'reply':
      return await handleReply(args);
    case 'delete':
    case 'trash':
      return await handleDelete(args);
    case 'search':
    case 'find':
      return await handleSearch(args);
    case 'flag':
      return await handleFlag(args);
    case 'folders':
    case 'mailboxes':
      return await handleFolders();
    case 'triage':
      return await handleTriage();
    default:
      return `Unknown email action: ${action}\n\nAvailable actions:\n- /email (check inbox)\n- /email read <id>\n- /email compose <to> <subject>\n- /email reply <id>\n- /email delete <id>\n- /email search <query>\n- /email flag <id>\n- /email folders\n- /email triage`;
  }
}

async function handleInboxSummary() {
  const summary = await handler.getInboxSummary();

  let output = `Inbox: ${summary.unread} unread\n\nRecent:\n`;

  for (let i = 0; i < summary.recent.length; i++) {
    const msg = summary.recent[i];
    const flags = [];
    if (!msg.read) flags.push('UNREAD');
    if (msg.flagged) flags.push('FLAGGED');
    const flagStr = flags.length > 0 ? `[${flags.join(', ')}] ` : '';

    const date = formatRelativeDate(msg.date);
    output += `${i + 1}. ${flagStr}${msg.sender.split('<')[0].trim()} - ${msg.subject} (${date})\n`;
  }

  output += `\nUse /email read <number> to read a message`;
  return output;
}

async function handleRead(args) {
  if (args.length === 0) {
    return 'Usage: /email read <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    // Try to get message by index from recent list
    const summary = await handler.getInboxSummary();
    const index = parseInt(args[0], 10) - 1;
    if (index >= 0 && index < summary.recent.length) {
      const msg = await handler.readMessage(summary.recent[index].id);
      return formatMessage(msg);
    }
    return 'Invalid message ID. Use a number from /email list.';
  }

  const msg = await handler.readMessage(msgId);
  return formatMessage(msg);
}

async function handleCompose(args) {
  if (args.length < 2) {
    return 'Usage: /email compose <to> <subject> [body]';
  }

  const to = args[0];
  const subject = args[1];
  const body = args.slice(2).join(' ') || '';

  const result = await handler.compose(to, subject, body, false);

  if (result.status === 'draft') {
    return `Draft created:\nTo: ${to}\nSubject: ${subject}\n\nDraft opened in Mail.app. Add body and send from there.`;
  }

  return `Email sent to ${to}`;
}

async function handleReply(args) {
  if (args.length < 1) {
    return 'Usage: /email reply <message_id> [body]';
  }

  const msgId = parseInt(args[0], 10);
  const body = args.slice(1).join(' ') || '';

  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.reply(msgId, body, false, false);
  return `Reply draft created for: ${result.reply_to}\nSubject: ${result.subject}\n\nDraft opened in Mail.app.`;
}

async function handleDelete(args) {
  if (args.length === 0) {
    return 'Usage: /email delete <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.delete(msgId);
  return `Deleted: ${result.subject}\n(Moved to Trash)`;
}

async function handleSearch(args) {
  if (args.length === 0) {
    return 'Usage: /email search <query> [field:subject|sender|content]';
  }

  const query = args[0];
  const field = args[1] || 'all';

  const results = await handler.search(query, field, 10);

  if (results.length === 0) {
    return `No messages found matching "${query}"`;
  }

  let output = `Found ${results.length} messages:\n\n`;
  for (let i = 0; i < results.length; i++) {
    const msg = results[i];
    const date = formatRelativeDate(msg.date);
    output += `${i + 1}. ${msg.sender.split('<')[0].trim()} - ${msg.subject} (${date})\n`;
    output += `   ID: ${msg.id}\n`;
  }

  return output;
}

async function handleFlag(args) {
  if (args.length === 0) {
    return 'Usage: /email flag <message_id>';
  }

  const msgId = parseInt(args[0], 10);
  if (isNaN(msgId)) {
    return 'Invalid message ID';
  }

  const result = await handler.flag(msgId);
  return `Message ${msgId} is now ${result.flagged ? 'flagged' : 'unflagged'}`;
}

async function handleFolders() {
  const folders = await handler.listFolders();

  let output = 'Mailboxes:\n\n';
  let currentAccount = '';

  for (const folder of folders) {
    if (folder.account !== currentAccount) {
      currentAccount = folder.account;
      output += `[${currentAccount}]\n`;
    }
    output += `  ${folder.name} (${folder.unread} unread, ${folder.total} total)\n`;
  }

  return output;
}

async function handleTriage() {
  const result = await handler.triageInbox();

  if (result.urgent_count === 0) {
    return `Scanned ${result.total_scanned} messages. No urgent items found.`;
  }

  let output = `Scanned ${result.total_scanned} messages.\n\n`;
  output += `${result.urgent_count} URGENT message(s):\n\n`;

  for (const msg of result.urgent_messages) {
    const reason = msg.reason === 'urgent_sender' ? 'Urgent sender' : 'Urgent keyword';
    output += `- ${msg.sender.split('<')[0].trim()}: ${msg.subject}\n`;
    output += `  (${reason}, ID: ${msg.id})\n`;
  }

  return output;
}

function formatMessage(msg) {
  let output = `From: ${msg.sender}\n`;
  output += `To: ${msg.to}\n`;
  if (msg.cc) output += `CC: ${msg.cc}\n`;
  output += `Date: ${msg.date_received}\n`;
  output += `Subject: ${msg.subject}\n`;
  if (msg.attachments) output += `Attachments: ${msg.attachments}\n`;
  output += `\n---\n\n`;
  output += msg.content;

  return output;
}

function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}
```

**Step 2: Commit**

```bash
git add skills/email/executor.js
git commit -m "feat(email): add skill executor for command routing"
```

---

## Task 13: Update SKILL.md with Automation Examples

**Files:**
- Modify: `skills/email/SKILL.md`

**Step 1: Add automation section**

Append to SKILL.md:

```markdown

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
```

**Step 2: Commit**

```bash
git add skills/email/SKILL.md
git commit -m "docs(email): add automation capabilities and troubleshooting"
```

---

## Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add email commands to WhatsApp Commands table**

Find the "WhatsApp Commands" section and add:

```markdown
| `/email` | Check inbox summary |
| `/email read <id>` | Read specific message |
| `/email compose <to> <subject>` | Compose new email |
| `/email reply <id>` | Reply to message |
| `/email search <query>` | Search messages |
```

**Step 2: Update Capabilities section**

Change the Apple Mail line from "Planned" to active:

```markdown
- **Apple Mail**: Read, compose, reply, delete, organize emails via AppleScript
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add email commands to CLAUDE.md"
```

---

## Task 15: Integration Test

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run email script tests**

Run: `node skills/email/test-scripts.js`
Expected: All scripts execute successfully

**Step 3: Test command registration**

Run:
```bash
node --input-type=module -e "
import { CommandRegistry } from './lib/command-registry.js';
const registry = new CommandRegistry().discover();
console.log('Email command:', registry.get('email')?.name);
console.log('Aliases:', registry.get('mail')?.name, registry.get('e')?.name);
"
```

Expected: "email" for all lookups

**Step 4: Manual test via dry-run**

Run: `node dry-run-test.js "/email"`
Expected: Command parsed correctly

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(email): complete Apple Mail integration"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `skills/email/SKILL.md`, `config.json` | Skill structure |
| 2 | `skills/email/list-inbox.scpt`, `test-scripts.js` | List inbox |
| 3 | `skills/email/read-message.scpt` | Read message |
| 4 | `skills/email/compose.scpt` | Compose email |
| 5 | `skills/email/reply.scpt` | Reply to message |
| 6 | `skills/email/delete.scpt` | Delete message |
| 7 | `skills/email/search.scpt` | Search messages |
| 8 | `skills/email/flag.scpt`, `mark-read.scpt` | Flag/mark read |
| 9 | `skills/email/list-folders.scpt`, `move-to-folder.scpt` | Folder management |
| 10 | `skills/email/handler.js`, `tests/email-handler.test.js` | Handler module |
| 11 | `.brokkr/commands/email/command.json` | Command registration |
| 12 | `skills/email/executor.js` | Skill executor |
| 13 | `skills/email/SKILL.md` | Automation docs |
| 14 | `CLAUDE.md` | Documentation |
| 15 | - | Integration test |

## Architecture Notes

```
User: /email read 123
  |
  v
message-parser.js -> Parses command
  |
  v
command-registry.js -> Looks up "email" command
  |
  v
handler (skill type) -> Invokes email skill
  |
  v
skills/email/executor.js -> Routes to handleRead()
  |
  v
skills/email/handler.js -> Calls readMessage(123)
  |
  v
skills/email/read-message.scpt -> AppleScript execution
  |
  v
Mail.app -> Returns message data
  |
  v
JSON response -> Formatted for WhatsApp
```

## Memory Considerations (8GB RAM)

1. **Batch Size**: Config limits fetches to 50 messages max
2. **No Persistence**: Message data not cached in memory
3. **Serial Execution**: One AppleScript at a time
4. **Cleanup**: Handler releases AppleScript process after each call
5. **Content Streaming**: Large messages truncated in list view, full content only on read
