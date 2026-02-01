# Brokkr Self-Improvement System

**Status:** In Progress
**Created:** 2026-01-31
**Updated:** 2026-02-01
**Owner:** Tommy Johnson (tommyjohnson90@gmail.com)
**System:** macOS 14.8.3 (Sonoma) - MacBook Pro 8GB RAM

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 - macOS Setup | ✅ Complete | All AppleScript permissions verified |
| BrokkrMVP Webhooks | ✅ Complete | HMAC, callbacks, session resume working |
| Phase 1 - iMessage | 🔲 Not Started | Next priority |
| Phase 2 - Email | 🔲 Not Started | |
| Phase 3 - Apple Apps (Core) | 🔲 Not Started | Calendar, Reminders, Notes, iCloud Sharing |
| Phase 4 - Apple Apps (Extended) | 🔲 Not Started | Contacts, Safari, Finder, Clipboard, Music |
| Phase 5 - Screen Recording & Video | 🔲 Not Started | screencapture, Remotion tutorials |
| Phase 6 - Shortcuts & Automation | 🔲 Not Started | Shortcuts bridge, Focus, Location |
| Phase 7 - Notifications | 🔲 Not Started | |
| Phase 8 - Self-Improvement | 🔲 Not Started | |
| Phase 9 - Refinement | 🔲 Not Started | |

### Research Status

| Service | AppleScript | Status | Notes |
|---------|-------------|--------|-------|
| Messages | ✅ Full | Verified | Permissions working |
| Mail | ✅ Full | Verified | Permissions working |
| Calendar | ✅ Full | Verified | 5 calendars found |
| Reminders | ✅ Full | Verified | 1 list found |
| Notes | ✅ Full | Verified | 1 folder found |
| Contacts | ✅ Full | Researched | Full dictionary available |
| Chrome | ✅ Configured | In Use | Primary browser, skill needs build |
| Finder | ✅ Full | Researched | Scriptable + recordable |
| Shortcuts | ✅ Full | Researched | Via Shortcuts Events |
| Music | ✅ Full | Researched | Renamed from iTunes |
| Clipboard | ✅ Built-in | Researched | Native commands |
| Spotlight | ✅ Via shell | Researched | mdfind/mdls |
| Screen Recording | ✅ Via shell | Researched | screencapture -v |
| Focus Modes | ⚠️ Limited | Researched | JXA read, Shortcuts write |
| Location | ⚠️ Limited | Researched | Use Shortcuts bridge |
| Podcasts | ❌ None | Researched | No dictionary, SQLite only |

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

  icloud-sharing/
    skill.md
    share-file.sh         # Share file to Family Sharing folder
    list-shared.sh        # List files in shared folder
    get-shared.sh         # Retrieve shared file from Tommy
    sync-status.sh        # Check iCloud sync status

  shortcuts/
    skill.md
    run-shortcut.scpt     # Run a Shortcuts app shortcut by name
    list-shortcuts.scpt   # List available shortcuts

  contacts/
    skill.md
    find-contact.scpt     # Find contact by name/email/phone
    add-contact.scpt      # Create new contact
    update-contact.scpt   # Modify existing contact
    list-groups.scpt      # List contact groups

  chrome/
    skill.md
    open-url.js           # Open URL in Chrome (Puppeteer)
    get-current-url.js    # Get URL of active tab
    get-page-content.js   # Extract page text content
    run-javascript.js     # Execute JS in current page
    screenshot.js         # Capture page screenshot
    fill-form.js          # Fill form fields
    click-element.js      # Click element by selector
    wait-for.js           # Wait for element/navigation

  finder/
    skill.md
    move-files.scpt       # Move files between folders
    copy-files.scpt       # Copy files
    rename-file.scpt      # Rename file/folder
    create-folder.scpt    # Create new folder
    get-selection.scpt    # Get currently selected items
    reveal-file.scpt      # Show file in Finder
    folder-action.scpt    # Attach folder action scripts

  clipboard/
    skill.md
    get-clipboard.scpt    # Read clipboard contents
    set-clipboard.scpt    # Set clipboard contents
    clipboard-history.sh  # Track recent clipboard items

  spotlight/
    skill.md
    search-files.sh       # Search files via mdfind
    search-content.sh     # Search file contents via mdfind
    get-metadata.sh       # Get file metadata via mdls

  screen-capture/
    skill.md
    screenshot.sh         # Capture screenshot (screencapture)
    record-screen.sh      # Record screen video (screencapture -v)
    record-window.sh      # Record specific window
    record-region.sh      # Record screen region

  music/
    skill.md
    play-pause.scpt       # Toggle playback
    next-track.scpt       # Skip to next
    search-library.scpt   # Search music library
    get-now-playing.scpt  # Current track info
    create-playlist.scpt  # Create new playlist
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

