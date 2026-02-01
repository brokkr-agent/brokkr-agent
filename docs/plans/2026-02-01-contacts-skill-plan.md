# Contacts Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks
>
> **Architecture Reference:** See `docs/concepts/2026-02-01-apple-integration-architecture.md` for standardized patterns.

**Goal:** Add full Contacts.app integration to enable contact lookup, creation, modification, and group management via AppleScript commands. Support `/contact` commands from WhatsApp, iMessage, and webhooks.

**Architecture:** Create reusable AppleScript modules in `skills/contacts/` for finding, creating, modifying, and managing contacts. Integrate with message parsers to support natural language commands. Return formatted contact information including all available properties (name, email, phone, address, organization, social profiles, dates, etc.).

**Tech Stack:** AppleScript (Contacts.app scripting dictionary), Node.js (osascript execution), shared lib modules (command-registry.js, message-parser.js)

---

## Skill Directory Structure

```
skills/contacts/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── contacts.js             # Core functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── applescript-dictionary.md
├── scripts/                    # Reusable automation scripts
│   ├── find-contact.scpt
│   ├── add-contact.scpt
│   ├── update-contact.scpt
│   ├── add-element.scpt
│   ├── delete-contact.scpt
│   ├── list-groups.scpt
│   ├── manage-group.scpt
│   └── export-vcard.scpt
└── tests/
    └── contacts.test.js
```

## Command File

Create `.claude/commands/contacts.md`:

```yaml
---
name: contacts
description: Find and manage contacts in Contacts.app
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Contacts skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## iCloud Storage Integration

Use `lib/icloud-storage.js` for vCard exports:

```javascript
const { getPath } = require('../../lib/icloud-storage');

// Export vCard to iCloud
const vcardPath = getPath('exports', `${contactName}-${Date.now()}.vcf`);
```

## SKILL.md Standard Header

```yaml
---
name: contacts
description: Access and manage macOS Contacts.app via AppleScript. Find contacts, create entries, update info, manage groups, export vCards.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Contacts Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Find contacts by name, email, phone, organization
- Create contacts with full properties
- Update contact information
- Manage contact groups
- Export vCards to iCloud storage

## Usage

### Via Command (Manual)
```
/contacts find John Smith
/contacts add Jane Doe email:jane@example.com
```

### Via Notification (Automatic)
Not applicable - Contacts doesn't generate actionable notifications.

## Reference Documentation

See `reference/` directory for detailed docs.
```

---

## Research Summary

### Official Documentation Sources

- [View an app's scripting dictionary in Script Editor on Mac](https://support.apple.com/guide/script-editor/view-an-apps-scripting-dictionary-scpedt1126/mac)
- [AppleScript Essentials - Scripting Address Book](http://preserve.mactech.com/articles/mactech/Vol.21/21.10/ScriptingAddressBook/index.html)
- [Setting and Getting Contacts Info - MacScripter](https://www.macscripter.net/t/setting-and-getting-contacts-info/69391)
- [AppleScript for Apple Contacts: Export vCards](https://gist.github.com/a163eab884e932f1022bb50c37ccf15a)
- [Mac Automation Scripting Guide: Objective-C to AppleScript](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AppendixA-AppleScriptObjCQuickTranslationGuide.html)

### Key Capabilities Verified (macOS 14.8.3 Sonoma)

**Person Object Properties:**
- Basic: `first name`, `last name`, `middle name`, `nickname`, `maiden name`, `suffix`, `title`
- Organization: `organization`, `department`, `job title`, `company` (boolean flag)
- Metadata: `id`, `creation date`, `modification date`, `selected`, `note`
- Media: `image` (can be set to image data), `home page`
- Dates: `birth date`
- Export: `vcard` (read-only property returns vCard 3.0 format)
- Phonetic: `phonetic first name`, `phonetic middle name`, `phonetic last name`

**Contact Elements (Collections):**
- `emails` - label, value, id
- `phones` - label, value, id
- `addresses` - label, street, city, state, zip, country, country code, id
- `urls` - label, value, id
- `social profiles` - service name, user name, user identifier, url, id
- `instant messages` - service name, user name, id (note: limited support)
- `related names` - label, value, id
- `custom dates` - label, value, id

**Common Labels:**
- Email: work, home, other
- Phone: work, home, mobile, iPhone, main, home fax, work fax, pager
- Address: work, home, other
- URL: home page, work, home, other

**Group Operations:**
- Create groups: `make new group with properties {name:"..."}`
- Add person to group: `add person to group`
- Remove person from group: `remove person from group`
- List groups: `name of every group`
- List group members: `people of group`
- Delete groups: `delete group`

**Search Capabilities:**
- By name: `people whose name contains "text"`
- By email: `people whose emails's value contains "text"`
- By phone: `people whose phones's value contains "text"`
- By organization: `people whose organization contains "text"`
- By company flag: `people whose company is true`
- By group membership: `people of group "name"`

**CRUD Operations:**
- **Create**: `make new person with properties {...}`
- **Read**: Access properties directly, export as vCard
- **Update**: Set properties, add/delete collection elements
- **Delete**: `delete person`, `delete email/phone/address/etc`
- **Save**: `save` command required after modifications

**vCard Support:**
- **Export**: `vcard of person` returns vCard 3.0 format string
- **Import**: NOT directly supported via AppleScript (Contacts.app UI only)

### Limitations Discovered

1. **No Direct vCard Import**: AppleScript cannot parse vCard strings. Must use Contacts.app UI or parse manually.
2. **Instant Messages**: Limited support - service name and user name only
3. **Image Handling**: Can set images but requires image data type (complex)
4. **No Bulk Operations**: Must iterate over people individually
5. **Save Required**: All modifications require explicit `save` command

---

## Design Decisions

### Script Organization

All scripts in `skills/contacts/` directory:
- `find-contact.scpt` - Find by name/email/phone
- `add-contact.scpt` - Create new person
- `update-contact.scpt` - Modify existing person
- `add-contact-element.scpt` - Add email/phone/address/etc
- `delete-contact.scpt` - Delete person or element
- `list-groups.scpt` - List all groups
- `manage-group.scpt` - Create, add/remove members, delete groups
- `export-vcard.scpt` - Export person as vCard

### Command Patterns

| Command | Action | Example |
|---------|--------|---------|
| `/contact <name>` | Find and display contact | `/contact John Smith` |
| `/contact add <name>` | Create new contact (interactive) | `/contact add Jane Doe` |
| `/contact update <name>` | Modify existing contact | `/contact update John work email john@acme.com` |
| `/contact delete <name>` | Delete contact (with confirmation) | `/contact delete Old Contact` |
| `/contact groups` | List all groups | `/contact groups` |
| `/contact group add <name>` | Create new group | `/contact group add Investors` |
| `/contact vcard <name>` | Export as vCard | `/contact vcard John Smith` |

### Integration Points

1. **Email Skill**: Lookup sender contact when reading emails
2. **iMessage Skill**: Lookup contact before sending messages
3. **Calendar Skill**: Enrich attendee info with contact details
4. **Reminders Skill**: Link contacts to tasks/reminders

### Return Format

**Contact Display Format:**
```
📇 John Smith (Acme Corp - CEO)
📧 work: john@acme.com
📱 mobile: 555-1234
🏠 123 Main St, Seattle, WA 98101
🌐 https://acme.com
📝 Important client contact
🎂 Birthday: Jan 15
```

**Search Results Format:**
```
Found 3 contacts matching "smith":
1. John Smith - john@acme.com (Acme Corp)
2. Jane Smith - jane@example.com
3. Bob Smithson - bob@smithson.co

Use /contact [name] for details
```

---

## Task Overview

| Task | Description | Files | Time |
|------|-------------|-------|------|
| 1 | Find Contact Script (TDD) | `skills/contacts/find-contact.scpt`, `tests/contacts-find.test.js` | 5 min |
| 2 | Add Contact Script (TDD) | `skills/contacts/add-contact.scpt`, `tests/contacts-add.test.js` | 5 min |
| 3 | Update Contact Script (TDD) | `skills/contacts/update-contact.scpt`, `tests/contacts-update.test.js` | 5 min |
| 4 | Add Contact Element Script (TDD) | `skills/contacts/add-element.scpt`, `tests/contacts-element.test.js` | 5 min |
| 5 | Delete Contact Script (TDD) | `skills/contacts/delete-contact.scpt`, `tests/contacts-delete.test.js` | 3 min |
| 6 | Group Management Scripts (TDD) | `skills/contacts/list-groups.scpt`, `skills/contacts/manage-group.scpt`, `tests/contacts-groups.test.js` | 5 min |
| 7 | Export vCard Script (TDD) | `skills/contacts/export-vcard.scpt`, `tests/contacts-vcard.test.js` | 3 min |
| 8 | Contact Command Handler | `lib/handlers/contact-handler.js`, `tests/contact-handler.test.js` | 5 min |
| 9 | Command Registry Integration | `lib/command-registry.js` | 2 min |
| 10 | Message Parser Support | `lib/message-parser.js` | 3 min |
| 11 | Dry Run Tests | `dry-run-test.js` | 2 min |
| 12 | Skill Documentation | `skills/contacts/skill.md` | 3 min |
| 13 | Integration Testing | Manual test script | 3 min |
| 14 | Update Documentation | `CLAUDE.md`, `docs/concepts/2026-01-31-brokkr-self-improvement-system.md` | 2 min |

