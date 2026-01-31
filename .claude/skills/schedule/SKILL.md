---
name: schedule
description: "Schedule autonomous tasks to run at specific times"
version: "1.0.0"
invoke: manual
---

# Schedule Skill

## Purpose
Schedule tasks to run automatically using cron.

## Commands

### Add a schedule
"schedule at 3pm check my email"
"schedule every day at 9am summarize hacker news"
"schedule every monday at 10am review github notifications"

### List schedules
"schedule list" or "show my schedules"

### Remove a schedule
"schedule remove <id>"

## Time Formats Supported
- "at 3pm" - today at 3pm
- "at 15:30" - today at 15:30
- "every day at 9am" - daily at 9am
- "every monday at 10am" - weekly on Monday
- "every hour" - every hour on the hour

## How It Works
Tasks are added to the system crontab. Each task runs `claude -p "<task>"` with full permissions.

Results are logged to `logs/scheduled.log`.

## Examples
- Schedule: "at 6pm check if any PRs need review"
- List: "show my scheduled tasks"
- Remove: "remove schedule abc123"
