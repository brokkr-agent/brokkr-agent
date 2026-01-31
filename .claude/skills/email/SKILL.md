---
name: email
description: "Read and send email via iCloud Mail"
version: "1.0.0"
invoke: auto
---

# Email Skill (iCloud)

## Purpose
Manage email via mail.icloud.com using Chrome automation.

## Prerequisites
- Chrome enabled (`--chrome` flag)
- Apple ID: brokkrassist@icloud.com (from CLAUDE.md)

## Instructions

### Checking Inbox
1. Navigate to https://www.icloud.com/mail/
2. Wait for inbox to load (may need to handle 2FA)
3. Read visible email subjects and senders
4. Summarize unread/important items

### Reading an Email
1. Click on email in list
2. Wait for content to load in reading pane
3. Extract subject, sender, date, body text
4. Summarize content

### Sending an Email
1. Click "Compose" button
2. Fill in To, Subject, Body fields
3. Click "Send"
4. Verify sent confirmation

### Searching
1. Use search bar at top
2. Enter search query
3. Review results

## Error Handling
- If login required: Use Apple ID from CLAUDE.md
- If 2FA prompt: Report to user via WhatsApp, wait for code
- If slow loading: Wait up to 30 seconds before failing

## Examples
- "Check my email for anything important"
- "Send an email to john@example.com about the meeting"
- "Search for emails from Amazon"