**Total Estimated Time:** 51 minutes

---

## Task 1: Find Contact Script (TDD)

**Goal:** Create AppleScript to find contacts by name, email, or phone number.

**Test First** (`tests/contacts-find.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Find Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/find-contact.scpt');

  test('finds contact by full name', () => {
    const result = execSync(`osascript ${scriptPath} "Brokkr Bot"`).toString().trim();
    expect(result).toContain('Brokkr Bot');
    expect(result).toContain('ID:');
  });

  test('finds multiple contacts with partial name', () => {
    const result = execSync(`osascript ${scriptPath} "test"`).toString().trim();
    expect(result).toContain('Found');
  });

  test('returns not found for non-existent contact', () => {
    const result = execSync(`osascript ${scriptPath} "NonExistentPerson123456"`).toString().trim();
    expect(result).toContain('No contacts found');
  });

  test('finds contact by email', () => {
    const result = execSync(`osascript ${scriptPath} "email:test@example.com"`).toString().trim();
    expect(result).toContain('test@example.com');
  });

  test('finds contact by phone', () => {
    const result = execSync(`osascript ${scriptPath} "phone:555-1234"`).toString().trim();
    expect(result).toContain('555');
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/find-contact.scpt`):
```applescript
-- Find Contact Script
-- Usage: osascript find-contact.scpt <search_term>
-- Supports: "name", "email:address", "phone:number", "org:company"

on run argv
    if (count of argv) < 1 then
        return "Error: Search term required. Usage: find-contact.scpt <search_term>"
    end if

    set searchTerm to item 1 of argv
    set searchType to "name"
    set searchValue to searchTerm

    -- Parse search type prefix
    if searchTerm contains ":" then
        set AppleScript's text item delimiters to ":"
        set searchParts to text items of searchTerm
        set searchType to item 1 of searchParts
        set searchValue to item 2 of searchParts
        set AppleScript's text item delimiters to ""
    end if

    tell application "Contacts"
        set foundPeople to {}

        -- Search based on type
        if searchType is "email" then
            set foundPeople to people whose emails's value contains searchValue
        else if searchType is "phone" then
            -- Normalize phone search (remove formatting)
            set normalizedSearch to my normalizePhone(searchValue)
            set allPeople to every person
            repeat with p in allPeople
                repeat with ph in phones of p
                    if my normalizePhone(value of ph) contains normalizedSearch then
                        set end of foundPeople to p
                        exit repeat
                    end if
                end repeat
            end repeat
        else if searchType is "org" then
            set foundPeople to people whose organization contains searchValue
        else
            -- Default: search by name
            set foundPeople to people whose name contains searchValue
        end if

        -- Format results
        set resultCount to count of foundPeople

        if resultCount is 0 then
            return "No contacts found matching: " & searchTerm
        else if resultCount is 1 then
            -- Single result: show full details
            set thePerson to item 1 of foundPeople
            return my formatContactFull(thePerson)
        else
            -- Multiple results: show summary list
            set resultText to "Found " & resultCount & " contacts matching \"" & searchValue & "\":" & return & return
            repeat with i from 1 to resultCount
                set thePerson to item i of foundPeople
                set resultText to resultText & i & ". " & my formatContactSummary(thePerson) & return
            end repeat
            return resultText & return & "Use /contact [exact name] for details"
        end if
    end tell
end run

-- Format full contact details
on formatContactFull(thePerson)
    tell application "Contacts"
        set output to "📇 " & (name of thePerson)

        -- Organization info
        if (organization of thePerson) is not missing value and (organization of thePerson) is not "" then
            set output to output & " (" & (organization of thePerson)
            if (job title of thePerson) is not missing value and (job title of thePerson) is not "" then
                set output to output & " - " & (job title of thePerson)
            end if
            set output to output & ")"
        end if
        set output to output & return

        -- Emails
        repeat with e in emails of thePerson
            set output to output & "📧 " & (label of e) & ": " & (value of e) & return
        end repeat

        -- Phones
        repeat with p in phones of thePerson
            set output to output & "📱 " & (label of p) & ": " & (value of p) & return
        end repeat

        -- Addresses
        repeat with a in addresses of thePerson
            set addrText to "🏠 "
            if (street of a) is not missing value then set addrText to addrText & (street of a) & ", "
            if (city of a) is not missing value then set addrText to addrText & (city of a) & ", "
            if (state of a) is not missing value then set addrText to addrText & (state of a) & " "
            if (zip of a) is not missing value then set addrText to addrText & (zip of a)
            set output to output & addrText & return
        end repeat

        -- URLs
        repeat with u in urls of thePerson
            set output to output & "🌐 " & (value of u) & return
        end repeat

        -- Birthday
        if (birth date of thePerson) is not missing value then
            set output to output & "🎂 Birthday: " & my formatDate(birth date of thePerson) & return
        end if

        -- Note
        if (note of thePerson) is not missing value and (note of thePerson) is not "" then
            set output to output & "📝 " & (note of thePerson) & return
        end if

        -- ID (for scripting reference)
        set output to output & return & "ID: " & (id of thePerson)

        return output
    end tell
end formatContactFull

-- Format contact summary for list
on formatContactSummary(thePerson)
    tell application "Contacts"
        set summary to name of thePerson

        -- Add primary email if available
        if (count of emails of thePerson) > 0 then
            set summary to summary & " - " & (value of email 1 of thePerson)
        end if

        -- Add organization if available
        if (organization of thePerson) is not missing value and (organization of thePerson) is not "" then
            set summary to summary & " (" & (organization of thePerson) & ")"
        end if

        return summary
    end tell
end formatContactSummary

-- Normalize phone number (remove non-digits)
on normalizePhone(phoneText)
    set digits to "0123456789"
    set normalized to ""
    repeat with char in phoneText
        if digits contains char then
            set normalized to normalized & char
        end if
    end repeat
    return normalized
end normalizePhone

-- Format date as MMM DD
on formatDate(theDate)
    set monthNames to {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
    set theMonth to month of theDate as integer
    set theDay to day of theDate
    return item theMonth of monthNames & " " & theDay
end formatDate
```

**Verify Tests Pass:**
```bash
npm test -- contacts-find.test.js
```

