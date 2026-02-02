---
name: calendar
description: Manage Apple Calendar - list, create, update, and delete events
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Calendar Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: IMPLEMENTED

Full Apple Calendar integration via AppleScript with JSON-based I/O.

## Capabilities

### Calendar Operations
- **List Calendars** - Get all calendars with name, type, and writable status

### Event Listing
- **List Today** - All events for the current day
- **List Week** - All events for the current week
- **List Range** - Events within a custom date range (ISO 8601)

### Event Management
- **Create Event** - New events with summary, dates, location, notes, all-day flag
- **Find Event** - Search by UID (exact) or summary (partial match)
- **Modify Event** - Update any field (uses delete-and-recreate strategy)
- **Delete Event** - Remove event by UID

### Scheduling Tools
- **Check Conflicts** - Find overlapping events for a proposed time slot
- **Add Alarm** - Attach display, sound, or email alerts to events

### Notification Handling
- **Handle Notification** - Process calendar alerts, detect `[AGENT]`/`[BROKKR]` tags

## Architecture

### AppleScript Files (`scripts/`)
| Script | Purpose |
|--------|---------|
| `list-calendars.scpt` | Get all calendars |
| `list-today.scpt` | Today's events |
| `list-week.scpt` | This week's events |
| `list-events.scpt` | Events in date range |
| `create-event.scpt` | Create new event |
| `find-event.scpt` | Find by UID or summary |
| `modify-event.scpt` | Update existing event |
| `delete-event.scpt` | Delete by UID |
| `check-conflicts.scpt` | Scheduling conflict check |
| `add-alarm.scpt` | Add alarm to event |

### Node.js Wrapper (`lib/calendar.js`)
```javascript
import calendar from '../lib/calendar.js';

// List operations
calendar.listCalendars();
calendar.listToday();
calendar.listWeek();
calendar.listEvents(startDate, endDate);

// Event management
calendar.createEvent({ summary, startDate, endDate, calendar, location, notes, allDay });
calendar.findEvent({ uid, summary, startDate, endDate });
calendar.modifyEvent(uid, { summary, startDate, endDate, location, notes, allDay });
calendar.deleteEvent(uid);

// Scheduling tools
calendar.checkConflicts(startDate, endDate, { excludeCalendars, includeAllDay });
calendar.addAlarm(uid, minutes, type);

// Notification handling
calendar.handleNotification(notification);
```

### Return Format
All functions return:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

## Usage

### Via Command (Manual)
```
/calendar list today
/calendar list week
/calendar list 2026-02-01 2026-02-07
/calendar create "Meeting with Tommy" 2026-02-01T14:00:00 2026-02-01T15:00:00
/calendar find "Meeting"
/calendar modify <uid> --location "Coffee Shop"
/calendar delete <uid>
/calendar conflicts 2026-02-01T14:00:00 2026-02-01T15:00:00
```

### Via Notification (Automatic)
Triggered by notification monitor when criteria met:
- Event reminders (15 min, 5 min before)
- `[AGENT]` or `[BROKKR]` in event title/notes

### Programmatic Usage
```javascript
import { createEvent, checkConflicts, listToday } from './.claude/skills/calendar/lib/calendar.js';

// Check conflicts before creating
const conflicts = checkConflicts('2026-02-01T14:00:00', '2026-02-01T15:00:00');
if (!conflicts.data.hasConflicts) {
  createEvent({
    summary: 'Team Standup',
    startDate: '2026-02-01T14:00:00',
    endDate: '2026-02-01T15:00:00',
    location: 'Zoom',
    notes: '[AGENT] Auto-scheduled by Brokkr'
  });
}

// Get today's schedule
const today = listToday();
console.log(`${today.data.events.length} events today`);
```

## Important Notes

### Event Modification
Due to AppleScript limitations, `modifyEvent()` uses a **delete-and-recreate** strategy. The event UID will change after modification.

### Date Format
All dates use ISO 8601 format: `YYYY-MM-DDTHH:MM:SS`

### Timeout
Scripts have a 30-second timeout to prevent hangs.

## Integration Points

- **Notification Filter:** Calendar events with `[AGENT]` tag are auto-queued as CRITICAL
- **iCloud Storage:** Event exports saved to `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/`
- **AppleScript:** Primary interface for Calendar.app automation
