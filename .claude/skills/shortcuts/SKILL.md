---
name: shortcuts
description: Run and manage Apple Shortcuts from the command line
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Shortcuts Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

Run and manage Apple Shortcuts from the command line.

## Capabilities

- List available shortcuts
- Run shortcuts with optional input
- Get shortcut output
- Check if shortcut exists

## Usage

### Via Command (Manual)
```
/shortcuts list
/shortcuts run "Shortcut Name"
/shortcuts run "Shortcut Name" --input "Some text"
/shortcuts exists "Shortcut Name"
```

### Programmatic Usage

```javascript
import { runShortcut, listShortcuts, shortcutExists } from './lib/shortcuts.js';

// Run a shortcut
const result = await runShortcut('AirPods Noise Control');

// Run with input
const output = await runShortcut('Process Text', { input: 'Hello World' });

// List all shortcuts
const shortcuts = await listShortcuts();

// Check if exists
const exists = await shortcutExists('My Shortcut');
```

## Quick Reference

| Function | Description |
|----------|-------------|
| `listShortcuts()` | List all available shortcuts |
| `runShortcut(name, options)` | Run a shortcut |
| `shortcutExists(name)` | Check if shortcut exists |
| `getShortcutInfo(name)` | Get shortcut metadata |

## CLI Reference

The `shortcuts` CLI is built into macOS:

```bash
# List all shortcuts
shortcuts list

# Run a shortcut
shortcuts run "Shortcut Name"

# Run with stdin input
echo "input" | shortcuts run "Shortcut Name"

# Run with file input
shortcuts run "Shortcut Name" --input-path /path/to/file
```

## Common Use Cases

### Audio Device Control
```javascript
await runShortcut('AirPods Noise Control');
await runShortcut('Switch to Speakers');
```

### System Automation
```javascript
await runShortcut('Toggle Dark Mode');
await runShortcut('Set Focus Mode');
```

### Content Processing
```javascript
const summary = await runShortcut('Summarize Text', {
  input: longText
});
```

## Directory Structure

```
skills/shortcuts/
  SKILL.md                    # This file
  config.json                 # Configuration
  lib/
    shortcuts.js              # Core shortcut functions
  reference/
    .gitkeep
  scripts/
    .gitkeep
  tests/
    shortcuts.test.js
```

## Integration with Other Skills

Shortcuts can extend other skills' capabilities:

```javascript
// In Bluetooth skill - AirPods noise control
import { runShortcut } from '../../shortcuts/lib/shortcuts.js';

await runShortcut('AirPods Noise Control');
```

## Error Handling

```javascript
const result = await runShortcut('Nonexistent');
if (!result.success) {
  console.error(`Failed: ${result.error}`);
}
```

## Requirements

- macOS 12+ (Monterey) - Shortcuts CLI included
- Shortcuts app configured with desired shortcuts