**Commit:**
```bash
git add skills/contacts/find-contact.scpt tests/contacts-find.test.js
git commit -m "feat(contacts): add find contact script with search by name/email/phone

- Support multiple search types via prefix (email:, phone:, org:)
- Full contact details for single match
- Summary list for multiple matches
- Normalize phone numbers for reliable search
- Format output with emoji icons

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Add Contact Script (TDD)

**Goal:** Create AppleScript to add new contacts with basic information.

**Test First** (`tests/contacts-add.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Add Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/add-contact.scpt');

  afterEach(() => {
    // Cleanup: delete test contacts
    try {
      execSync(`osascript -e 'tell application "Contacts" to delete (people whose name contains "TestAddPerson") saving yes'`);
    } catch (e) {}
  });

  test('creates contact with first and last name', () => {
    const result = execSync(`osascript ${scriptPath} "TestAddPerson" "Smith"`).toString().trim();
    expect(result).toContain('Created contact: TestAddPerson Smith');
    expect(result).toContain('ID:');
  });

  test('creates contact with organization', () => {
    const result = execSync(`osascript ${scriptPath} "TestAddPerson" "Doe" "org:TestCorp"`).toString().trim();
    expect(result).toContain('Created contact');
    expect(result).toContain('TestCorp');
  });

  test('creates contact with email', () => {
    const result = execSync(`osascript ${scriptPath} "TestAddPerson" "Jones" "email:test@example.com"`).toString().trim();
    expect(result).toContain('Created contact');
    expect(result).toContain('test@example.com');
  });

  test('creates contact with phone', () => {
    const result = execSync(`osascript ${scriptPath} "TestAddPerson" "Brown" "phone:555-1234"`).toString().trim();
    expect(result).toContain('Created contact');
    expect(result).toContain('555');
  });

  test('creates company contact', () => {
    const result = execSync(`osascript ${scriptPath} "" "" "org:TestCompany" "company:true"`).toString().trim();
    expect(result).toContain('Created contact');
    expect(result).toContain('TestCompany');
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/add-contact.scpt`):
```applescript
-- Add Contact Script
-- Usage: osascript add-contact.scpt <first_name> <last_name> [key:value ...]
-- Keys: org, title, email, phone, address, note, company, birthday

on run argv
    if (count of argv) < 2 then
        return "Error: At least first and last name required. Usage: add-contact.scpt <first> <last> [key:value ...]"
    end if

    set firstName to item 1 of argv
    set lastName to item 2 of argv

    -- Parse additional properties
    set orgName to missing value
    set jobTitle to missing value
    set emailAddress to missing value
    set phoneNumber to missing value
    set noteText to missing value
    set isCompany to false
    set birthDay to missing value

    if (count of argv) > 2 then
        repeat with i from 3 to count of argv
            set propItem to item i of argv
            if propItem contains ":" then
                set AppleScript's text item delimiters to ":"
                set propParts to text items of propItem
                set propKey to item 1 of propParts
                set propValue to item 2 of propParts
                set AppleScript's text item delimiters to ""

                if propKey is "org" then
                    set orgName to propValue
                else if propKey is "title" then
                    set jobTitle to propValue
                else if propKey is "email" then
                    set emailAddress to propValue
                else if propKey is "phone" then
                    set phoneNumber to propValue
                else if propKey is "note" then
                    set noteText to propValue
                else if propKey is "company" and propValue is "true" then
                    set isCompany to true
                else if propKey is "birthday" then
                    try
                        set birthDay to date propValue
                    end try
                end if
            end if
        end repeat
    end if

    tell application "Contacts"
        -- Create person properties
        set personProps to {}

        if firstName is not "" then
            set personProps to personProps & {first name:firstName}
        end if

        if lastName is not "" then
            set personProps to personProps & {last name:lastName}
        end if

        if orgName is not missing value then
            set personProps to personProps & {organization:orgName}
        end if

        if jobTitle is not missing value then
            set personProps to personProps & {job title:jobTitle}
        end if

        if noteText is not missing value then
            set personProps to personProps & {note:noteText}
        end if

        if isCompany then
            set personProps to personProps & {company:true}
        end if

        if birthDay is not missing value then
            set personProps to personProps & {birth date:birthDay}
        end if

        -- Create person
        set newPerson to make new person with properties personProps

        -- Add email if provided
        if emailAddress is not missing value then
            make new email at end of emails of newPerson with properties {label:"work", value:emailAddress}
        end if

        -- Add phone if provided
        if phoneNumber is not missing value then
            make new phone at end of phones of newPerson with properties {label:"mobile", value:phoneNumber}
        end if

        save

        -- Return confirmation
        set confirmText to "✅ Created contact: " & (name of newPerson) & return

        if orgName is not missing value then
            set confirmText to confirmText & "🏢 " & orgName
            if jobTitle is not missing value then
                set confirmText to confirmText & " (" & jobTitle & ")"
            end if
            set confirmText to confirmText & return
        end if

        if emailAddress is not missing value then
            set confirmText to confirmText & "📧 " & emailAddress & return
        end if

        if phoneNumber is not missing value then
            set confirmText to confirmText & "📱 " & phoneNumber & return
        end if

        set confirmText to confirmText & return & "ID: " & (id of newPerson)

        return confirmText
    end tell
end run
```

**Verify Tests Pass:**
```bash
npm test -- contacts-add.test.js
```

**Commit:**
```bash
git add skills/contacts/add-contact.scpt tests/contacts-add.test.js
git commit -m "feat(contacts): add create contact script with flexible properties

- Support first/last name, organization, job title
- Add email and phone during creation
- Support company flag for organization-only contacts
- Handle birthday and note fields
- Return formatted confirmation with ID

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Update Contact Script (TDD)

**Goal:** Create AppleScript to update existing contact properties.

**Test First** (`tests/contacts-update.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Update Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/update-contact.scpt');
  let testContactId;

  beforeEach(() => {
    // Create test contact
    const result = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestUpdate" "Person"`).toString();
    testContactId = result.match(/ID: (.+)/)[1].trim();
  });

  afterEach(() => {
    // Cleanup
    try {
      execSync(`osascript -e 'tell application "Contacts" to delete (person id "${testContactId}") saving yes'`);
    } catch (e) {}
  });

  test('updates job title', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "title:Senior Developer"`).toString().trim();
    expect(result).toContain('Updated');
    expect(result).toContain('Senior Developer');
  });

  test('updates organization', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "org:NewCorp"`).toString().trim();
    expect(result).toContain('Updated');
    expect(result).toContain('NewCorp');
  });

  test('updates note', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "note:Important contact"`).toString().trim();
    expect(result).toContain('Updated');
    expect(result).toContain('Important');
  });

  test('updates birthday', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "birthday:January 15, 1990"`).toString().trim();
    expect(result).toContain('Updated');
    expect(result).toContain('Jan 15');
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/update-contact.scpt`):
```applescript
-- Update Contact Script
-- Usage: osascript update-contact.scpt <contact_id> <key:value> [key:value ...]
-- Keys: first, last, middle, nickname, org, title, dept, note, birthday

on run argv
    if (count of argv) < 2 then
        return "Error: Contact ID and at least one property required. Usage: update-contact.scpt <id> <key:value> ..."
    end if

    set contactId to item 1 of argv

    tell application "Contacts"
        try
            set thePerson to person id contactId
        on error
            return "Error: Contact not found with ID: " & contactId
        end try

        set updateLog to {}

        -- Process each property update
        repeat with i from 2 to count of argv
            set propItem to item i of argv
            if propItem contains ":" then
                set AppleScript's text item delimiters to ":"
                set propParts to text items of propItem
                set propKey to item 1 of propParts
                set propValue to item 2 of propParts
                set AppleScript's text item delimiters to ""

                if propKey is "first" then
                    set first name of thePerson to propValue
                    set end of updateLog to "first name → " & propValue
                else if propKey is "last" then
                    set last name of thePerson to propValue
                    set end of updateLog to "last name → " & propValue
                else if propKey is "middle" then
                    set middle name of thePerson to propValue
                    set end of updateLog to "middle name → " & propValue
                else if propKey is "nickname" then
                    set nickname of thePerson to propValue
                    set end of updateLog to "nickname → " & propValue
                else if propKey is "org" then
                    set organization of thePerson to propValue
                    set end of updateLog to "organization → " & propValue
                else if propKey is "title" then
                    set job title of thePerson to propValue
                    set end of updateLog to "job title → " & propValue
                else if propKey is "dept" then
                    set department of thePerson to propValue
                    set end of updateLog to "department → " & propValue
                else if propKey is "note" then
                    set note of thePerson to propValue
                    set end of updateLog to "note updated"
                else if propKey is "birthday" then
                    try
                        set birth date of thePerson to date propValue
                        set end of updateLog to "birthday → " & my formatDate(birth date of thePerson)
                    on error
                        set end of updateLog to "birthday ERROR (invalid date format)"
                    end try
                end if
            end if
        end repeat

        save

        -- Format response
        set response to "✅ Updated contact: " & (name of thePerson) & return & return
        repeat with logItem in updateLog
            set response to response & "  • " & logItem & return
        end repeat

        return response
    end tell
end run

