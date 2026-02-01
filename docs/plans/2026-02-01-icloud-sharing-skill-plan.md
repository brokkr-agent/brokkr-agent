# iCloud Sharing Skill Implementation Plan

> **Architecture Reference:** This plan follows the standardized patterns defined in
> `docs/concepts/2026-02-01-apple-integration-architecture.md`

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Enable Brokkr to share files with Tommy via iCloud Drive, check sync status, and retrieve shared files, allowing seamless file exchange between the agent and user.

**Architecture:** This IS the core iCloud storage provider for all Apple Integration skills. Provides `lib/icloud-storage.js` shared library that all other skills use for storing large files (recordings, exports, attachments, research). Uses standardized folder organization with date-based subdirectories.

**Tech Stack:** Node.js, Bash scripts, brctl (iCloud Drive CLI), standard Unix file utilities

---

## Skill Directory Structure

```
skills/icloud-sharing/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── icloud-sharing.js       # Core file sharing functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   ├── brctl-commands.md       # brctl CLI reference
│   └── icloud-paths.md         # iCloud Drive path documentation
├── scripts/                    # Reusable automation scripts
│   ├── share-file.sh           # Share a file to iCloud
│   ├── sync-status.sh          # Check sync status
│   ├── list-shared.sh          # List shared files
│   └── get-shared.sh           # Retrieve shared file
└── tests/
    ├── icloud-sharing.test.js
    └── icloud-sharing-integration.test.js
```

## Command File

**Location:** `.claude/commands/icloud.md`

```yaml
---
name: icloud
description: Share files via iCloud Drive and manage sync status
argument-hint: [action] [file] [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the iCloud Sharing skill and process: $ARGUMENTS

Available actions:
- share <file> [name] - Share a file to iCloud Drive
- list - List shared files
- get <filename> [destination] - Retrieve a shared file
- status <file> - Check iCloud sync status

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## Shared Library: lib/icloud-storage.js

This is the CORE storage provider used by all Apple Integration skills.

```javascript
// lib/icloud-storage.js
const path = require('path');
const fs = require('fs');

const ICLOUD_BASE = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Brokkr'
);

const CATEGORIES = {
  recordings: 'Recordings',    // Screen recordings, audio
  exports: 'Exports',          // Generated content, reports
  attachments: 'Attachments',  // Email attachments, downloads
  research: 'Research'         // Agent research outputs
};

