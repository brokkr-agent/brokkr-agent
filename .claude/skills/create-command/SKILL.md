---
name: create-command
description: Create a new Brokkr WhatsApp command with proper structure
disable-model-invocation: true
user-invocable: true
allowed-tools: Read, Write, Bash, Glob
argument-hint: <command-name>
---

# Create Brokkr Command

## Overview

Create a new command for the Brokkr WhatsApp bot following the established patterns.

## Arguments

- `$0` - Command name (lowercase, hyphens allowed)
- `$1` - (Optional) Command type: "claude", "skill", or "internal"

## Process

### Step 1: Validate Command Name

Check the name:
- Must be lowercase
- Only letters, numbers, hyphens
- Must start with a letter
- Must not conflict with existing commands

```bash
# Check for conflicts
ls .brokkr/commands/ 2>/dev/null | grep -w "$0" && echo "CONFLICT" || echo "OK"
```

### Step 2: Gather Requirements

Ask the user:
1. **Description** - What does this command do? (for /help, under 60 chars)
2. **Aliases** - Any shortcuts? (e.g., "r" for "research")
3. **Arguments** - What inputs does it need?
   - Required arguments
   - Optional arguments
   - Hint format (e.g., "<topic> [depth]")
4. **Handler type** - How does it work?
   - `claude` - Sends prompt to Claude
   - `skill` - Invokes a Claude Code skill
   - `internal` - Calls built-in function

### Step 3: Create Command Directory

```bash
mkdir -p .brokkr/commands/$0
```

### Step 4: Generate command.json

Based on handler type, create the appropriate definition:

**For Claude type:**
```json
{
  "name": "$0",
  "description": "<user-provided>",
  "aliases": [],
  "priority": "CRITICAL",
  "source": "both",
  "arguments": {
    "required": [],
    "optional": [],
    "hint": ""
  },
  "handler": {
    "type": "claude",
    "prompt": "<prompt with $ARGUMENTS, $0, $1 substitution>"
  },
  "session": {
    "create": true,
    "codeLength": 2
  }
}
```

**For Skill type:**
```json
{
  "name": "$0",
  "description": "<user-provided>",
  "handler": {
    "type": "skill",
    "skill": "<skill-name>"
  },
  "session": {
    "create": true,
    "codeLength": 2
  }
}
```

**For Internal type:**
```json
{
  "name": "$0",
  "description": "<user-provided>",
  "handler": {
    "type": "internal",
    "function": "<handlerFunctionName>"
  },
  "session": {
    "create": false
  }
}
```

### Step 5: Validate

Run validation:
```bash
node -e "
  import { validateCommand } from './lib/command-schema.js';
  import { readFileSync } from 'fs';
  const def = JSON.parse(readFileSync('./.brokkr/commands/$0/command.json'));
  const result = validateCommand(def);
  if (!result.valid) {
    console.error('Validation failed:', result.errors);
    process.exit(1);
  }
  console.log('Validation passed!');
"
```

### Step 6: Test Registration

```bash
node -e "
  import { CommandRegistry } from './lib/command-registry.js';
  const registry = new CommandRegistry();
  registry.discover();
  const cmd = registry.get('$0');
  if (cmd) {
    console.log('Command registered:', cmd.name);
    console.log('Description:', cmd.description);
  } else {
    console.error('Registration failed!');
    process.exit(1);
  }
"
```

## Argument Substitution Reference

Use these placeholders in prompts:
- `$ARGUMENTS` - All arguments as string
- `$0`, `$1`, `$2` - Individual arguments by position
- `${1:-default}` - Argument with default value
- `${SESSION_CODE}` - Current session code

## Example Session

User: `/create-command summarize`

Claude: Creating command "summarize". Let me gather some information:

1. What should this command do? (description for /help)

User: Summarize a URL or text content

Claude: 2. Any aliases/shortcuts? (comma-separated, or "none")

User: sum, tldr

Claude: 3. What arguments does it take?
   - Required: (comma-separated)
   - Optional: (comma-separated)
   - Hint format: (e.g., "<url> [length]")

User: Required: content. Optional: length. Hint: <url-or-text> [short|long]

Claude: 4. Handler type: claude, skill, or internal?

User: claude

Claude: 5. What prompt should Claude receive? (use $0 for content, $1 for length)

User: Summarize the following content. Length: ${1:-medium}. Content: $0

Claude: Creating command... [creates files, validates, tests]

Done! Command `/summarize` is ready. Try: `/summarize https://example.com short`

## Validation Checklist

Before completing:
- [ ] Name follows pattern: lowercase, letters/numbers/hyphens, starts with letter
- [ ] Description under 60 characters
- [ ] command.json is valid JSON
- [ ] Schema validation passes
- [ ] No conflicts with existing commands
- [ ] Registration test passes