-- Format date as MMM DD
on formatDate(theDate)
    set monthNames to {"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
    set theMonth to month of theDate as integer
    set theDay to day of theDate
    return item theMonth of monthNames & " " & theDay
end formatDate
```

**Verify Tests Pass:**
```bash
npm test -- contacts-update.test.js
```

**Commit:**
```bash
git add skills/contacts/update-contact.scpt tests/contacts-update.test.js
git commit -m "feat(contacts): add update contact script for modifying properties

- Update basic name fields (first, last, middle, nickname)
- Update organization fields (org, title, department)
- Update note and birthday
- Log all changes in response
- Validate contact ID before update

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Add Contact Element Script (TDD)

**Goal:** Create AppleScript to add emails, phones, addresses, URLs to existing contacts.

**Test First** (`tests/contacts-element.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Add Element Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/add-element.scpt');
  let testContactId;

  beforeEach(() => {
    const result = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestElement" "Person"`).toString();
    testContactId = result.match(/ID: (.+)/)[1].trim();
  });

  afterEach(() => {
    try {
      execSync(`osascript -e 'tell application "Contacts" to delete (person id "${testContactId}") saving yes'`);
    } catch (e) {}
  });

  test('adds email', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "email" "work" "test@example.com"`).toString().trim();
    expect(result).toContain('Added email');
    expect(result).toContain('test@example.com');
  });

  test('adds phone', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "phone" "mobile" "555-1234"`).toString().trim();
    expect(result).toContain('Added phone');
    expect(result).toContain('555-1234');
  });

  test('adds address', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "address" "home" "street:123 Main St" "city:Seattle" "state:WA" "zip:98101"`).toString().trim();
    expect(result).toContain('Added address');
    expect(result).toContain('Seattle');
  });

  test('adds URL', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}" "url" "home page" "https://example.com"`).toString().trim();
    expect(result).toContain('Added url');
    expect(result).toContain('example.com');
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/add-element.scpt`):
```applescript
-- Add Contact Element Script
-- Usage: osascript add-element.scpt <contact_id> <type> <label> <value> [additional...]
-- Types: email, phone, address, url, social, related, date

on run argv
    if (count of argv) < 4 then
        return "Error: Contact ID, type, label, and value required. Usage: add-element.scpt <id> <type> <label> <value> [...]"
    end if

    set contactId to item 1 of argv
    set elementType to item 2 of argv
    set elementLabel to item 3 of argv
    set elementValue to item 4 of argv

    tell application "Contacts"
        try
            set thePerson to person id contactId
        on error
            return "Error: Contact not found with ID: " & contactId
        end try

        if elementType is "email" then
            make new email at end of emails of thePerson with properties {label:elementLabel, value:elementValue}
            save
            return "✅ Added email: " & elementLabel & " - " & elementValue

        else if elementType is "phone" then
            make new phone at end of phones of thePerson with properties {label:elementLabel, value:elementValue}
            save
            return "✅ Added phone: " & elementLabel & " - " & elementValue

        else if elementType is "url" then
            make new url at end of urls of thePerson with properties {label:elementLabel, value:elementValue}
            save
            return "✅ Added url: " & elementLabel & " - " & elementValue

        else if elementType is "address" then
            -- Parse address components from remaining args
            set addrStreet to missing value
            set addrCity to missing value
            set addrState to missing value
            set addrZip to missing value
            set addrCountry to "USA"

            if (count of argv) > 4 then
                repeat with i from 5 to count of argv
                    set addrPart to item i of argv
                    if addrPart contains ":" then
                        set AppleScript's text item delimiters to ":"
                        set addrParts to text items of addrPart
                        set addrKey to item 1 of addrParts
                        set addrVal to item 2 of addrParts
                        set AppleScript's text item delimiters to ""

                        if addrKey is "street" then
                            set addrStreet to addrVal
                        else if addrKey is "city" then
                            set addrCity to addrVal
                        else if addrKey is "state" then
                            set addrState to addrVal
                        else if addrKey is "zip" then
                            set addrZip to addrVal
                        else if addrKey is "country" then
                            set addrCountry to addrVal
                        end if
                    end if
                end repeat
            else
                -- Simple address (full value as street)
                set addrStreet to elementValue
            end if

            set addrProps to {label:elementLabel}
            if addrStreet is not missing value then set addrProps to addrProps & {street:addrStreet}
            if addrCity is not missing value then set addrProps to addrProps & {city:addrCity}
            if addrState is not missing value then set addrProps to addrProps & {state:addrState}
            if addrZip is not missing value then set addrProps to addrProps & {zip:addrZip}
            set addrProps to addrProps & {country:addrCountry}

            make new address at end of addresses of thePerson with properties addrProps
            save

            set addrText to "✅ Added address: " & elementLabel & " - "
            if addrStreet is not missing value then set addrText to addrText & addrStreet & ", "
            if addrCity is not missing value then set addrText to addrText & addrCity & ", "
            if addrState is not missing value then set addrText to addrText & addrState & " "
            if addrZip is not missing value then set addrText to addrText & addrZip
            return addrText

        else if elementType is "social" then
            -- Social profile: label = service name, value = username
            make new social profile at end of social profiles of thePerson with properties {service name:elementLabel, user name:elementValue}
            save
            return "✅ Added social profile: " & elementLabel & " - " & elementValue

        else if elementType is "related" then
            -- Related name: label = relationship, value = name
            make new related name at end of related names of thePerson with properties {label:elementLabel, value:elementValue}
            save
            return "✅ Added related name: " & elementLabel & " - " & elementValue

        else if elementType is "date" then
            -- Custom date: label = occasion, value = date string
            try
                set dateValue to date elementValue
                make new custom date at end of custom dates of thePerson with properties {label:elementLabel, value:dateValue}
                save
                return "✅ Added custom date: " & elementLabel & " - " & elementValue
            on error
                return "Error: Invalid date format for " & elementValue
            end try

        else
            return "Error: Unknown element type '" & elementType & "'. Supported: email, phone, address, url, social, related, date"
        end if
    end tell
end run
```

**Verify Tests Pass:**
```bash
npm test -- contacts-element.test.js
```

**Commit:**
```bash
git add skills/contacts/add-element.scpt tests/contacts-element.test.js
git commit -m "feat(contacts): add script to add contact elements (email, phone, address, etc)

- Support email, phone, url, address elements
- Support social profiles, related names, custom dates
- Parse complex address components
- Validate element types and formats
- Return confirmation with added values

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Delete Contact Script (TDD)

**Goal:** Create AppleScript to delete contacts or specific elements.

