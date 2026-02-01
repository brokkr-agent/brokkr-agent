---
name: contacts
description: Access and manage Apple Contacts - search, create, update contacts
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Contacts Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill is a placeholder scaffold. Implementation pending.

## Planned Capabilities

- Search contacts by name, phone, email, or company
- Create new contacts with full details
- Update existing contact information
- Delete contacts
- Export contacts to vCard format
- Import contacts from vCard
- Manage contact groups

## Usage

### Via Command (Manual)
```
/contacts search "Tommy"
/contacts create "John Doe" phone:+1234567890
/contacts update "John Doe" email:john@example.com
```

### Via Notification (Automatic)
Triggered by other skills when contact lookup is needed.

## Technical Approach

Uses AppleScript via `osascript` to interact with Contacts.app.

## Reference Documentation

See `reference/` directory for detailed docs (to be added).

## Dependencies

- macOS Contacts.app
- AppleScript access permissions

## Next Steps

- [ ] Research Contacts.app AppleScript dictionary
- [ ] Implement basic search functionality
- [ ] Implement create/update/delete operations
- [ ] Add vCard import/export support
- [ ] Create test suite
