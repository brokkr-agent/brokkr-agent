---
name: reminders
description: Manage macOS Reminders.app - create, list, complete, modify, delete reminders
allowed-tools: Read, Write, Edit, Bash, Task
---

# Reminders Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

Manage macOS Reminders.app via AppleScript for the Brokkr agent.

## Capabilities

- List reminder lists
- List all reminders, incomplete reminders, or reminders due soon
- Create reminders with due dates, notes, and priority
- Find reminders by ID or name
- Mark reminders as complete
- Modify reminder properties
- Delete reminders
- Export reminders data to iCloud storage

## Prerequisites

**Permissions Required:**
- System Settings -> Privacy & Security -> Automation -> Terminal -> Reminders

**iCloud Sync:**
- Reminders.app always syncs via iCloud
- No "On My Mac" lists available
- Changes sync across devices automatically

## Usage

### Via Command (Manual)
```
/reminders list
/reminders due 7
/reminders create "Call dentist" "2026-02-10 14:00:00" "Schedule checkup"
/reminders complete <id>
```

### Via Notification (Automatic)
Triggered by notification monitor when:
- Reminder with "[AGENT]" tag in name
- Reminder due within 1 hour
- High priority (!!!) reminder due today

### From Node.js

```javascript
import * as reminders from './.claude/skills/reminders/lib/reminders.js';

// List all reminder lists
const lists = await reminders.listLists();

// List incomplete reminders
const incomplete = await reminders.listIncomplete();

// List reminders due in next 7 days
const due = await reminders.listDue(7);

// Create a reminder
const reminder = await reminders.createReminder({
  name: 'Call dentist',
  dueDate: '2026-02-10T14:00:00Z',
  body: 'Schedule annual checkup',
  priority: 1
});

// Find reminder by ID
const found = await reminders.findReminder('id', reminder.id);

// Modify reminder
await reminders.modifyReminder(reminder.id, 'priority', '5');

// Mark as complete
await reminders.completeReminder(reminder.id);

// Delete reminder
await reminders.deleteReminder(reminder.id);
```

### From Command Line

```bash
# List all reminder lists
osascript .claude/skills/reminders/scripts/list-lists.scpt

# List all reminders
osascript .claude/skills/reminders/scripts/list-all.scpt

# List incomplete reminders
osascript .claude/skills/reminders/scripts/list-incomplete.scpt

# List reminders due in next 7 days
osascript .claude/skills/reminders/scripts/list-due.scpt "7"

# Create reminder
osascript .claude/skills/reminders/scripts/create-reminder.scpt "Buy groceries" "Reminders" "2026-02-10 14:00:00" "Milk, eggs, bread" "5"

# Find reminder by ID
osascript .claude/skills/reminders/scripts/find-reminder.scpt "id" "<reminder-id>"

# Find reminder by name
osascript .claude/skills/reminders/scripts/find-reminder.scpt "name" "Buy groceries"

# Modify reminder
osascript .claude/skills/reminders/scripts/modify-reminder.scpt "<reminder-id>" "name" "New Title"
osascript .claude/skills/reminders/scripts/modify-reminder.scpt "<reminder-id>" "priority" "1"

# Mark complete
osascript .claude/skills/reminders/scripts/complete-reminder.scpt "<reminder-id>"

# Delete reminder
osascript .claude/skills/reminders/scripts/delete-reminder.scpt "<reminder-id>"
```

## Commands for Brokkr Agent

| Command | Description |
|---------|-------------|
| `/reminders` | List incomplete reminders |
| `/reminders due <days>` | List reminders due in next N days |
| `/reminders create <name> [due-date] [notes]` | Create new reminder |
| `/reminders complete <id>` | Mark reminder as complete |
| `/reminders delete <id>` | Delete reminder |

## AppleScript Properties Reference

### Reminder Properties

- `name` - Reminder title/text
- `body` - Notes/description
- `completed` - Boolean completion status
- `completion date` - When completed
- `due date` - Date/time when due
- `allday due date` - Date without time
- `remind me date` - When notification fires
- `priority` - Integer 0-9 (0=none, 1=high, 5=medium, 9=low)
- `id` - Unique identifier
- `container` - Parent list

### List Properties

- `name` - List name
- `id` - Unique identifier

### Priority Values

- `0` - No priority
- `1` - High (!!! in UI)
- `5` - Medium (!! in UI)
- `9` - Low (! in UI)

## Known Limitations

### Dictionary Gaps

Per [Apple Developer Forums](https://developer.apple.com/forums/thread/125171):
- No direct "tag" property (tags not accessible via AppleScript)
- No "group" support in older macOS versions
- Priority uses numeric values (not named constants)

### Date Handling

- `due date` - Specific date and time
- `allday due date` - Date only, no time
- `remind me date` - Notification time (can differ from due date)

Use `due date` for most operations.

### iCloud Sync

- All changes sync via iCloud automatically
- Sync typically completes within 1-3 seconds
- Shared lists require all participants to have iCloud accounts

## Troubleshooting

### Permission Denied

```bash
# Check permissions
osascript -e 'tell application "Reminders" to get name of lists'
```

If fails: System Settings -> Privacy & Security -> Automation -> Terminal -> Reminders (enable)

### Reminder Not Found After Creation

Wait 2-3 seconds for iCloud sync before searching.

### Priority Not Displaying Correctly

Reminders.app uses:
- 1 = High (!!!)
- 5 = Medium (!!)
- 9 = Low (!)

Always use these specific values for proper UI display.

## References

- [Demonstration of using AppleScript with Reminders.app](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
- [Enhancing Reminders with AppleScript and Macros - MacStories](https://www.macstories.net/tutorials/enhancing-reminders-with-applescript-and-macros/)
- [Automating Reminders with AppleScript](https://www.louismrose.com/2017/02/18/automating-reminders-with-applescript/)