**Test First** (`tests/contacts-delete.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Delete Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/delete-contact.scpt');

  test('deletes entire contact', () => {
    // Create test contact
    const createResult = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestDelete" "Person"`).toString();
    const testContactId = createResult.match(/ID: (.+)/)[1].trim();

    const result = execSync(`osascript ${scriptPath} "${testContactId}"`).toString().trim();
    expect(result).toContain('Deleted contact');
  });

  test('deletes specific email', () => {
    // Create contact with email
    const createResult = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestDelete" "Email" "email:test@example.com"`).toString();
    const testContactId = createResult.match(/ID: (.+)/)[1].trim();

    const result = execSync(`osascript ${scriptPath} "${testContactId}" "email" "1"`).toString().trim();
    expect(result).toContain('Deleted email');

    // Cleanup
    execSync(`osascript ${scriptPath} "${testContactId}"`);
  });

  test('deletes specific phone', () => {
    // Create contact with phone
    const createResult = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestDelete" "Phone" "phone:555-1234"`).toString();
    const testContactId = createResult.match(/ID: (.+)/)[1].trim();

    const result = execSync(`osascript ${scriptPath} "${testContactId}" "phone" "1"`).toString().trim();
    expect(result).toContain('Deleted phone');

    // Cleanup
    execSync(`osascript ${scriptPath} "${testContactId}"`);
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/delete-contact.scpt`):
```applescript
-- Delete Contact Script
-- Usage: osascript delete-contact.scpt <contact_id> [element_type] [element_index]
-- If only contact_id: deletes entire contact
-- If element_type and index: deletes specific element

on run argv
    if (count of argv) < 1 then
        return "Error: Contact ID required. Usage: delete-contact.scpt <id> [element_type] [element_index]"
    end if

    set contactId to item 1 of argv

    tell application "Contacts"
        try
            set thePerson to person id contactId
        on error
            return "Error: Contact not found with ID: " & contactId
        end try

        -- Delete entire contact if no element specified
        if (count of argv) is 1 then
            set contactName to name of thePerson
            delete thePerson
            save
            return "🗑️ Deleted contact: " & contactName
        end if

        -- Delete specific element
        if (count of argv) < 3 then
            return "Error: Element type and index required. Usage: delete-contact.scpt <id> <type> <index>"
        end if

        set elementType to item 2 of argv
        set elementIndex to item 3 of argv as integer

        if elementType is "email" then
            if (count of emails of thePerson) >= elementIndex then
                set deletedEmail to value of email elementIndex of thePerson
                delete email elementIndex of thePerson
                save
                return "🗑️ Deleted email: " & deletedEmail
            else
                return "Error: Email index " & elementIndex & " not found"
            end if

        else if elementType is "phone" then
            if (count of phones of thePerson) >= elementIndex then
                set deletedPhone to value of phone elementIndex of thePerson
                delete phone elementIndex of thePerson
                save
                return "🗑️ Deleted phone: " & deletedPhone
            else
                return "Error: Phone index " & elementIndex & " not found"
            end if

        else if elementType is "address" then
            if (count of addresses of thePerson) >= elementIndex then
                delete address elementIndex of thePerson
                save
                return "🗑️ Deleted address #" & elementIndex
            else
                return "Error: Address index " & elementIndex & " not found"
            end if

        else if elementType is "url" then
            if (count of urls of thePerson) >= elementIndex then
                set deletedUrl to value of url elementIndex of thePerson
                delete url elementIndex of thePerson
                save
                return "🗑️ Deleted url: " & deletedUrl
            else
                return "Error: URL index " & elementIndex & " not found"
            end if

        else
            return "Error: Unknown element type '" & elementType & "'. Supported: email, phone, address, url"
        end if
    end tell
end run
```

**Verify Tests Pass:**
```bash
npm test -- contacts-delete.test.js
```

**Commit:**
```bash
git add skills/contacts/delete-contact.scpt tests/contacts-delete.test.js
git commit -m "feat(contacts): add delete contact script for contacts and elements

- Delete entire contact by ID
- Delete specific elements by type and index
- Support email, phone, address, url deletion
- Validate element exists before deletion
- Return confirmation with deleted value

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Group Management Scripts (TDD)

**Goal:** Create AppleScript to list, create, and manage contact groups.

**Test First** (`tests/contacts-groups.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts Group Scripts', () => {
  const listScript = path.join(__dirname, '../skills/contacts/list-groups.scpt');
  const manageScript = path.join(__dirname, '../skills/contacts/manage-group.scpt');

  afterEach(() => {
    // Cleanup test groups
    try {
      execSync(`osascript -e 'tell application "Contacts" to delete (groups whose name contains "TestGroup") saving yes'`);
    } catch (e) {}
  });

  test('lists all groups', () => {
    // Create test group
    execSync(`osascript ${manageScript} "create" "TestGroup1"`);

    const result = execSync(`osascript ${listScript}`).toString().trim();
    expect(result).toContain('TestGroup1');
  });

  test('creates new group', () => {
    const result = execSync(`osascript ${manageScript} "create" "TestGroupNew"`).toString().trim();
    expect(result).toContain('Created group');
    expect(result).toContain('TestGroupNew');
  });

  test('adds person to group', () => {
    // Create group and contact
    execSync(`osascript ${manageScript} "create" "TestGroupAdd"`);
    const contactResult = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestGroup" "Member"`).toString();
    const contactId = contactResult.match(/ID: (.+)/)[1].trim();

    const result = execSync(`osascript ${manageScript} "add" "TestGroupAdd" "${contactId}"`).toString().trim();
    expect(result).toContain('Added');
    expect(result).toContain('to group');

    // Cleanup contact
    execSync(`osascript -e 'tell application "Contacts" to delete (person id "${contactId}") saving yes'`);
  });

  test('removes person from group', () => {
    // Create group and contact, add to group
    execSync(`osascript ${manageScript} "create" "TestGroupRemove"`);
    const contactResult = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestGroup" "Member"`).toString();
    const contactId = contactResult.match(/ID: (.+)/)[1].trim();
    execSync(`osascript ${manageScript} "add" "TestGroupRemove" "${contactId}"`);

    const result = execSync(`osascript ${manageScript} "remove" "TestGroupRemove" "${contactId}"`).toString().trim();
    expect(result).toContain('Removed');
    expect(result).toContain('from group');

    // Cleanup contact
    execSync(`osascript -e 'tell application "Contacts" to delete (person id "${contactId}") saving yes'`);
  });

  test('deletes group', () => {
    execSync(`osascript ${manageScript} "create" "TestGroupDelete"`);

    const result = execSync(`osascript ${manageScript} "delete" "TestGroupDelete"`).toString().trim();
    expect(result).toContain('Deleted group');
  });
});
```

**Expected Output:** Tests fail (scripts don't exist yet)

**Implement** (`skills/contacts/list-groups.scpt`):
```applescript
-- List Groups Script
-- Usage: osascript list-groups.scpt

tell application "Contacts"
    set allGroups to every group
    set groupCount to count of allGroups

    if groupCount is 0 then
        return "No contact groups found"
    end if

    set output to "📋 Contact Groups (" & groupCount & "):" & return & return

    repeat with g in allGroups
        set memberCount to count of people of g
        set output to output & "  • " & (name of g) & " (" & memberCount & " members)" & return
    end repeat

    return output
end tell
```

**Implement** (`skills/contacts/manage-group.scpt`):
```applescript
-- Manage Group Script
-- Usage: osascript manage-group.scpt <action> <group_name> [contact_id]
-- Actions: create, delete, add, remove, list

on run argv
    if (count of argv) < 2 then
        return "Error: Action and group name required. Usage: manage-group.scpt <action> <group_name> [contact_id]"
    end if

    set groupAction to item 1 of argv
    set groupName to item 2 of argv

    tell application "Contacts"
        if groupAction is "create" then
            -- Create new group
            try
                set existingGroup to group groupName
                return "Error: Group '" & groupName & "' already exists"
            on error
                make new group with properties {name:groupName}
                save
                return "✅ Created group: " & groupName
            end try

        else if groupAction is "delete" then
            -- Delete group
            try
                set theGroup to group groupName
                delete theGroup
                save
                return "🗑️ Deleted group: " & groupName
            on error
                return "Error: Group '" & groupName & "' not found"
            end try

        else if groupAction is "add" then
            -- Add person to group
            if (count of argv) < 3 then
                return "Error: Contact ID required for add action"
            end if

            set contactId to item 3 of argv

            try
                set theGroup to group groupName
                set thePerson to person id contactId
                add thePerson to theGroup
                save
                return "✅ Added " & (name of thePerson) & " to group: " & groupName
            on error errMsg
                return "Error: " & errMsg
            end try

        else if groupAction is "remove" then
            -- Remove person from group
            if (count of argv) < 3 then
                return "Error: Contact ID required for remove action"
            end if

            set contactId to item 3 of argv

            try
                set theGroup to group groupName
                set thePerson to person id contactId
                remove thePerson from theGroup
                save
                return "✅ Removed " & (name of thePerson) & " from group: " & groupName
            on error errMsg
                return "Error: " & errMsg
            end try

        else if groupAction is "list" then
            -- List members of group
            try
                set theGroup to group groupName
                set members to people of theGroup
                set memberCount to count of members

                if memberCount is 0 then
                    return "Group '" & groupName & "' has no members"
                end if

                set output to "📋 Members of " & groupName & " (" & memberCount & "):" & return & return

                repeat with m in members
                    set output to output & "  • " & (name of m)
                    if (count of emails of m) > 0 then
                        set output to output & " - " & (value of email 1 of m)
                    end if
                    set output to output & return
                end repeat

                return output
            on error
                return "Error: Group '" & groupName & "' not found"
            end try

        else
            return "Error: Unknown action '" & groupAction & "'. Supported: create, delete, add, remove, list"
        end if
    end tell
end run
```

**Verify Tests Pass:**
```bash
npm test -- contacts-groups.test.js
```

**Commit:**
```bash
git add skills/contacts/list-groups.scpt skills/contacts/manage-group.scpt tests/contacts-groups.test.js
git commit -m "feat(contacts): add group management scripts for organizing contacts

- List all groups with member counts
- Create and delete groups
- Add and remove contacts from groups
- List group members
- Validate group existence before operations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Export vCard Script (TDD)

**Goal:** Create AppleScript to export contacts as vCard format.

**Test First** (`tests/contacts-vcard.test.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

describe('Contacts vCard Export Script', () => {
  const scriptPath = path.join(__dirname, '../skills/contacts/export-vcard.scpt');
  let testContactId;

  beforeEach(() => {
    const result = execSync(`osascript ${path.join(__dirname, '../skills/contacts/add-contact.scpt')} "TestVCard" "Person" "email:vcard@example.com" "phone:555-9999"`).toString();
    testContactId = result.match(/ID: (.+)/)[1].trim();
  });

  afterEach(() => {
    try {
      execSync(`osascript -e 'tell application "Contacts" to delete (person id "${testContactId}") saving yes'`);
    } catch (e) {}
  });

  test('exports contact as vCard', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}"`).toString().trim();
    expect(result).toContain('BEGIN:VCARD');
    expect(result).toContain('END:VCARD');
    expect(result).toContain('FN:TestVCard Person');
    expect(result).toContain('vcard@example.com');
  });

  test('exports vCard with VERSION 3.0', () => {
    const result = execSync(`osascript ${scriptPath} "${testContactId}"`).toString().trim();
    expect(result).toContain('VERSION:3.0');
  });
});
```

**Expected Output:** Tests fail (script doesn't exist yet)

**Implement** (`skills/contacts/export-vcard.scpt`):
```applescript
-- Export vCard Script
-- Usage: osascript export-vcard.scpt <contact_id>

