---
name: contacts
description: Access and manage Apple Contacts - search, create, update contacts
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Contacts skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`

## Skill Location

`skills/contacts/SKILL.md`

## Quick Reference

**Search contacts:**
```
/contacts search "Tommy"
/contacts find phone:+1206
```

**Create contact:**
```
/contacts create "John Doe" phone:+1234567890 email:john@example.com
```

**Update contact:**
```
/contacts update "John Doe" company:"Acme Inc"
```

**Export/Import:**
```
/contacts export "John Doe" --format vcard
/contacts import /path/to/contact.vcf
```

## Status

PLACEHOLDER - Not yet implemented. See `skills/contacts/SKILL.md` for roadmap.