## iCloud Family Sharing Integration

Brokkr and Tommy share an iCloud Family Sharing account. Brokkr can share documents, reports, and files with Tommy via the shared iCloud folder.

### Shared Folder Location

```
~/Library/Mobile Documents/com~apple~CloudDocs/Family/
```

Or a dedicated subfolder like `Brokkr-Shared/` for organization.

### Use Cases

- Share generated reports (daily summaries, analytics)
- Share downloaded files or documents
- Share exported data or backups
- Receive files from Tommy for processing

### Commands

| Command | Description |
|---------|-------------|
| `/share <file>` | Copy file to shared iCloud folder |
| `/shared` | List files in shared folder |
| `/shared get <file>` | Retrieve file Tommy shared |

### Sync Considerations

- iCloud sync is not instant - may take seconds to minutes
- Check sync status before confirming share complete
- Large files take longer to sync
- Notify Tommy via iMessage when important files are shared

## Screen Recording & Video Creation (Remotion)

Brokkr can create tutorial videos for brokkr.co using screen recording and Remotion.

### Screen Recording Capabilities

macOS 14.8.3 includes built-in screen recording via `screencapture`:

```bash
# Record entire screen (Ctrl+C to stop)
screencapture -v output.mov

# Record for specific duration (seconds)
screencapture -V 30 output.mov

# Record specific display (1=main, 2=secondary)
screencapture -D 1 -v output.mov

# Record with audio source
screencapture -v -G <audio-id> output.mov

# Record specific window by ID
screencapture -v -l <windowid> output.mov

# Record specific region
screencapture -v -R x,y,width,height output.mov
```

### Remotion Integration

Remotion creates videos programmatically using React. Combined with Claude Code, it enables AI-powered tutorial video generation.

**Setup Required:**
```bash
# Install Remotion
npx create-video@latest --blank

# Or scaffold full project
npx create-remotion-app
```

**Workflow for Tutorial Videos:**
1. Screen record user flow in brokkr.co app
2. Use Remotion to add: intro/outro, annotations, callouts, transitions
3. Render final video programmatically
4. Share via iCloud Family Sharing or direct upload

**Use Cases:**
- How to create a task in brokkr.co
- How to view task progress
- How to manage agent settings
- Feature announcement videos
- Onboarding walkthroughs

### Commands

| Command | Description |
|---------|-------------|
| `/record` | Start screen recording |
| `/record stop` | Stop recording |
| `/record <url>` | Record while navigating URL |
| `/video create <topic>` | Create tutorial video with Remotion |

## Shortcuts Integration

Run macOS Shortcuts app automations from Brokkr. Shortcuts can bridge to iOS automations and access services without AppleScript dictionaries.

### Commands

| Command | Description |
|---------|-------------|
| `/shortcut <name>` | Run shortcut by name |
| `/shortcuts` | List available shortcuts |

### Use Cases

- Bridge to iOS automations (Focus modes sync across devices)
- Access Location Services via "Get current location" action
- Run complex multi-app workflows
- Trigger HomeKit scenes

### AppleScript Integration

```applescript
-- Run a shortcut by name
tell application "Shortcuts Events"
    run shortcut "My Shortcut Name"
end tell

-- Run with input
tell application "Shortcuts Events"
    run shortcut "Process Text" with input "Hello World"
end tell
```

## Contacts Integration

Access and manage macOS Contacts for person lookup and contact management.

### Commands

| Command | Description |
|---------|-------------|
| `/contact <name>` | Find contact by name |
| `/contact add <name>` | Create new contact |

### Use Cases

- Look up email/phone before sending messages
- Add new contacts from email signatures
- Enrich task context with contact info
- Birthday/anniversary reminders

### AppleScript Examples

```applescript
-- Find contact by name
tell application "Contacts"
    set foundPeople to people whose name contains "John"
    repeat with p in foundPeople
        log name of p & ": " & value of first email of p
    end repeat
end tell

-- Create new contact
tell application "Contacts"
    set newPerson to make new person with properties {first name:"Jane", last name:"Doe"}
    make new email at end of emails of newPerson with properties {label:"work", value:"jane@example.com"}
    save
end tell
```

## Chrome Browser Skill