on run argv
    if (count of argv) < 1 then
        return "Error: Contact ID required. Usage: export-vcard.scpt <contact_id>"
    end if

    set contactId to item 1 of argv

    tell application "Contacts"
        try
            set thePerson to person id contactId
            return vcard of thePerson
        on error errMsg
            return "Error: " & errMsg
        end try
    end tell
end run
```

**Verify Tests Pass:**
```bash
npm test -- contacts-vcard.test.js
```

**Commit:**
```bash
git add skills/contacts/export-vcard.scpt tests/contacts-vcard.test.js
git commit -m "feat(contacts): add vCard export script for contact sharing

- Export contact as vCard 3.0 format
- Include all contact properties in vCard
- Simple single-line script using built-in vcard property
- Ready for sharing or backup

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Contact Command Handler

**Goal:** Create Node.js handler to process contact commands and execute appropriate scripts.

**Test First** (`tests/contact-handler.test.js`):
```javascript
const contactHandler = require('../lib/handlers/contact-handler');
const path = require('path');

describe('Contact Handler', () => {
  test('parses find contact command', () => {
    const parsed = contactHandler.parseCommand('/contact John Smith');
    expect(parsed.action).toBe('find');
    expect(parsed.args).toContain('John Smith');
  });

  test('parses add contact command', () => {
    const parsed = contactHandler.parseCommand('/contact add Jane Doe');
    expect(parsed.action).toBe('add');
    expect(parsed.firstName).toBe('Jane');
    expect(parsed.lastName).toBe('Doe');
  });

  test('parses update contact command', () => {
    const parsed = contactHandler.parseCommand('/contact update John title Senior Dev');
    expect(parsed.action).toBe('update');
    expect(parsed.name).toBe('John');
    expect(parsed.property).toBe('title');
    expect(parsed.value).toBe('Senior Dev');
  });

  test('parses groups command', () => {
    const parsed = contactHandler.parseCommand('/contact groups');
    expect(parsed.action).toBe('groups');
  });

  test('handles find command execution', async () => {
    const result = await contactHandler.execute({ action: 'find', args: ['Brokkr Bot'] });
    expect(result).toContain('Brokkr Bot');
  });
});
```

