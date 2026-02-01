---
name: icloud
description: Manage iCloud storage paths for recordings, exports, attachments, and research
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# iCloud Storage Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

Provides standardized iCloud storage paths for all skills that need to store large files.

## Capabilities

- Get iCloud base path
- Generate dated storage paths
- Ensure directories exist
- Store recordings, exports, attachments, research

## Storage Structure

```
~/Library/Mobile Documents/com~apple~CloudDocs/
└── Brokkr/
    ├── Recordings/              # Screen recordings, audio
    │   └── YYYY-MM-DD/
    ├── Exports/                 # Generated content, reports
    │   └── YYYY-MM-DD/
    ├── Attachments/             # Email attachments, downloads
    │   └── YYYY-MM-DD/
    └── Research/                # Agent research outputs
        └── YYYY-MM-DD/
```

## Usage

### Via Command (Manual)
```
/icloud path recordings
/icloud path exports
/icloud ensure attachments
/icloud list research
```

### Programmatic Usage

```javascript
import { getPath, ensureDirectory, ICLOUD_BASE } from './lib/icloud.js';

// Get a dated path for a recording
const recordingPath = getPath('recordings', 'screen-capture.mov');

// Ensure directory exists before writing
const dir = ensureDirectory('exports');

// Access base path
console.log(ICLOUD_BASE); // ~/Library/Mobile Documents/.../Brokkr
```

## Quick Reference

| Function | Description |
|----------|-------------|
| `ICLOUD_BASE` | Base Brokkr iCloud directory |
| `getPath(category, filename)` | Get full path for file in category |
| `ensureDirectory(category)` | Create dated directory, return path |
| `getDateFolder()` | Get current date string (YYYY-MM-DD) |

## Categories

| Category | Purpose |
|----------|---------|
| `recordings` | Screen recordings, audio files |
| `exports` | Generated reports, documents |
| `attachments` | Downloaded files, email attachments |
| `research` | Agent research outputs |

## Directory Structure

```
skills/icloud/
  SKILL.md                    # This file
  config.json                 # Configuration
  lib/
    icloud.js                 # Core iCloud functions (wraps lib/icloud-storage.js)
  reference/
    .gitkeep
  scripts/
    .gitkeep
  tests/
    icloud.test.js
```

## Integration with Other Skills

All Apple Integration skills should use this skill for large file storage:

```javascript
// In another skill (e.g., screen-capture)
import { getPath } from '../../icloud/lib/icloud.js';

const outputPath = getPath('recordings', `capture-${Date.now()}.mov`);
```

## Error Handling

```javascript
const result = ensureDirectory('recordings');
// Returns the directory path, creating it if needed
```

## Requirements

- iCloud Drive enabled and syncing
- Brokkr folder accessible at standard path