Chrome is already configured for browser automation. This skill formalizes the patterns for efficient agent use.

### Current Setup

- Chrome installed and running in visible mode
- Used by WhatsApp bot (whatsapp-web.js)
- Available for general web automation tasks

### Commands

| Command | Description |
|---------|-------------|
| `/browse <url>` | Open URL in Chrome |
| `/browse screenshot` | Capture current page |
| `/browse fill <selector> <value>` | Fill form field |
| `/browse click <selector>` | Click element |

### Skill Requirements (To Build)

The Chrome skill should provide reusable patterns for:

1. **Page Navigation** - Open URLs, wait for load, handle redirects
2. **Content Extraction** - Get page text, extract structured data
3. **Form Interaction** - Fill fields, submit forms, handle dropdowns
4. **Authentication** - Login flows, session management
5. **Screenshot/Recording** - Capture pages, record flows
6. **Error Handling** - Retry logic, timeout handling, CAPTCHA detection

### Integration Notes

- Chrome is shared with WhatsApp bot - coordinate access
- Use Puppeteer for programmatic control
- Visible Chrome allows manual intervention if needed
- Keep sessions separate to avoid conflicts

## Finder & File Management

Advanced file operations beyond basic shell commands.

### Commands

| Command | Description |
|---------|-------------|
| `/find <query>` | Search files via Spotlight |
| `/organize <folder>` | Apply organization rules |
| `/reveal <path>` | Show file in Finder |

### Use Cases

- Smart file organization
- Folder action triggers (auto-process uploaded files)
- Desktop cleanup automation
- Recent files quick access

### Spotlight Search (mdfind)

```bash
# Search file contents
mdfind "meeting notes"

# Search in specific folder
mdfind -onlyin ~/Documents "invoice"

# Search by file type
mdfind "kMDItemKind == 'PDF'"

# Search by date
mdfind "kMDItemContentModificationDate > $time.today(-7)"
```

## Clipboard Management

Cross-app data transfer and text processing.

### Commands

| Command | Description |
|---------|-------------|
| `/clipboard` | Show current clipboard |
| `/clipboard set <text>` | Set clipboard contents |

### AppleScript Examples

```applescript
-- Get clipboard
set clipContent to the clipboard

-- Set clipboard to text
set the clipboard to "New content"

-- Set clipboard to file reference
set the clipboard to POSIX file "/path/to/file"
```

## Music Control

Control Apple Music playback and manage library.

### Commands

| Command | Description |
|---------|-------------|
| `/music` | Now playing info |
| `/music play` | Start playback |
| `/music pause` | Pause playback |
| `/music next` | Next track |
| `/music search <query>` | Search library |

### AppleScript Examples

```applescript
-- Get now playing
tell application "Music"
    if player state is playing then
        set trackName to name of current track
        set artistName to artist of current track
        return trackName & " by " & artistName
    end if
end tell

-- Play/pause toggle
tell application "Music"
    playpause
end tell
```

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

### Phase 0 - macOS System Setup ✅ COMPLETE

Configure macOS for autonomous operation. These settings allow Brokkr to run 24/7 without user intervention.

**Verified 2026-02-01:** All AppleScript permissions working. Power management handled by caffeinate.

#### Power Management (Prevent Sleep)

```bash
# Prevent system sleep
sudo pmset -a sleep 0

# Prevent disk sleep
sudo pmset -a disksleep 0

# Prevent display sleep
sudo pmset -a displaysleep 0

# Disable standby/hibernate
sudo pmset -a standby 0
sudo pmset -a hibernatemode 0

# Verify with: pmset -g
```

#### Privacy & Security Permissions (System Settings → Privacy & Security)

**Accessibility** (required for AppleScript UI control):
- [ ] Terminal
- [ ] osascript (if appears)
- [ ] Script Editor

**Full Disk Access** (required for reading Mail, Messages, TCC database):
- [ ] Terminal
- [ ] /opt/homebrew/opt/node@22/bin/node

**Automation** (grant Terminal control over each app):
- [x] Terminal → System Events
- [x] Terminal → Messages
- [x] Terminal → Mail
- [x] Terminal → Calendar
- [x] Terminal → Reminders
- [x] Terminal → Notes
- [x] Terminal → Finder

*Note: Automation permissions prompt automatically on first use. Approve when prompted.*

#### Lock Screen Settings (System Settings → Lock Screen)

- [ ] "Turn display off when inactive" → Never
- [ ] "Require password after screen saver" → Never (or long delay)

#### FileVault Note