**Expected Output:** Tests fail (handler doesn't exist yet)

**Implement** (`lib/handlers/contact-handler.js`):
```javascript
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '../../skills/contacts');

/**
 * Parse contact command into structured data
 * @param {string} command - The full command string
 * @returns {object} Parsed command data
 */
function parseCommand(command) {
  // Remove /contact prefix
  const cleanCmd = command.replace(/^\/contact\s*/i, '').trim();

  // Empty command - show help
  if (!cleanCmd) {
    return { action: 'help' };
  }

  const parts = cleanCmd.split(/\s+/);
  const firstWord = parts[0].toLowerCase();

  // Check for action keywords
  if (firstWord === 'add') {
    // /contact add John Smith [email:...] [phone:...]
    const firstName = parts[1] || '';
    const lastName = parts[2] || '';
    const additionalProps = parts.slice(3);
    return {
      action: 'add',
      firstName,
      lastName,
      props: additionalProps
    };
  }

  if (firstWord === 'update') {
    // /contact update <name> <property> <value>
    const name = parts[1] || '';
    const property = parts[2] || '';
    const value = parts.slice(3).join(' ');
    return {
      action: 'update',
      name,
      property,
      value
    };
  }

  if (firstWord === 'delete') {
    // /contact delete <name>
    const name = parts.slice(1).join(' ');
    return {
      action: 'delete',
      name
    };
  }

  if (firstWord === 'groups') {
    // /contact groups [list|add|...]
    const subAction = parts[1] || 'list';
    return {
      action: 'groups',
      subAction,
      args: parts.slice(2)
    };
  }

  if (firstWord === 'group') {
    // /contact group <action> <group_name> [contact]
    const subAction = parts[1] || '';
    const groupName = parts[2] || '';
    const contactName = parts.slice(3).join(' ');
    return {
      action: 'group',
      subAction,
      groupName,
      contactName
    };
  }

  if (firstWord === 'vcard') {
    // /contact vcard <name>
    const name = parts.slice(1).join(' ');
    return {
      action: 'vcard',
      name
    };
  }

  // Default: find contact
  return {
    action: 'find',
    args: [cleanCmd]
  };
}

/**
 * Execute contact command
 * @param {object} parsed - Parsed command data
 * @returns {Promise<string>} Result message
 */
async function execute(parsed) {
  const { action } = parsed;

  try {
    if (action === 'help') {
      return getHelpText();
    }

    if (action === 'find') {
      const searchTerm = parsed.args.join(' ');
      const scriptPath = path.join(SCRIPTS_DIR, 'find-contact.scpt');
      const result = execSync(`osascript "${scriptPath}" "${searchTerm}"`).toString().trim();
      return result;
    }

    if (action === 'add') {
      const { firstName, lastName, props } = parsed;
      const scriptPath = path.join(SCRIPTS_DIR, 'add-contact.scpt');
      const args = [firstName, lastName, ...props].map(arg => `"${arg}"`).join(' ');
      const result = execSync(`osascript "${scriptPath}" ${args}`).toString().trim();
      return result;
    }

    if (action === 'update') {
      const { name, property, value } = parsed;

      // First find the contact to get ID
      const findScript = path.join(SCRIPTS_DIR, 'find-contact.scpt');
      const findResult = execSync(`osascript "${findScript}" "${name}"`).toString().trim();

      if (findResult.includes('No contacts found') || findResult.includes('Found')) {
        return 'Please specify exact contact name. Multiple matches found:\n' + findResult;
      }

      // Extract ID from result
      const idMatch = findResult.match(/ID: (.+)/);
      if (!idMatch) {
        return 'Error: Could not find contact ID';
      }

      const contactId = idMatch[1];
      const updateScript = path.join(SCRIPTS_DIR, 'update-contact.scpt');
      const result = execSync(`osascript "${updateScript}" "${contactId}" "${property}:${value}"`).toString().trim();
      return result;
    }

    if (action === 'delete') {
      const { name } = parsed;

      // Find contact first
      const findScript = path.join(SCRIPTS_DIR, 'find-contact.scpt');
      const findResult = execSync(`osascript "${findScript}" "${name}"`).toString().trim();

      if (findResult.includes('No contacts found') || findResult.includes('Found')) {
        return 'Please specify exact contact name:\n' + findResult;
      }

      const idMatch = findResult.match(/ID: (.+)/);
      if (!idMatch) {
        return 'Error: Could not find contact ID';
      }

      const contactId = idMatch[1];
      const deleteScript = path.join(SCRIPTS_DIR, 'delete-contact.scpt');
      const result = execSync(`osascript "${deleteScript}" "${contactId}"`).toString().trim();
      return result;
    }

    if (action === 'groups') {
      const { subAction } = parsed;
      if (subAction === 'list') {
        const scriptPath = path.join(SCRIPTS_DIR, 'list-groups.scpt');
        const result = execSync(`osascript "${scriptPath}"`).toString().trim();
        return result;
      }
      return 'Unknown groups subcommand. Use: /contact groups';
    }

    if (action === 'group') {
      const { subAction, groupName, contactName } = parsed;
      const scriptPath = path.join(SCRIPTS_DIR, 'manage-group.scpt');

      if (subAction === 'add' && contactName) {
        // Find contact first to get ID
        const findScript = path.join(SCRIPTS_DIR, 'find-contact.scpt');
        const findResult = execSync(`osascript "${findScript}" "${contactName}"`).toString().trim();
        const idMatch = findResult.match(/ID: (.+)/);
        if (!idMatch) {
          return 'Error: Contact not found';
        }
        const contactId = idMatch[1];
        const result = execSync(`osascript "${scriptPath}" "add" "${groupName}" "${contactId}"`).toString().trim();
        return result;
      }

      // Other group actions
      const args = [subAction, groupName].map(arg => `"${arg}"`).join(' ');
      const result = execSync(`osascript "${scriptPath}" ${args}`).toString().trim();
      return result;
    }

    if (action === 'vcard') {
      const { name } = parsed;

      // Find contact first
      const findScript = path.join(SCRIPTS_DIR, 'find-contact.scpt');
      const findResult = execSync(`osascript "${findScript}" "${name}"`).toString().trim();
      const idMatch = findResult.match(/ID: (.+)/);
      if (!idMatch) {
        return 'Error: Contact not found';
      }

      const contactId = idMatch[1];
      const vcardScript = path.join(SCRIPTS_DIR, 'export-vcard.scpt');
      const result = execSync(`osascript "${vcardScript}" "${contactId}"`).toString().trim();
      return result;
    }

    return 'Unknown contact command. Use /contact for help.';

  } catch (error) {
    return `Error executing contact command: ${error.message}`;
  }
}

function getHelpText() {
  return `📇 Contact Commands:

/contact <name> - Find contact by name
/contact email:<address> - Find by email
/contact phone:<number> - Find by phone
/contact add <first> <last> - Create contact
/contact update <name> <property> <value> - Update contact
/contact delete <name> - Delete contact
/contact groups - List all groups
/contact group add <name> - Create group
/contact vcard <name> - Export as vCard`;
}

module.exports = {
  parseCommand,
  execute,
  getHelpText
};
```

**Verify Tests Pass:**
```bash
npm test -- contact-handler.test.js
```

**Commit:**
```bash
git add lib/handlers/contact-handler.js tests/contact-handler.test.js
git commit -m "feat(contacts): add contact command handler with parsing and execution

- Parse various contact command patterns
- Execute appropriate AppleScript based on action
- Find contacts by name/email/phone before operations
- Support add, update, delete, groups, vcard actions
- Return formatted results from scripts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Command Registry Integration

**Goal:** Register contact command in the command registry.

**Implementation** (`lib/command-registry.js`):

Add contact command to the registry:

```javascript
// In lib/command-registry.js
const contactHandler = require('./handlers/contact-handler');

// Add to commands array
{
  pattern: /^\/contact(\s|$)/i,
  name: 'contact',
  description: 'Find and manage contacts',
  requiresAgent: false, // Handled directly by AppleScript
  handler: async (command, context) => {
    const parsed = contactHandler.parseCommand(command);
    const result = await contactHandler.execute(parsed);
    return result;
  },
  skills: [], // Pure AppleScript, no Claude agent needed
  examples: [
    '/contact John Smith',
    '/contact add Jane Doe email:jane@example.com',
    '/contact groups'
  ]
}
```

**Test the integration:**
```bash
node dry-run-test.js "/contact Brokkr Bot"
node dry-run-test.js "/contact add Test Person"
node dry-run-test.js "/contact groups"
```

**Commit:**
```bash
git add lib/command-registry.js
git commit -m "feat(contacts): register contact command in command registry

- Add /contact command pattern
- Route to contact handler (no agent required)
- Support direct AppleScript execution
- Include usage examples

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Message Parser Support

**Goal:** Update message parser to recognize contact commands.

**Implementation** (`lib/message-parser.js`):

Ensure `/contact` is recognized as a valid command prefix. The existing parser should already handle this through the command registry, but verify:

```javascript
// In lib/message-parser.js - verify contact commands are parsed correctly

// Test cases to add
const testCases = [
  { input: '/contact John', expected: { type: 'contact', isValid: true } },
  { input: '/contact add Jane Doe', expected: { type: 'contact', isValid: true } },
  { input: '/contact groups', expected: { type: 'contact', isValid: true } }
];
```

**Test:**
```bash
npm test -- message-parser.test.js
```

**Commit:**
```bash
git add lib/message-parser.js
git commit -m "feat(contacts): verify message parser handles contact commands

- Ensure /contact commands are recognized
- Add test cases for contact command parsing
- Validate command structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Dry Run Tests

**Goal:** Add dry run tests for contact commands to verify parsing before agent invocation.

**Implementation** (`dry-run-test.js`):

Add test cases:

```javascript
// In dry-run-test.js examples
const contactExamples = [
  '/contact Brokkr Bot',
  '/contact email:test@example.com',
  '/contact add John Smith email:john@example.com',
  '/contact update John title CEO',
  '/contact groups',
  '/contact vcard John Smith'
];
```

**Test:**
```bash
node dry-run-test.js "/contact Brokkr Bot"
node dry-run-test.js "/contact add Test Person email:test@example.com"
node dry-run-test.js --interactive
```

**Commit:**
```bash
git add dry-run-test.js
git commit -m "test(contacts): add dry run test cases for contact commands

- Add example contact commands for testing
- Verify command parsing without execution
- Include all major contact operations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Skill Documentation

**Goal:** Document the contacts skill in skill.md.

**Create** (`skills/contacts/skill.md`):

```markdown
# Contacts Skill

## Overview

Access and manage macOS Contacts.app via AppleScript. Find contacts, create new entries, update information, manage groups, and export vCards.

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/contact <name>` | Find contact by name | `/contact John Smith` |
| `/contact email:<address>` | Find by email | `/contact email:john@example.com` |
| `/contact phone:<number>` | Find by phone | `/contact phone:555-1234` |
| `/contact add <first> <last> [props]` | Create contact | `/contact add Jane Doe email:jane@example.com` |
| `/contact update <name> <prop> <value>` | Update contact | `/contact update John title CEO` |
| `/contact delete <name>` | Delete contact | `/contact delete Old Contact` |
| `/contact groups` | List all groups | `/contact groups` |
| `/contact group add <name>` | Create group | `/contact group add Investors` |
| `/contact vcard <name>` | Export vCard | `/contact vcard John Smith` |

## Scripts

### find-contact.scpt
Find contacts by name, email, phone, or organization.

**Usage:**
```bash
osascript find-contact.scpt "John Smith"
osascript find-contact.scpt "email:john@example.com"
osascript find-contact.scpt "phone:555-1234"
osascript find-contact.scpt "org:Acme Corp"
```

**Returns:**
- Single match: Full contact details with all properties
- Multiple matches: Summary list with names, emails, organizations
- No matches: "No contacts found" message

### add-contact.scpt
Create new contact with properties.

**Usage:**
```bash
osascript add-contact.scpt "John" "Smith"
osascript add-contact.scpt "Jane" "Doe" "email:jane@example.com" "phone:555-1234"
osascript add-contact.scpt "" "" "org:Acme Corp" "company:true"
osascript add-contact.scpt "Bob" "Jones" "org:TechCo" "title:CEO" "note:Important client"
```

**Properties:**
- `org:<name>` - Organization
- `title:<title>` - Job title
- `email:<address>` - Email (label: work)
- `phone:<number>` - Phone (label: mobile)
- `note:<text>` - Note
- `company:true` - Mark as company (no person name)
- `birthday:<date>` - Birth date

### update-contact.scpt
Modify existing contact properties.

**Usage:**
```bash
osascript update-contact.scpt "<contact_id>" "title:Senior Developer"
osascript update-contact.scpt "<contact_id>" "org:NewCorp" "dept:Engineering"
osascript update-contact.scpt "<contact_id>" "note:Updated contact info"
osascript update-contact.scpt "<contact_id>" "birthday:January 15, 1990"
```

**Updatable Properties:**
- `first`, `last`, `middle`, `nickname` - Name fields
- `org`, `title`, `dept` - Organization fields
- `note` - Notes
- `birthday` - Birth date

### add-element.scpt
Add email, phone, address, URL, social profile to contact.

**Usage:**
```bash
osascript add-element.scpt "<contact_id>" "email" "work" "john@example.com"
osascript add-element.scpt "<contact_id>" "phone" "mobile" "555-1234"
osascript add-element.scpt "<contact_id>" "url" "home page" "https://example.com"
osascript add-element.scpt "<contact_id>" "address" "home" "street:123 Main St" "city:Seattle" "state:WA" "zip:98101"
osascript add-element.scpt "<contact_id>" "social" "Twitter" "username"
osascript add-element.scpt "<contact_id>" "related" "spouse" "Jane Doe"
osascript add-element.scpt "<contact_id>" "date" "anniversary" "June 15, 2020"
```

**Element Types:**
- `email` - Email address (label, value)
- `phone` - Phone number (label, value)
- `url` - URL (label, value)
- `address` - Address (label, street, city, state, zip, country)
- `social` - Social profile (service, username)
- `related` - Related name (relationship, name)
- `date` - Custom date (occasion, date)

### delete-contact.scpt
Delete entire contact or specific element.

**Usage:**
```bash
osascript delete-contact.scpt "<contact_id>"
osascript delete-contact.scpt "<contact_id>" "email" "1"
osascript delete-contact.scpt "<contact_id>" "phone" "2"
osascript delete-contact.scpt "<contact_id>" "address" "1"
```

### list-groups.scpt
List all contact groups with member counts.

**Usage:**
```bash
osascript list-groups.scpt
```

### manage-group.scpt
Create, delete, add/remove members, list groups.

**Usage:**
```bash
osascript manage-group.scpt "create" "Investors"
osascript manage-group.scpt "delete" "Old Group"
osascript manage-group.scpt "add" "Investors" "<contact_id>"
osascript manage-group.scpt "remove" "Investors" "<contact_id>"
osascript manage-group.scpt "list" "Investors"
```

**Actions:**
- `create` - Create new group
- `delete` - Delete group
- `add` - Add contact to group
- `remove` - Remove contact from group
- `list` - List group members

### export-vcard.scpt
Export contact as vCard 3.0 format.

**Usage:**
```bash
osascript export-vcard.scpt "<contact_id>"
```

**Returns:** vCard 3.0 format string (BEGIN:VCARD ... END:VCARD)

## Integration Points

### Email Skill
When reading emails, lookup sender contact info:

```javascript
const contactHandler = require('./handlers/contact-handler');
const senderEmail = 'john@example.com';
const parsed = contactHandler.parseCommand(`/contact email:${senderEmail}`);
const contactInfo = await contactHandler.execute(parsed);
```

### iMessage Skill
Before sending message, lookup contact phone:

```javascript
const parsed = contactHandler.parseCommand('/contact John Smith');
const result = await contactHandler.execute(parsed);
// Extract phone from result
```

### Calendar Skill
Enrich calendar event attendees with contact details.

## Contact Properties Reference

**Person Object:**
- `first name`, `last name`, `middle name`, `nickname`, `maiden name`
- `suffix`, `title`, `phonetic first name`, `phonetic middle name`, `phonetic last name`
- `organization`, `department`, `job title`
- `note`, `image`, `home page`, `birth date`
- `company` (boolean) - marks organization-only contacts
- `id` - unique identifier for scripting
- `creation date`, `modification date`
- `vcard` - export as vCard 3.0 format

**Contact Elements:**
- `emails` - label, value, id
- `phones` - label, value, id
- `addresses` - label, street, city, state, zip, country, country code, id
- `urls` - label, value, id
- `social profiles` - service name, user name, user identifier, url, id
- `instant messages` - service name, user name, id (limited support)
- `related names` - label, value, id
- `custom dates` - label, value, id

**Common Labels:**
- Email: work, home, other
- Phone: work, home, mobile, iPhone, main, home fax, work fax, pager
- Address: work, home, other
- URL: home page, work, home, other

## Permissions Required

**Automation:**
- Terminal → Contacts (System Settings → Privacy & Security → Automation)

## Examples

### Find Contact
```
User: /contact John Smith
Bot: 📇 John Smith (Acme Corp - CEO)
     📧 work: john@acme.com
     📱 mobile: 555-1234
     🏠 123 Main St, Seattle, WA 98101
     🌐 https://acme.com
     🎂 Birthday: Jan 15

     ID: 12345678-ABCD-...
```

### Create Contact
```
User: /contact add Jane Doe email:jane@example.com phone:555-9999 org:TechCo title:CTO
Bot: ✅ Created contact: Jane Doe
     🏢 TechCo (CTO)
     📧 jane@example.com
     📱 555-9999

     ID: 87654321-DCBA-...
```

### List Groups
```
User: /contact groups
Bot: 📋 Contact Groups (3):

       • Family (5 members)
       • Work (12 members)
       • Investors (8 members)
```

## Error Handling

- Contact not found → Suggest similar names or create new
- Multiple matches → Show list, ask to specify exact name
- Missing required fields → Return error with usage example
- AppleScript errors → Return error message from script

## Future Enhancements

- Import vCard files (currently export-only)
- Image/photo management
- Birthday reminders integration
- Contact merge/duplicate detection
- Bulk operations (import CSV, export group)
```

**Commit:**
```bash
git add skills/contacts/skill.md
git commit -m "docs(contacts): add comprehensive contacts skill documentation

- Document all commands and scripts
- Include usage examples for each script
- List integration points with other skills
- Reference all contact properties and labels
- Add permission requirements

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 13: Integration Testing

**Goal:** Manual testing to verify end-to-end functionality.

**Create test script** (`skills/contacts/test-integration.sh`):

```bash
#!/bin/bash

echo "=== Contacts Skill Integration Test ==="
echo ""

echo "1. Testing find contact..."
node dry-run-test.js "/contact Brokkr Bot"
echo ""

echo "2. Testing add contact..."
node dry-run-test.js "/contact add TestIntegration Person email:test@example.com phone:555-9999"
echo ""

echo "3. Testing list groups..."
node dry-run-test.js "/contact groups"
echo ""

echo "4. Testing vCard export..."
node dry-run-test.js "/contact vcard Brokkr Bot"
echo ""

echo "=== Integration Test Complete ==="
```

**Run tests:**
```bash
chmod +x skills/contacts/test-integration.sh
./skills/contacts/test-integration.sh
```

**Verify:**
- All commands parse correctly
- Scripts execute without errors
- Results are formatted properly
- Contact operations work in Contacts.app

**Commit:**
```bash
git add skills/contacts/test-integration.sh
git commit -m "test(contacts): add integration test script for end-to-end verification

- Test find, add, groups, vcard commands
- Verify command parsing and execution
- Ensure proper formatting of results
- Manual verification checklist

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Update Documentation

**Goal:** Update main documentation files to reflect new contacts skill.

**Update** (`CLAUDE.md`):

Add to capabilities section:
```markdown
### Contacts Management

- **Find contacts** by name, email, phone, organization
- **Create contacts** with full property support
- **Update contacts** (name, organization, job title, birthday, etc.)
- **Manage groups** (create, add/remove members, list)
- **Export vCards** for sharing or backup
- **Integration** with email, iMessage, calendar for contact enrichment
```

Add to commands table:
```markdown
| `/contact <name>` | Find contact | `/contact John Smith` |
| `/contact add <name>` | Create contact | `/contact add Jane Doe email:jane@example.com` |
| `/contact groups` | List groups | `/contact groups` |
```

**Update** (`docs/concepts/2026-01-31-brokkr-self-improvement-system.md`):

Update contacts status:
```markdown
| Contacts | ✅ Complete | Phase 4 | Find, create, update, groups, vCard export |
```

Update Phase 4 progress:
```markdown
### Phase 4 - Apple Apps (Extended) 🔄 In Progress

11. ✅ Contacts skill - COMPLETE
12. Chrome skill (formalize existing setup)
13. Finder/Spotlight skill
14. Clipboard skill
15. Music skill
```

**Commit:**
```bash
git add CLAUDE.md docs/concepts/2026-01-31-brokkr-self-improvement-system.md
git commit -m "docs: update documentation with contacts skill capabilities

- Add contacts skill to CLAUDE.md capabilities
- Add contact commands to command reference
- Mark contacts as complete in self-improvement system
- Update Phase 4 progress tracking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

- [ ] All AppleScript tests pass (`npm test`)
- [ ] Contact handler tests pass
- [ ] Dry run tests work for all contact commands
- [ ] Manual testing successful in real Contacts.app
- [ ] Can find contacts by name, email, phone
- [ ] Can create contacts with full properties
- [ ] Can update existing contacts
- [ ] Can manage groups (create, add/remove, list)
- [ ] Can export vCards
- [ ] Integration with command registry works
- [ ] Documentation complete and accurate

---

## Notes

- **Save Required**: All Contacts.app modifications require explicit `save` command
- **Phone Normalization**: Phone search strips formatting for reliable matching
- **vCard Format**: Export returns vCard 3.0 (industry standard)
- **No vCard Import**: AppleScript cannot directly import vCard strings (UI only)
- **Image Handling**: Complex - requires image data type, deferred to future enhancement
- **Integration Ready**: Contact lookups can enhance email, iMessage, calendar features

---

## Sources

Research documentation and code examples referenced during planning:

- [View an app's scripting dictionary in Script Editor on Mac](https://support.apple.com/guide/script-editor/view-an-apps-scripting-dictionary-scpedt1126/mac)
- [AppleScript Essentials - Scripting Address Book](http://preserve.mactech.com/articles/mactech/Vol.21/21.10/ScriptingAddressBook/index.html)
- [Setting and Getting Contacts Info - MacScripter](https://www.macscripter.net/t/setting-and-getting-contacts-info/69391)
- [AppleScript for Apple Contacts: Export vCards](https://gist.github.com/a163eab884e932f1022bb50c37ccf15a)
- [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AppendixA-AppleScriptObjCQuickTranslationGuide.html)
- [How Do I Export vCards from Apple Contacts using AppleScript?](https://forum.keyboardmaestro.com/t/how-do-i-export-vcards-from-apple-contacts-using-applescript/15951)
- [AppleScript and Apple Contacts - Apple Developer Forums](https://developer.apple.com/forums/thread/681605)