function getDateFolder() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function ensureDirectory(category) {
  const dir = path.join(ICLOUD_BASE, CATEGORIES[category], getDateFolder());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getPath(category, filename) {
  const dir = ensureDirectory(category);
  return path.join(dir, filename);
}

module.exports = { ICLOUD_BASE, CATEGORIES, ensureDirectory, getPath };
```

## How Other Skills Use This

All Apple Integration skills import `lib/icloud-storage.js`:

```javascript
// In skills/bluetooth/lib/device-manager.js
import { getPath } from '../../../lib/icloud-storage.js';

const researchPath = getPath('research', `bluetooth-device-${name}.md`);

// In skills/notifications/notification-monitor.js
import { getPath } from '../../../lib/icloud-storage.js';

const logPath = getPath('exports', `notifications-${date}.json`);
```

---

## CRITICAL: Research Findings (2026-02-01)

### iCloud Drive File System Location (macOS Sonoma 14.8.3)

**Standard Path:** `~/Library/Mobile Documents/com~apple~CloudDocs/`

In Sonoma, the system shows `~/Library/iCloud Drive` in Finder, which is a synthetic view of the same location. From Terminal, the Mobile Documents path works reliably.

### Folder Sharing vs Family Sharing Storage

**Important Distinction:**
- **Family Sharing Storage** - Family members share iCloud storage quota but CANNOT see each other's files by default
- **Folder Sharing** - Individual folders/files can be explicitly shared with specific people via iCloud Drive sharing

The implementation uses **iCloud Drive Folder Sharing**, not Family Sharing storage. Tommy and Brokkr must explicitly share a folder for file exchange.

### Shared Folder Indicators

Shared folders in iCloud Drive display an icon with three "people" silhouettes in Finder, indicating collaborative access. Both the sharer and recipient see the folder in their iCloud Drive.

### Sync Status Changes in Sonoma

**Before Sonoma:**
- Evicted files had names starting with a period (`.filename`)
- Showed as small stub files (<200 bytes)

**In Sonoma 14.0+:**
- Evicted files keep original names (no period prefix)
- Show same file size as downloaded files
- Only distinction is metadata status: `NotDownloaded` vs `Current`

### brctl Command-Line Tool

macOS provides `brctl` for managing iCloud Drive sync:

**Key Commands:**
```bash
# Check sync status
brctl status /path/to/file

# Download file from iCloud
brctl download /path/to/file

# Evict file (remove local copy)
brctl evict /path/to/file

# Monitor sync activity
brctl monitor com.apple.CloudDocs

# Check download progress
brctl monitor com.apple.CloudDocs | grep ↓

# Check upload progress
brctl monitor com.apple.CloudDocs | grep ↑

# Watch live log
brctl log -w

# Run diagnostics
brctl diagnose
```

### Alternative Tool: fileproviderctl

For more general file provider operations:
```bash
fileproviderctl materialize /path/to/file  # Download
fileproviderctl evict /path/to/file        # Remove local
```

### Metadata Checking

Use `mdls` to check file status:
```bash
mdls -name kMDItemPath -name kMDItemFSSize /path/to/file
```

### Official Documentation Sources

- [Use iCloud to share and collaborate on files and folders - Apple Support](https://support.apple.com/guide/mac-help/share-and-collaborate-on-files-and-folders-mchl91854a7a/mac)
- [How iCloud Drive works in macOS Sonoma – The Eclectic Light Company](https://eclecticlight.co/2024/03/18/how-icloud-drive-works-in-macos-sonoma/)
- [Diagnosing iCloud problems using brctl – The Eclectic Light Company](https://eclecticlight.co/2018/04/12/diagnosing-icloud-problems-using-brctl-sync-budgets-and-throttles/)
- [brctl - hitchhiker's guide](https://man.ilayk.com/man/brctl/)
- [Manually downloading or evicting iCloud files](https://techgarden.alphasmanifesto.com/mac/Manually-downloading-or-evicting-iCloud-files)

---

## Design Decisions

### Dedicated Shared Folder

Use `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared/` as the designated exchange location. This keeps Brokkr's file sharing organized and separate from other iCloud Drive content.

### Sync Verification Strategy

Before confirming a file is shared, verify sync status using `brctl status`. Wait for status to show `Current` (fully synced) rather than `NotDownloaded` or `Downloading`.

### Timeout Handling

Large files may take minutes to sync. Implement timeout and progress monitoring to avoid indefinite waits.

### File Naming Conventions

Prefix shared files with timestamps for organization:
```
Brokkr-Shared/
  2026-02-01-daily-report.pdf
  2026-02-01-analytics-export.csv
  2026-02-01-screenshot.png
```

### Notifications

When sharing important files, send iMessage notification to Tommy (requires iMessage skill).

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | Shell Utility: Share File | `skills/icloud-sharing/share-file.sh`, `tests/icloud-sharing.test.js` |
| 2 | Shell Utility: Check Sync Status | `skills/icloud-sharing/sync-status.sh` |
| 3 | Shell Utility: List Shared Files | `skills/icloud-sharing/list-shared.sh` |
| 4 | Shell Utility: Retrieve Shared File | `skills/icloud-sharing/get-shared.sh` |
| 5 | Integration Module | `lib/icloud-sharing.js`, `tests/icloud-sharing-integration.test.js` |
| 6 | Skill Documentation | `skills/icloud-sharing/skill.md` |
| 7 | Command Registration | `lib/command-registry.js` |
| 8 | Integration Testing | Manual testing script |
| 9 | CLAUDE.md Documentation | `CLAUDE.md` |

---

## Task 1: Shell Utility: Share File

**Files:**
- Create: `skills/icloud-sharing/share-file.sh`
- Create: `tests/icloud-sharing.test.js`

### Step 1: Write the failing test

```javascript
// tests/icloud-sharing.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';

const ICLOUD_SHARED_DIR = join(process.env.HOME, 'Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared');
const SKILL_DIR = join(process.cwd(), 'skills/icloud-sharing');
const SHARE_SCRIPT = join(SKILL_DIR, 'share-file.sh');

describe('iCloud Sharing - Share File', () => {
  beforeAll(() => {
    // Create test environment
    if (!existsSync(ICLOUD_SHARED_DIR)) {
      mkdirSync(ICLOUD_SHARED_DIR, { recursive: true });
    }
  });

  it('should have executable share-file.sh script', () => {
    expect(existsSync(SHARE_SCRIPT)).toBe(true);
    const stats = execSync(`test -x "${SHARE_SCRIPT}" && echo "true" || echo "false"`, { encoding: 'utf-8' }).trim();
    expect(stats).toBe('true');
  });

  it('should reject missing file argument', () => {
    try {
      execSync(`"${SHARE_SCRIPT}"`, { encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.stderr.toString()).toContain('Usage:');
    }
  });

  it('should reject non-existent file', () => {
    try {
      execSync(`"${SHARE_SCRIPT}" /tmp/nonexistent-file-12345.txt`, { encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.stderr.toString()).toContain('not found');
    }
  });

  it('should copy file to iCloud shared folder', () => {
    // Create test file
    const testFile = '/tmp/test-share-file.txt';
    writeFileSync(testFile, 'Test content for iCloud sharing');

    try {
      const output = execSync(`"${SHARE_SCRIPT}" "${testFile}"`, { encoding: 'utf-8' });

      // Verify output indicates success
      expect(output).toContain('Shared to iCloud');
      expect(output).toContain('test-share-file.txt');

      // Verify file exists in shared folder
      const sharedFile = join(ICLOUD_SHARED_DIR, 'test-share-file.txt');
      expect(existsSync(sharedFile)).toBe(true);

      // Cleanup
      unlinkSync(sharedFile);
    } finally {
      unlinkSync(testFile);
    }
  });

  it('should support custom filename', () => {
    const testFile = '/tmp/original-name.txt';
    writeFileSync(testFile, 'Test content');

    try {
      const output = execSync(`"${SHARE_SCRIPT}" "${testFile}" custom-name.txt`, { encoding: 'utf-8' });

      expect(output).toContain('custom-name.txt');

      const sharedFile = join(ICLOUD_SHARED_DIR, 'custom-name.txt');
      expect(existsSync(sharedFile)).toBe(true);

      unlinkSync(sharedFile);
    } finally {
      unlinkSync(testFile);
    }
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- tests/icloud-sharing.test.js`
Expected: FAIL with "share-file.sh not found" or "cannot find module"

### Step 3: Create skill directory

```bash
mkdir -p skills/icloud-sharing
```

### Step 4: Write minimal implementation

```bash
#!/bin/bash
# skills/icloud-sharing/share-file.sh
# Share a file to iCloud Drive Brokkr-Shared folder

set -euo pipefail

# Configuration
ICLOUD_SHARED="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared"

# Usage
usage() {
    echo "Usage: $0 <source-file> [destination-filename]"
    echo ""
    echo "Share a file to iCloud Drive Brokkr-Shared folder"
    echo ""
    echo "Arguments:"
    echo "  source-file           Path to file to share"
    echo "  destination-filename  Optional custom filename (default: use source filename)"
    echo ""
    echo "Examples:"
    echo "  $0 ~/Desktop/report.pdf"
    echo "  $0 /tmp/data.csv 2026-02-01-data.csv"
    exit 1
}

# Check arguments
if [ $# -lt 1 ]; then
    usage
fi

SOURCE_FILE="$1"
DEST_FILENAME="${2:-$(basename "$SOURCE_FILE")}"

# Validate source file
if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: File not found: $SOURCE_FILE" >&2
    exit 1
fi

# Ensure shared directory exists
mkdir -p "$ICLOUD_SHARED"

# Destination path
DEST_PATH="$ICLOUD_SHARED/$DEST_FILENAME"

# Copy file
cp "$SOURCE_FILE" "$DEST_PATH"

# Get file size for output
FILE_SIZE=$(stat -f%z "$DEST_PATH" 2>/dev/null || echo "unknown")

echo "Shared to iCloud: $DEST_FILENAME ($FILE_SIZE bytes)"
echo "Location: $DEST_PATH"

# Check if brctl is available for sync monitoring
if command -v brctl &> /dev/null; then
    echo "Initiating sync..."
    # Trigger immediate upload (brctl will handle this)
    brctl download "$DEST_PATH" 2>/dev/null || true
else
    echo "Note: Install brctl for sync status monitoring"
fi

echo "File will sync to iCloud Drive shortly"
```

### Step 5: Make script executable

```bash
chmod +x skills/icloud-sharing/share-file.sh
```

### Step 6: Run test to verify it passes

Run: `npm test -- tests/icloud-sharing.test.js`
Expected: PASS (all tests for share-file)

### Step 7: Commit

```bash
git add skills/icloud-sharing/share-file.sh tests/icloud-sharing.test.js
git commit -m "feat(icloud): add share-file utility script"
```

---

## Task 2: Shell Utility: Check Sync Status

**Files:**
- Create: `skills/icloud-sharing/sync-status.sh`

### Step 1: Extend test suite

Add to `tests/icloud-sharing.test.js`:

```javascript
describe('iCloud Sharing - Sync Status', () => {
  const SYNC_STATUS_SCRIPT = join(SKILL_DIR, 'sync-status.sh');

  it('should have executable sync-status.sh script', () => {
    expect(existsSync(SYNC_STATUS_SCRIPT)).toBe(true);
  });

  it('should report status for file', () => {
    // Create test file
    const testFile = join(ICLOUD_SHARED_DIR, 'sync-test.txt');
    writeFileSync(testFile, 'Sync status test');

    try {
      const output = execSync(`"${SYNC_STATUS_SCRIPT}" "${testFile}"`, { encoding: 'utf-8' });

      // Should contain file path and status
      expect(output).toContain('sync-test.txt');
      expect(output).toMatch(/Status:|Current|Downloading|NotDownloaded/);
    } finally {
      unlinkSync(testFile);
    }
  });

  it('should handle missing file gracefully', () => {
    try {
      execSync(`"${SYNC_STATUS_SCRIPT}" /tmp/nonexistent-12345.txt`, { encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.stderr.toString()).toContain('not found');
    }
  });
});
```

### Step 2: Write implementation

```bash
#!/bin/bash
# skills/icloud-sharing/sync-status.sh
# Check iCloud sync status for a file

set -euo pipefail

usage() {
    echo "Usage: $0 <file-path>"
    echo ""
    echo "Check iCloud Drive sync status for a file"
    echo ""
    echo "Examples:"
    echo "  $0 ~/Library/Mobile\\ Documents/com~apple~CloudDocs/test.pdf"
    echo "  $0 /Users/brokkrbot/Library/Mobile\\ Documents/com~apple~CloudDocs/Brokkr-Shared/report.pdf"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

FILE_PATH="$1"

# Validate file exists
if [ ! -e "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH" >&2
    exit 1
fi

echo "File: $(basename "$FILE_PATH")"
echo "Path: $FILE_PATH"
echo ""

# Check if brctl is available
if command -v brctl &> /dev/null; then
    echo "=== brctl Status ==="
    brctl status "$FILE_PATH" 2>&1 || echo "Unable to get brctl status"
    echo ""
fi

# Use mdls to check metadata
if command -v mdls &> /dev/null; then
    echo "=== File Metadata ==="

    # File size
    SIZE=$(mdls -name kMDItemFSSize -raw "$FILE_PATH" 2>/dev/null || echo "unknown")
    echo "Size: $SIZE bytes"

    # Modification date
    MOD_DATE=$(mdls -name kMDItemFSContentChangeDate -raw "$FILE_PATH" 2>/dev/null || echo "unknown")
    echo "Modified: $MOD_DATE"

    # Check if file is in iCloud
    IS_ICLOUD=$(echo "$FILE_PATH" | grep -c "Mobile Documents" || echo "0")
    if [ "$IS_ICLOUD" = "1" ]; then
        echo "Location: iCloud Drive"
    else
        echo "Location: Local filesystem"
    fi
fi

exit 0
```

### Step 3: Make executable and test

```bash
chmod +x skills/icloud-sharing/sync-status.sh
npm test -- tests/icloud-sharing.test.js
```

### Step 4: Commit

```bash
git add skills/icloud-sharing/sync-status.sh tests/icloud-sharing.test.js
git commit -m "feat(icloud): add sync-status utility script"
```

---

## Task 3: Shell Utility: List Shared Files

**Files:**
- Create: `skills/icloud-sharing/list-shared.sh`

### Step 1: Extend test suite

```javascript
describe('iCloud Sharing - List Shared', () => {
  const LIST_SCRIPT = join(SKILL_DIR, 'list-shared.sh');

  it('should have executable list-shared.sh script', () => {
    expect(existsSync(LIST_SCRIPT)).toBe(true);
  });

  it('should list files in shared folder', () => {
    // Create test files
    const file1 = join(ICLOUD_SHARED_DIR, 'file1.txt');
    const file2 = join(ICLOUD_SHARED_DIR, 'file2.txt');
    writeFileSync(file1, 'Test 1');
    writeFileSync(file2, 'Test 2');

    try {
      const output = execSync(`"${LIST_SCRIPT}"`, { encoding: 'utf-8' });

      expect(output).toContain('file1.txt');
      expect(output).toContain('file2.txt');
    } finally {
      unlinkSync(file1);
      unlinkSync(file2);
    }
  });

  it('should handle empty folder', () => {
    // Ensure folder is empty
    const files = execSync(`ls -A "${ICLOUD_SHARED_DIR}" 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
    if (files) {
      rmSync(ICLOUD_SHARED_DIR, { recursive: true, force: true });
      mkdirSync(ICLOUD_SHARED_DIR, { recursive: true });
    }

    const output = execSync(`"${LIST_SCRIPT}"`, { encoding: 'utf-8' });
    expect(output).toContain('No files');
  });
});
```

### Step 2: Write implementation

```bash
#!/bin/bash
# skills/icloud-sharing/list-shared.sh
# List files in iCloud Drive Brokkr-Shared folder

set -euo pipefail

ICLOUD_SHARED="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared"

# Ensure directory exists
if [ ! -d "$ICLOUD_SHARED" ]; then
    echo "Brokkr-Shared folder not found in iCloud Drive"
    echo "Creating: $ICLOUD_SHARED"
    mkdir -p "$ICLOUD_SHARED"
fi

echo "=== iCloud Brokkr-Shared Files ==="
echo "Location: $ICLOUD_SHARED"
echo ""

# Count files
FILE_COUNT=$(find "$ICLOUD_SHARED" -maxdepth 1 -type f | wc -l | tr -d ' ')

if [ "$FILE_COUNT" = "0" ]; then
    echo "No files in shared folder"
    exit 0
fi

echo "Files: $FILE_COUNT"
echo ""

# List files with details
find "$ICLOUD_SHARED" -maxdepth 1 -type f -print0 | while IFS= read -r -d '' file; do
    BASENAME=$(basename "$file")
    SIZE=$(stat -f%z "$file" 2>/dev/null || echo "?")
    MOD_TIME=$(stat -f%Sm -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || echo "unknown")

    echo "$BASENAME"
    echo "  Size: $SIZE bytes"
    echo "  Modified: $MOD_TIME"
    echo ""
done

exit 0
```

### Step 3: Make executable and test

```bash
chmod +x skills/icloud-sharing/list-shared.sh
npm test -- tests/icloud-sharing.test.js
```

### Step 4: Commit

```bash
git add skills/icloud-sharing/list-shared.sh tests/icloud-sharing.test.js
git commit -m "feat(icloud): add list-shared utility script"
```

---

## Task 4: Shell Utility: Retrieve Shared File

**Files:**
- Create: `skills/icloud-sharing/get-shared.sh`

### Step 1: Extend test suite

```javascript
describe('iCloud Sharing - Get Shared', () => {
  const GET_SCRIPT = join(SKILL_DIR, 'get-shared.sh');

  it('should have executable get-shared.sh script', () => {
    expect(existsSync(GET_SCRIPT)).toBe(true);
  });

  it('should retrieve file from shared folder', () => {
    // Create file in shared folder
    const sharedFile = join(ICLOUD_SHARED_DIR, 'retrieve-test.txt');
    writeFileSync(sharedFile, 'Retrieve me');

    // Destination
    const destFile = '/tmp/retrieved-test.txt';

    try {
      const output = execSync(`"${GET_SCRIPT}" retrieve-test.txt "${destFile}"`, { encoding: 'utf-8' });

      expect(output).toContain('Retrieved');
      expect(existsSync(destFile)).toBe(true);

      unlinkSync(destFile);
    } finally {
      unlinkSync(sharedFile);
    }
  });

  it('should reject missing filename', () => {
    try {
      execSync(`"${GET_SCRIPT}"`, { encoding: 'utf-8', stdio: 'pipe' });
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.stderr.toString()).toContain('Usage:');
    }
  });
});
```

### Step 2: Write implementation

```bash
#!/bin/bash
# skills/icloud-sharing/get-shared.sh
# Retrieve a file from iCloud Drive Brokkr-Shared folder

set -euo pipefail

ICLOUD_SHARED="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared"

usage() {
    echo "Usage: $0 <filename> [destination-path]"
    echo ""
    echo "Retrieve a file from iCloud Drive Brokkr-Shared folder"
    echo ""
    echo "Arguments:"
    echo "  filename           Name of file in Brokkr-Shared folder"
    echo "  destination-path   Where to copy the file (default: current directory)"
    echo ""
    echo "Examples:"
    echo "  $0 report.pdf"
    echo "  $0 data.csv /tmp/downloaded-data.csv"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

FILENAME="$1"
SOURCE_PATH="$ICLOUD_SHARED/$FILENAME"

# Validate source exists
if [ ! -f "$SOURCE_PATH" ]; then
    echo "Error: File not found in Brokkr-Shared: $FILENAME" >&2
    echo "Available files:" >&2
    ls -1 "$ICLOUD_SHARED" 2>/dev/null || echo "  (none)" >&2
    exit 1
fi

# Determine destination
if [ $# -ge 2 ]; then
    DEST_PATH="$2"
else
    DEST_PATH="$PWD/$FILENAME"
fi

# If brctl available, ensure file is downloaded
if command -v brctl &> /dev/null; then
    echo "Ensuring file is fully downloaded from iCloud..."
    brctl download "$SOURCE_PATH" 2>/dev/null || true

    # Wait briefly for download
    sleep 1
fi

# Copy file
cp "$SOURCE_PATH" "$DEST_PATH"

FILE_SIZE=$(stat -f%z "$DEST_PATH" 2>/dev/null || echo "unknown")

echo "Retrieved: $FILENAME ($FILE_SIZE bytes)"
echo "Saved to: $DEST_PATH"

exit 0
```

### Step 3: Make executable and test

```bash
chmod +x skills/icloud-sharing/get-shared.sh
npm test -- tests/icloud-sharing.test.js
```

### Step 4: Commit

```bash
git add skills/icloud-sharing/get-shared.sh tests/icloud-sharing.test.js
git commit -m "feat(icloud): add get-shared utility script"
```

---

## Task 5: Integration Module

**Files:**
- Create: `lib/icloud-sharing.js`
- Create: `tests/icloud-sharing-integration.test.js`

### Step 1: Write integration test

```javascript
// tests/icloud-sharing-integration.test.js
import { describe, it, expect } from 'vitest';
import { shareFile, listSharedFiles, getSharedFile, checkSyncStatus } from '../lib/icloud-sharing.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

describe('iCloud Sharing Integration', () => {
  describe('shareFile', () => {
    it('should share a file to iCloud', async () => {
      const testFile = '/tmp/integration-test.txt';
      writeFileSync(testFile, 'Integration test content');

      try {
        const result = await shareFile(testFile);

        expect(result.success).toBe(true);
        expect(result.filename).toContain('integration-test.txt');
        expect(result.path).toContain('Brokkr-Shared');
      } finally {
        unlinkSync(testFile);
        // Cleanup shared file if exists
        const sharedPath = result.path;
        if (existsSync(sharedPath)) {
          unlinkSync(sharedPath);
        }
      }
    });
  });

  describe('listSharedFiles', () => {
    it('should return array of shared files', async () => {
      const files = await listSharedFiles();

      expect(Array.isArray(files)).toBe(true);
      // Each file should have name, size, modifiedAt
      files.forEach(file => {
        expect(file).toHaveProperty('name');
        expect(file).toHaveProperty('size');
        expect(file).toHaveProperty('modifiedAt');
      });
    });
  });
});
```

### Step 2: Run test to verify failure

Run: `npm test -- tests/icloud-sharing-integration.test.js`

### Step 3: Write implementation

```javascript
// lib/icloud-sharing.js
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

const SKILL_DIR = join(process.cwd(), 'skills/icloud-sharing');
const SHARE_SCRIPT = join(SKILL_DIR, 'share-file.sh');
const LIST_SCRIPT = join(SKILL_DIR, 'list-shared.sh');
const GET_SCRIPT = join(SKILL_DIR, 'get-shared.sh');
const SYNC_STATUS_SCRIPT = join(SKILL_DIR, 'sync-status.sh');

/**
 * Share a file to iCloud Drive Brokkr-Shared folder
 * @param {string} sourceFile - Path to file to share
 * @param {string} [customFilename] - Optional custom filename
 * @returns {Promise<{success: boolean, filename: string, path: string, error?: string}>}
 */
export async function shareFile(sourceFile, customFilename = null) {
  if (!existsSync(sourceFile)) {
    return {
      success: false,
      error: `File not found: ${sourceFile}`
    };
  }

  try {
    const args = customFilename ? `"${sourceFile}" "${customFilename}"` : `"${sourceFile}"`;
    const { stdout } = await execAsync(`"${SHARE_SCRIPT}" ${args}`);

    // Parse output
    const filenameMatch = stdout.match(/Shared to iCloud: (.+?) \(/);
    const pathMatch = stdout.match(/Location: (.+)/);

    return {
      success: true,
      filename: filenameMatch ? filenameMatch[1] : customFilename || sourceFile.split('/').pop(),
      path: pathMatch ? pathMatch[1].trim() : '',
      output: stdout
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * List files in iCloud Drive Brokkr-Shared folder
 * @returns {Promise<Array<{name: string, size: number, modifiedAt: string}>>}
 */
export async function listSharedFiles() {
  try {
    const { stdout } = await execAsync(`"${LIST_SCRIPT}"`);

    // Parse output - extract file entries
    const files = [];
    const lines = stdout.split('\n');

    let currentFile = null;
    for (const line of lines) {
      const trimmed = line.trim();

      // File name (not indented, not a header)
      if (trimmed && !trimmed.startsWith('Size:') && !trimmed.startsWith('Modified:') &&
          !trimmed.startsWith('===') && !trimmed.startsWith('Location:') &&
          !trimmed.startsWith('Files:') && !trimmed.startsWith('No files')) {

        if (currentFile) {
          files.push(currentFile);
        }
        currentFile = { name: trimmed, size: 0, modifiedAt: '' };
      }

      // Size
      if (trimmed.startsWith('Size:') && currentFile) {
        const sizeMatch = trimmed.match(/Size: (\d+)/);
        if (sizeMatch) {
          currentFile.size = parseInt(sizeMatch[1], 10);
        }
      }

      // Modified time
      if (trimmed.startsWith('Modified:') && currentFile) {
        const modMatch = trimmed.match(/Modified: (.+)/);
        if (modMatch) {
          currentFile.modifiedAt = modMatch[1].trim();
        }
      }
    }

    if (currentFile) {
      files.push(currentFile);
    }

    return files;
  } catch (err) {
    console.error('[iCloud Sharing] List error:', err.message);
    return [];
  }
}

/**
 * Retrieve a file from iCloud Drive Brokkr-Shared folder
 * @param {string} filename - Name of file in shared folder
 * @param {string} [destinationPath] - Where to save (default: current directory)
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function getSharedFile(filename, destinationPath = null) {
  try {
    const args = destinationPath ? `"${filename}" "${destinationPath}"` : `"${filename}"`;
    const { stdout } = await execAsync(`"${GET_SCRIPT}" ${args}`);

    const pathMatch = stdout.match(/Saved to: (.+)/);

    return {
      success: true,
      path: pathMatch ? pathMatch[1].trim() : destinationPath || `./${filename}`,
      output: stdout
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Check iCloud sync status for a file
 * @param {string} filePath - Path to file
 * @returns {Promise<{success: boolean, status?: string, output?: string, error?: string}>}
 */
export async function checkSyncStatus(filePath) {
  try {
    const { stdout } = await execAsync(`"${SYNC_STATUS_SCRIPT}" "${filePath}"`);

    // Parse status from output
    let status = 'Unknown';
    if (stdout.includes('Current')) {
      status = 'Current';
    } else if (stdout.includes('Downloading')) {
      status = 'Downloading';
    } else if (stdout.includes('NotDownloaded')) {
      status = 'NotDownloaded';
    }

    return {
      success: true,
      status,
      output: stdout
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}
```

### Step 4: Test

Run: `npm test -- tests/icloud-sharing-integration.test.js`

### Step 5: Commit

```bash
git add lib/icloud-sharing.js tests/icloud-sharing-integration.test.js
git commit -m "feat(icloud): add integration module for sharing functions"
```

---

## Task 6: Skill Documentation

**Files:**
- Create: `skills/icloud-sharing/SKILL.md`

### Step 1: Create documentation with standard header

```yaml
---
name: icloud-sharing
description: Core iCloud storage provider for Apple Integration suite - share files and manage iCloud Drive
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---
```

```markdown
# iCloud Sharing Skill

> **For Claude:** This skill is the CORE storage provider for the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Overview

Share files between Brokkr and Tommy via iCloud Drive folder sharing. Provides the `lib/icloud-storage.js` shared library that ALL other Apple Integration skills use for storing large files.

## Capabilities

- Share files to iCloud Drive Brokkr-Shared folder
- List shared files with size and modification time
- Retrieve shared files from Tommy
- Check iCloud sync status via brctl
- Provide standardized storage paths for all skills

## Usage

### Via Command (Manual)
```
/icloud share ~/Desktop/report.pdf
/icloud share /tmp/data.csv 2026-02-01-data.csv
/icloud list
/icloud get report.pdf
/icloud status ~/path/to/file
```

### Via Shared Library (Other Skills)
```javascript
import { getPath, ensureDirectory } from '../../../lib/icloud-storage.js';

// Store in appropriate category
const path = getPath('recordings', 'screen-capture.mp4');
const path = getPath('exports', 'daily-report.pdf');
const path = getPath('attachments', 'email-attachment.pdf');
const path = getPath('research', 'device-findings.md');
```

## Storage Organization

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

## Configuration

**Shared Folder:** `~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared/`

This folder must be explicitly shared between Tommy's and Brokkr's iCloud accounts using iCloud Drive folder sharing.

## Scripts

### share-file.sh

Share a file to iCloud Drive.

```bash
./skills/icloud-sharing/share-file.sh <source-file> [custom-filename]
```

Examples:
```bash
# Share with original name
./skills/icloud-sharing/share-file.sh ~/Desktop/report.pdf

# Share with custom name
./skills/icloud-sharing/share-file.sh /tmp/data.csv 2026-02-01-analytics.csv
```

### list-shared.sh

List files in the Brokkr-Shared folder.

```bash
./skills/icloud-sharing/list-shared.sh
```

### get-shared.sh

Retrieve a file from the shared folder.

```bash
./skills/icloud-sharing/get-shared.sh <filename> [destination-path]
```

Examples:
```bash
# Retrieve to current directory
./skills/icloud-sharing/get-shared.sh report.pdf

# Retrieve to specific location
./skills/icloud-sharing/get-shared.sh data.csv /tmp/downloaded-data.csv
```

### sync-status.sh

Check iCloud sync status for a file.

```bash
./skills/icloud-sharing/sync-status.sh <file-path>
```

## JavaScript Integration

```javascript
import { shareFile, listSharedFiles, getSharedFile, checkSyncStatus } from '../lib/icloud-sharing.js';

// Share a file
const result = await shareFile('/tmp/report.pdf', '2026-02-01-report.pdf');
if (result.success) {
  console.log(`Shared: ${result.filename} at ${result.path}`);
}

// List shared files
const files = await listSharedFiles();
files.forEach(f => {
  console.log(`${f.name} - ${f.size} bytes - ${f.modifiedAt}`);
});

// Retrieve a file
const retrieved = await getSharedFile('report.pdf', '/tmp/local-report.pdf');
if (retrieved.success) {
  console.log(`Retrieved to: ${retrieved.path}`);
}

// Check sync status
const status = await checkSyncStatus('/path/to/file.pdf');
console.log(`Sync status: ${status.status}`);
```

## Commands (Future)

Once integrated with command registry:

| Command | Description |
|---------|-------------|
| `/share <file>` | Share file to iCloud |
| `/shared` | List shared files |
| `/shared get <file>` | Retrieve shared file |

## Sync Status Values

- **Current** - File is fully downloaded and synced
- **Downloading** - File is currently downloading from iCloud
- **NotDownloaded** - File is in iCloud but not downloaded locally (evicted)
- **Unknown** - Unable to determine status

## Use Cases

1. **Share Reports** - Daily summaries, analytics exports
2. **Share Screenshots** - Visual documentation, debugging aids
3. **Share Downloads** - Files retrieved from web for Tommy
4. **Receive Files** - Tommy shares files for Brokkr to process

## Limitations

1. **Sync Delays** - iCloud sync is not instant, may take seconds to minutes
2. **Large Files** - Files >100MB may take considerable time to sync
3. **Network Required** - Both devices must have internet for sync
4. **Shared Folder Setup** - Folder must be explicitly shared via iCloud Drive sharing

## Setup Requirements

### 1. Create Brokkr-Shared Folder

On Tommy's Mac:
1. Open Finder → iCloud Drive
2. Create folder named "Brokkr-Shared"
3. Right-click → Share → Add People
4. Share with Brokkr's iCloud account (brokkrassist@icloud.com)

On Brokkr's Mac:
1. Accept share invitation via iCloud notification
2. Folder will appear in iCloud Drive

### 2. Verify Access

```bash
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/Brokkr-Shared/
```

Should show the shared folder with appropriate permissions.

### 3. Test Sharing

```bash
echo "Test" > /tmp/test.txt
./skills/icloud-sharing/share-file.sh /tmp/test.txt test-share.txt
./skills/icloud-sharing/list-shared.sh
```

## Troubleshooting

### Folder not found

Ensure iCloud Drive is enabled and syncing:
```bash
# Check iCloud status
brctl monitor com.apple.CloudDocs

# Verify folder exists
ls ~/Library/Mobile\ Documents/com~apple~CloudDocs/
```

### Files not syncing

1. Check internet connection
2. Verify iCloud account is signed in: System Settings → Apple ID
3. Check iCloud Drive storage space
4. Use `brctl diagnose` to generate diagnostics

### Permission denied

Ensure the Brokkr-Shared folder is properly shared between accounts with read/write permissions.

## Official Documentation

- [Use iCloud to share and collaborate on files and folders - Apple Support](https://support.apple.com/guide/mac-help/share-and-collaborate-on-files-and-folders-mchl91854a7a/mac)
- [How iCloud Drive works in macOS Sonoma](https://eclecticlight.co/2024/03/18/how-icloud-drive-works-in-macos-sonoma/)
- [brctl command reference](https://man.ilayk.com/man/brctl/)
```

### Step 2: Commit

```bash
git add skills/icloud-sharing/skill.md
git commit -m "docs(icloud): add skill documentation"
```

---

## Task 7: Command Registration

**Files:**
- Modify: `lib/command-registry.js`

### Step 1: Add commands to registry

Add to command-registry.js:

```javascript
{
  name: 'share',
  aliases: [],
  description: 'Share a file to iCloud Drive',
  handler: {
    type: 'skill',
    skill: 'icloud-sharing',
    action: 'share'
  }
},
{
  name: 'shared',
  aliases: [],
  description: 'List or retrieve shared iCloud files',
  handler: {
    type: 'skill',
    skill: 'icloud-sharing',
    action: 'list'
  }
}
```

### Step 2: Commit

```bash
git add lib/command-registry.js
git commit -m "feat(commands): register iCloud sharing commands"
```

---

## Task 8: Integration Testing

**Files:**
- Create: `scripts/test-icloud-sharing.sh`

### Step 1: Create test script

```bash
#!/bin/bash
# scripts/test-icloud-sharing.sh
# Integration test for iCloud sharing skill

set -euo pipefail

echo "=== iCloud Sharing Integration Test ==="
echo ""

SKILL_DIR="skills/icloud-sharing"
TEST_FILE="/tmp/icloud-test-$(date +%s).txt"

# Create test file
echo "Test content - $(date)" > "$TEST_FILE"
echo "Created test file: $TEST_FILE"
echo ""

# Test 1: Share file
echo "--- Test 1: Share File ---"
./"$SKILL_DIR/share-file.sh" "$TEST_FILE"
echo ""

# Test 2: List shared files
echo "--- Test 2: List Shared Files ---"
./"$SKILL_DIR/list-shared.sh"
echo ""

# Test 3: Check sync status
echo "--- Test 3: Check Sync Status ---"
SHARED_FILE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Brokkr-Shared/$(basename "$TEST_FILE")"
./"$SKILL_DIR/sync-status.sh" "$SHARED_FILE"
echo ""

# Test 4: Retrieve file
echo "--- Test 4: Retrieve File ---"
RETRIEVED_FILE="/tmp/retrieved-$(date +%s).txt"
./"$SKILL_DIR/get-shared.sh" "$(basename "$TEST_FILE")" "$RETRIEVED_FILE"
echo ""

# Verify contents match
if diff "$TEST_FILE" "$RETRIEVED_FILE" > /dev/null; then
    echo "✓ Retrieved file matches original"
else
    echo "✗ Retrieved file differs from original"
    exit 1
fi

# Cleanup
rm -f "$TEST_FILE" "$RETRIEVED_FILE" "$SHARED_FILE"
echo ""
echo "=== All Tests Passed ==="
```

### Step 2: Make executable

```bash
chmod +x scripts/test-icloud-sharing.sh
```

### Step 3: Run test

```bash
./scripts/test-icloud-sharing.sh
```

### Step 4: Commit

```bash
git add scripts/test-icloud-sharing.sh
git commit -m "test(icloud): add integration test script"
```

---

## Task 9: CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update documentation

Add to the "Capabilities" section:

```markdown
### iCloud Drive File Sharing

- **Share files**: Copy files to shared iCloud Drive folder
- **List shared**: View files in Brokkr-Shared folder
- **Retrieve files**: Download shared files from Tommy
- **Check sync**: Monitor iCloud sync status

See `skills/icloud-sharing/skill.md` for details.
```

Add to "Files" section:

```markdown
- `skills/icloud-sharing/` - iCloud Drive sharing utilities
- `lib/icloud-sharing.js` - Sharing integration module
```

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: add iCloud sharing to CLAUDE.md"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `share-file.sh`, tests | Share file to iCloud |
| 2 | `sync-status.sh` | Check iCloud sync status |
| 3 | `list-shared.sh` | List shared files |
| 4 | `get-shared.sh` | Retrieve shared file |
| 5 | `lib/icloud-sharing.js` | Integration module |
| 6 | `skill.md` | Documentation |
| 7 | `command-registry.js` | Command registration |
| 8 | `test-icloud-sharing.sh` | Integration tests |
| 9 | `CLAUDE.md` | System documentation |

## Post-Implementation Notes

### Testing with Real iCloud Account

Before full deployment, verify:
1. Brokkr-Shared folder is properly shared between accounts
2. Files sync bidirectionally
3. Sync status reporting works correctly
4. Large files (>10MB) sync successfully

### Performance Considerations

- Sync delays are unavoidable with iCloud
- Use `brctl monitor` for real-time sync tracking
- Consider polling sync status for critical files
- Large files may require extended wait times

### Future Enhancements

1. **Automatic Notifications** - Send iMessage when important files are shared
2. **Sync Polling** - Wait for sync completion before confirming
3. **File Categories** - Organize shared folder into subdirectories (reports/, screenshots/, downloads/)
4. **Cleanup Automation** - Archive or delete old shared files
5. **Metadata Tagging** - Add tags to shared files for categorization