FileVault is ON (recommended for security). This means:
- After reboot, password required once to unlock disk
- After unlock, Brokkr auto-starts via launchd
- No fully unattended reboot possible without disabling FileVault

#### Verification After Terminal Restart

After restarting Terminal, verify permissions work:

```bash
# Test AppleScript access to Messages
osascript -e 'tell application "Messages" to get name'

# Test AppleScript access to Calendar
osascript -e 'tell application "Calendar" to get name of calendars'

# Test AppleScript access to Mail
osascript -e 'tell application "Mail" to get name of mailboxes'

# Test AppleScript access to Reminders
osascript -e 'tell application "Reminders" to get name of lists'

# Test AppleScript access to Notes
osascript -e 'tell application "Notes" to get name of folders'

# Verify power settings
pmset -g
```

If any command fails with "not authorized", re-check the Automation permissions in System Settings.

### Phase 1 - iMessage Foundation
1. iMessage skill (send/receive scripts)
2. Message polling integration
3. Shared session handling across channels

### Phase 2 - Email Integration
4. Email skill with full CRUD operations
5. Basic triage automation
6. Email command parsing

### Phase 3 - Apple Apps (Core)
7. Calendar skill
8. Reminders skill
9. Notes skill
10. iCloud Family Sharing skill

### Phase 4 - Apple Apps (Extended)
11. Contacts skill
12. Chrome skill (formalize existing setup)
13. Finder/Spotlight skill
14. Clipboard skill
15. Music skill

### Phase 5 - Screen Recording & Video
16. Screen capture skill (screencapture)
17. Screen recording skill (screencapture -v)
18. Remotion integration for tutorial videos
19. Video workflow automation

### Phase 6 - Shortcuts & Automation
20. Shortcuts skill (run/list shortcuts)
21. Shortcuts bridge for iOS integrations
22. Location via Shortcuts
23. Focus mode control via Shortcuts

### Phase 7 - System Notifications
24. Notification trigger system
25. Shared calendar/notes/reminders reactions
26. Email notification handling

### Phase 8 - Self-Improvement
27. Urgency learning system
28. Self-maintenance routines
29. Pattern detection and shortcuts

### Phase 9 - Refinement
30. Morning briefing automation
31. Cross-skill workflows
32. Adaptive optimization

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

### iCloud Family Sharing
- [ ] Locate Family Sharing folder path
- [ ] Check iCloud sync status programmatically
- [ ] Handle sync delays gracefully
- [ ] File permissions in shared folders

---

## Research Completed (2026-02-01)

### Shortcuts ✅
- Full AppleScript dictionary via Shortcuts Events app
- Can run shortcuts by name with input parameters
- Shortcuts can bridge to iOS (Focus, Location sync across devices)
- Can run shell scripts and AppleScript within Shortcuts

### Contacts ✅
- Full AppleScript dictionary in Contacts.app
- Can create, find, modify contacts
- Access to all fields: name, email, phone, address, notes
- Contact groups supported

### Chrome ✅ (In Use)
- Already configured for WhatsApp bot
- Puppeteer available for programmatic control
- Visible mode allows manual intervention
- Skill needs to be formalized for efficient agent use

### Finder ✅
- Fully scriptable and recordable
- File operations: move, copy, rename, create
- Folder actions for auto-processing
- Works with aliases and POSIX paths

### Spotlight/mdfind ✅
- Via shell command `mdfind` in AppleScript
- Content search and metadata queries
- Can search specific folders with `-onlyin`
- Full metadata access via `mdls`

### Clipboard ✅
- Built-in AppleScript commands: `the clipboard`, `set the clipboard to`
- Supports text, files, images
- Image format conversion possible (TIFF, PNG, JPEG)
- Can use `pbcopy`/`pbpaste` via shell

### Screen Recording ✅
- Built-in `screencapture -v` for video recording on macOS 14.8.3
- Can record: full screen, specific display, window, or region
- Audio capture supported with `-G` flag
- No ffmpeg required (though can install via Homebrew for advanced editing)

### Music ✅
- Full AppleScript dictionary (renamed from iTunes)
- Playback control, library search, playlist management
- Note: Podcasts app has NO AppleScript dictionary (data in SQLite)

### Focus Modes ⚠️ (Limited)
- No direct AppleScript dictionary
- Can READ status via JXA workaround
- Setting requires UI scripting or Shortcuts bridge
- Shortcuts on iPhone can trigger when Mac Focus changes

### Location ⚠️ (Limited)
- CoreLocationCLI broken in macOS Ventura+
- Use Shortcuts "Get current location" action as bridge
- Location Helper app available for AppleScript access
- Full CoreLocation requires compiled Swift app

## Constraints

- **8GB RAM** - Serial execution, unload resources aggressively
- **No blocking** - Never wait for human input, find workarounds
- **iCloud sync** - All Apple apps sync via iCloud, respect sync delays
- **Privacy** - Credentials in CLAUDE.md, don't log sensitive content

## Required Review: BrokkrMVP Webhook Integration (GitHub Issue #1)

**IMPORTANT: Review and fully understand before making ANY webhook changes.**

Issue: https://github.com/brokkr-agent/brokkr-agent/issues/1

The BrokkrMVP dev team has posted a comprehensive webhook integration protocol that supersedes the current webhook implementation. This must be reviewed and understood before any webhook modifications.

### Key Changes from Issue #1

| Current | New Protocol |
|---------|--------------|
| Simple POST /webhook | HMAC-signed webhooks with X-Agent-Id, X-Timestamp, X-Signature headers |
| Agent polls for status | Agent sends callbacks to BrokkrMVP callback endpoint |
| No heartbeat | 30-second heartbeat required |
| Simple accept/reject | Fat payload with full task context |
| Basic status | Status values: processing, needs_input, completed, failed |
| No usage tracking | Token usage tracking required in callbacks |

### New Endpoints Required

1. **Webhook Endpoint (update existing)**
   - Add HMAC signature verification
   - Handle new event types: `task.created`, `task.clarification`, `task.cancelled`

2. **Callback System (new)**
   - Send results to `POST https://api.brokkr.app/api/agent/callback/{task_id}`
   - Include usage data, session_code, output_data

3. **Heartbeat System (new)**
   - Send heartbeat every 30 seconds to `POST https://api.brokkr.app/api/agent/heartbeat`
   - Include queue_depth, status, capabilities

### Implementation Checklist (from Issue #1) ✅ COMPLETE

- [x] HMAC signature verification on incoming webhooks
- [x] Handle `task.created`, `task.clarification`, `task.cancelled` events
- [x] Send callbacks with proper status (processing, needs_input, completed, failed)
- [x] Implement 30-second heartbeat
- [x] Track token usage in callbacks
- [x] Include session_code in callbacks
- [x] Support callback_url from webhook payload (2026-02-01)
- [x] Session resume with `--resume` flag (2026-02-01)

### Review Steps Before Implementation

1. Read full Issue #1 specification
2. Compare with current `lib/webhook-server.js` implementation
3. Identify breaking changes and migration path
4. Create implementation plan
5. Get Tommy's approval before proceeding

---

## Architecture Improvements (Recommendations)

Based on architecture evaluation (2026-01-31), the following improvements are recommended:

### 1. Add `requiresAgent` to Command Schema

Explicit classification of whether a command needs Claude invocation:

```javascript
// lib/command-schema.js
{
  requiresAgent: boolean,  // true = queue for Claude, false = execute immediately
}
```

**Benefits:**
- Clearer logical processor flow
- Commands self-document their execution path
- Easier to add new command types

### 2. Add `skills` Array to Command Schema

Auto-load related skills when command executes:

```javascript
// lib/command-schema.js
{
  skills: ['research', 'web-search'],  // Skills to load before execution
}
```

**Benefits:**
- Commands bring their own context
- No manual skill loading required
- Consistent skill usage across channels

### 3. Integrate Executor Pattern

Route all commands through `executor.js` for consistency:

```
Current:  whatsapp-bot.js → directly calls queue/handlers
Proposed: whatsapp-bot.js → executor.js → queue/handlers
```

**Benefits:**
- Single point of command execution
- Easier to add hooks (before/after execution)
- Consistent behavior across all input channels

### 4. Complete Skill System

Skills exist but invocation is not fully implemented:

- [ ] Load skill.md from `skills/<name>/` directory
- [ ] Execute skill scripts (.sh, .scpt) with proper context
- [ ] Pass skill output back to agent or user
- [ ] Track skill usage for self-improvement

## Success Criteria

1. Tommy can command Brokkr from iMessage with same syntax as WhatsApp
2. Brokkr proactively notifies Tommy of genuinely urgent items
3. Email can be triaged and managed without opening Mail.app
4. Calendar/notes/reminders accessible via commands
5. System notifications trigger appropriate Brokkr responses
6. Brokkr creates reusable skills that improve efficiency over time
7. Files can be shared between Brokkr and Tommy via iCloud Family Sharing
