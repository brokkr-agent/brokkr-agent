# Finder & System Integration Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks
>
> **Architecture Reference:** See `docs/concepts/2026-02-01-apple-integration-architecture.md` for standardized patterns.

**Goal:** Enable Brokkr to perform advanced file operations (move, copy, rename), search via Spotlight, manage clipboard, and attach folder action automation scripts.

**Architecture:** Hybrid approach using AppleScript for Finder operations (preserves metadata), shell commands for Spotlight search (mdfind/mdls), and both AppleScript and shell for clipboard. Folder actions attached via System Events AppleScript. All operations exposed through Node.js integration module.

**Tech Stack:** AppleScript, osascript, bash, mdfind/mdls, pbcopy/pbpaste, System Events, Node.js

---

## Skill Directory Structure

```
skills/finder/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── finder.js               # Core functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   ├── finder-dictionary.md
│   └── spotlight-attributes.md
├── scripts/                    # Reusable automation scripts
│   ├── file-operations.scpt
│   ├── spotlight-search.sh
│   ├── file-metadata.sh
│   ├── clipboard.scpt
│   ├── clipboard.sh
│   ├── attach-folder-action.scpt
│   └── folder-action-template.scpt
└── tests/
    ├── finder-operations.test.js
    └── finder-system-integration.test.js
```

## Command File

Create `.claude/commands/finder.md`:

```yaml
---
name: finder
description: File operations, Spotlight search, clipboard management
argument-hint: [action] [path] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Finder skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## iCloud Storage Integration

Use `lib/icloud-storage.js` for file exports and organized storage:

```javascript
const { getPath, ensureDirectory } = require('../../lib/icloud-storage');

// Move file to iCloud organized storage
const exportPath = getPath('exports', filename);

// Save clipboard content to iCloud
const clipboardPath = getPath('exports', `clipboard-${Date.now()}.txt`);
```

## Notification Processing Criteria

| Event | Queue If | Drop If |
|-------|----------|---------|
| File added to watched folder | Matches monitored file types | System/temp files |
| File modified in project | Part of active project | Binary/build files |
| Folder action triggered | Custom action script attached | Routine Finder operations |

## SKILL.md Standard Header

```yaml
---
name: finder
description: Finder file operations, Spotlight search, clipboard management, folder actions. Preserves metadata.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Finder Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- File operations (move, copy, rename, delete) preserving metadata
- Spotlight search with metadata queries
- Clipboard get/set operations
- Folder action attachment and management
- File metadata inspection

## Usage

### Via Command (Manual)
```
/finder search "meeting notes"
/finder move /path/to/file /destination
/finder clipboard get
```

### Via Notification (Automatic)
Triggered by folder actions when files added to monitored folders.

## Reference Documentation

See `reference/` directory for detailed docs.
```

---

## CRITICAL: Research Findings (2026-02-01)

### Finder AppleScript Dictionary

The Finder application provides comprehensive scripting support for file operations through its AppleScript dictionary.

**Key Classes:**
- `file` - Represents a file on disk
- `folder` - Represents a directory
- `item` - Generic class for files, folders, and other Finder items
- `disk` - Represents mounted volumes
- `alias` - Persistent reference to file/folder

**Key Commands:**
- `duplicate` - Copy files/folders
- `move` - Move files/folders
- `delete` - Move to Trash
- `make new folder` - Create directories
- `reveal` - Show item in Finder window
- `set name of` - Rename items

**Important Properties:**
- `name` - Item name
- `creation date`, `modification date` - Timestamps
- `size` - File size
- `comment` - Finder comment
- `label index` - Color label

### Why Finder vs Shell Commands

**Finder AppleScript advantages:**
- Preserves Finder comments (lost with `cp`/`mv`)
- Preserves color labels
- Preserves tags reliably
- Handles alias resolution automatically
- Provides recordable actions (Script Editor can record Finder operations)

**Shell command advantages:**
- Faster for bulk operations
- Works without GUI
- Better error messages
- Easier permission handling

### Spotlight Search (mdfind/mdls)

macOS provides command-line tools for Spotlight search and metadata inspection.

**mdfind** - Search Spotlight index:
```bash
# Search file contents
mdfind "meeting notes"

# Search in specific folder
mdfind -onlyin ~/Documents "invoice"

# Search by file type
mdfind "kMDItemKind == 'PDF'"

# Search by date
mdfind "kMDItemContentModificationDate > \$time.today(-7)"

# Live updates
mdfind -live "keyword"

# Count results
mdfind -count "query"

# Natural language (interpret flag)
mdfind -interpret "documents from yesterday"
```

**mdls** - List metadata attributes:
```bash
# Show all metadata for file
mdls /path/to/file.pdf

# Show specific attributes
mdls -name kMDItemFSSize -name kMDItemContentCreationDate file.pdf

# Raw output (no attribute names)
mdls -raw -name kMDItemFSSize file.pdf
```

**mdimport** - Force Spotlight reindex:
```bash
# Reimport file
mdimport /path/to/file

# Show schema
mdimport -X
```

**Common Metadata Attributes (kMDItem\*):**
- `kMDItemFSSize` - File size in bytes
- `kMDItemContentCreationDate` - Creation date
- `kMDItemContentModificationDate` - Modification date
- `kMDItemKind` - File type (e.g., "PDF Document")
- `kMDItemDisplayName` - Display name
- `kMDItemContentType` - UTI type (e.g., com.adobe.pdf)
- `kMDItemAuthors` - Document authors
- `kMDItemTitle` - Document title
- `kMDItemKeywords` - Keywords/tags

Full list: ~142 documented kMDItem constants

### Clipboard Management

**AppleScript approach:**
```applescript
-- Get clipboard
set clipContent to the clipboard

-- Set clipboard to text
set the clipboard to "New content"

-- Set clipboard to file reference
set the clipboard to POSIX file "/path/to/file"
```

**Shell approach (pbcopy/pbpaste):**
```bash
# Copy to clipboard
echo "Hello" | pbcopy
cat file.txt | pbcopy

# Paste from clipboard
pbpaste
pbpaste > output.txt

# Strip formatting
pbpaste | pbcopy
```

**Integration:**
AppleScript can execute shell commands:
```applescript
do shell script "pbpaste | tr '\\r' '\\n' | pbcopy"
```

### Folder Actions

macOS Folder Actions allow AppleScript scripts to respond to folder events.

**Event Handlers:**
- `adding folder items to` - Triggered when items added to folder
- `removing folder items from` - Triggered when items removed
- `opening folder` - Triggered when folder opened
- `closing folder window for` - Triggered when folder window closed
- `moving folder window for` - Triggered when folder window moved

**Attaching Scripts:**
1. Via Folder Actions Setup app (GUI)
2. Via System Events AppleScript:

```applescript
tell application "System Events"
    tell folder actions
        if not (exists folder action "target_folder") then
            make new folder action at end with properties {name:"target_folder", path:"/path/to/folder"}
        end if

        tell folder action "target_folder"
            if not (exists script "script_name") then
                make new script at end with properties {name:"script_name", path:"/path/to/script.scpt"}
            end if
        end tell
    end tell
end tell
```

**Storage Locations:**
- System-wide: `/Library/Scripts/Folder Action Scripts/`
- User-specific: `~/Library/Scripts/Folder Action Scripts/`

### System Events File Operations

System Events provides alternative file operations without GUI overhead.

**Advantages over Finder:**
- No visual updates (faster for batch operations)
- Background execution
- No window flashing

**Example:**
```applescript
tell application "System Events"
    tell disk item "/path/to/file"
        set name to "new_name.txt"
    end tell
end tell
```

### Official Documentation Sources

- [Mac Automation Scripting Guide: Navigating a Scripting Dictionary](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/NavigateaScriptingDictionary.html)
- [Referencing Files and Folders in AppleScript](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/ReferenceFilesandFolders.html)
- [AppleScript Finder Guide PDF](https://applescriptlibrary.wordpress.com/wp-content/uploads/2013/11/applescript-finder-guide.pdf)
- [mdfind Man Page - SS64.com](https://ss64.com/mac/mdfind.html)
- [Spotlight Metadata Attributes - Apple Developer](https://developer.apple.com/library/archive/documentation/CoreServices/Reference/MetadataAttributesRef/Reference/CommonAttrs.html)
- [File Metadata Query Expression Syntax](https://developer.apple.com/library/archive/documentation/Carbon/Conceptual/SpotlightQuery/Concepts/QueryFormat.html)
- [pbcopy & pbpaste: Manipulating the Clipboard from the Command Line](https://osxdaily.com/2007/03/05/manipulating-the-clipboard-from-the-command-line/)
- [Mac Automation Scripting Guide: Watching Folders](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/WatchFolders.html)
- [Folder Actions Reference](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/reference/ASLR_folder_actions.html)

---

## Design Decisions

### Hybrid Approach: Finder + Shell

**Use Finder AppleScript for:**
- File/folder rename (preserves metadata)
- Copy operations that need to preserve comments/tags
- Reveal in Finder
- Creating folders with specific properties

**Use Shell commands for:**
- Spotlight search (mdfind - no AppleScript equivalent)
- Metadata inspection (mdls)
- Clipboard operations (pbcopy/pbpaste - simpler than AppleScript)
- Bulk file listing

### Error Handling Strategy

AppleScript errors must be caught and converted to JavaScript exceptions:
```javascript
try {
  const result = await execAsync(`osascript -e '...'`);
} catch (err) {
  return { success: false, error: err.message };
}
```

### Path Handling

AppleScript uses HFS paths (`Macintosh HD:Users:...`) while shell uses POSIX paths (`/Users/...`). Use conversion:
```applescript
set posixPath to POSIX path of "Macintosh HD:file.txt"
set hfsPath to POSIX file "/path/to/file" as text
```

For JavaScript integration, always use POSIX paths as input/output.

### Finder Operations Pattern

Consistent pattern for all Finder operations:
1. Validate input paths (file exists, etc.)
2. Convert POSIX → alias if needed
3. Execute Finder command in try/catch
4. Return structured result: `{success: boolean, result?: any, error?: string}`

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | AppleScript: File Operations | `skills/finder/file-operations.scpt`, tests |
| 2 | Shell Utility: Spotlight Search | `skills/finder/spotlight-search.sh`, tests |
| 3 | Shell Utility: Metadata Query | `skills/finder/file-metadata.sh` |
| 4 | Clipboard Integration | `skills/finder/clipboard.scpt`, `skills/finder/clipboard.sh` |
| 5 | Folder Actions | `skills/finder/attach-folder-action.scpt` |
| 6 | Integration Module | `lib/finder-system.js`, tests |
| 7 | Skill Documentation | `skills/finder/skill.md` |
| 8 | Command Registration | `lib/command-registry.js` |
| 9 | CLAUDE.md Documentation | `CLAUDE.md` |

---

## Task 1: AppleScript: File Operations

**Files:**
- Create: `skills/finder/file-operations.scpt`
- Create: `tests/finder-operations.test.js`

### Step 1: Write failing test

```javascript
// tests/finder-operations.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const SKILL_DIR = join(process.cwd(), 'skills/finder');
const TEST_DIR = '/tmp/finder-test';

describe('Finder File Operations', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Rename', () => {
    it('should rename a file', () => {
      const testFile = join(TEST_DIR, 'original.txt');
      writeFileSync(testFile, 'test content');

      const result = execSync(
        `osascript "${SKILL_DIR}/file-operations.scpt" rename "${testFile}" "renamed.txt"`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('success');

      const renamedFile = join(TEST_DIR, 'renamed.txt');
      expect(existsSync(renamedFile)).toBe(true);
      expect(existsSync(testFile)).toBe(false);
    });
  });

  describe('Copy', () => {
    it('should copy a file', () => {
      const sourceFile = join(TEST_DIR, 'source.txt');
      writeFileSync(sourceFile, 'source content');

      const destDir = join(TEST_DIR, 'destination');
      mkdirSync(destDir);

      const result = execSync(
        `osascript "${SKILL_DIR}/file-operations.scpt" copy "${sourceFile}" "${destDir}"`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('success');

      const copiedFile = join(destDir, 'source.txt');
      expect(existsSync(copiedFile)).toBe(true);
      expect(existsSync(sourceFile)).toBe(true); // Original still exists
    });
  });

  describe('Move', () => {
    it('should move a file', () => {
      const sourceFile = join(TEST_DIR, 'move-me.txt');
      writeFileSync(sourceFile, 'move content');

      const destDir = join(TEST_DIR, 'moved');
      mkdirSync(destDir);

      const result = execSync(
        `osascript "${SKILL_DIR}/file-operations.scpt" move "${sourceFile}" "${destDir}"`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('success');

      const movedFile = join(destDir, 'move-me.txt');
      expect(existsSync(movedFile)).toBe(true);
      expect(existsSync(sourceFile)).toBe(false);
    });
  });

  describe('Create Folder', () => {
    it('should create a new folder', () => {
      const newFolder = join(TEST_DIR, 'new-folder');

      const result = execSync(
        `osascript "${SKILL_DIR}/file-operations.scpt" create_folder "${newFolder}"`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('success');
      expect(existsSync(newFolder)).toBe(true);
    });
  });
});
```

### Step 2: Run test to verify failure

Run: `npm test -- tests/finder-operations.test.js`
Expected: FAIL (script not found)

### Step 3: Create skill directory

```bash
mkdir -p skills/finder
```

### Step 4: Write AppleScript implementation

```applescript
-- skills/finder/file-operations.scpt
-- Finder file operations: rename, copy, move, create folder, delete

on run argv
    if (count of argv) < 1 then
        return "Error: No operation specified. Usage: osascript file-operations.scpt <operation> [args...]"
    end if

    set operation to item 1 of argv

    if operation is "rename" then
        if (count of argv) < 3 then
            return "Error: Usage: rename <file-path> <new-name>"
        end if
        return renameFile(item 2 of argv, item 3 of argv)

    else if operation is "copy" then
        if (count of argv) < 3 then
            return "Error: Usage: copy <source-path> <destination-path>"
        end if
        return copyFile(item 2 of argv, item 3 of argv)

    else if operation is "move" then
        if (count of argv) < 3 then
            return "Error: Usage: move <source-path> <destination-path>"
        end if
        return moveFile(item 2 of argv, item 3 of argv)

    else if operation is "create_folder" then
        if (count of argv) < 2 then
            return "Error: Usage: create_folder <folder-path>"
        end if
        return createFolder(item 2 of argv)

    else if operation is "delete" then
        if (count of argv) < 2 then
            return "Error: Usage: delete <file-path>"
        end if
        return deleteFile(item 2 of argv)

    else if operation is "reveal" then
        if (count of argv) < 2 then
            return "Error: Usage: reveal <file-path>"
        end if
        return revealFile(item 2 of argv)

    else
        return "Error: Unknown operation: " & operation
    end if
end run

-- Rename a file or folder
on renameFile(filePath, newName)
    try
        set fileAlias to POSIX file filePath as alias
        tell application "Finder"
            set name of fileAlias to newName
        end tell
        return "success: Renamed to " & newName
    on error errMsg
        return "error: " & errMsg
    end try
end renameFile

-- Copy a file or folder
on copyFile(sourcePath, destPath)
    try
        set sourceAlias to POSIX file sourcePath as alias
        set destFolder to POSIX file destPath as alias

        tell application "Finder"
            set copiedItem to duplicate sourceAlias to destFolder
            set copiedName to name of copiedItem
        end tell

        return "success: Copied to " & destPath
    on error errMsg
        return "error: " & errMsg
    end try
end copyFile

-- Move a file or folder
on moveFile(sourcePath, destPath)
    try
        set sourceAlias to POSIX file sourcePath as alias
        set destFolder to POSIX file destPath as alias

        tell application "Finder"
            move sourceAlias to destFolder
        end tell

        return "success: Moved to " & destPath
    on error errMsg
        return "error: " & errMsg
    end try
end moveFile

-- Create a new folder
on createFolder(folderPath)
    try
        -- Extract parent folder and new folder name
        set posixPath to folderPath
        set parentPath to do shell script "dirname " & quoted form of posixPath
        set folderName to do shell script "basename " & quoted form of posixPath

        set parentAlias to POSIX file parentPath as alias

        tell application "Finder"
            make new folder at parentAlias with properties {name:folderName}
        end tell

        return "success: Created folder " & folderName
    on error errMsg
        return "error: " & errMsg
    end try
end createFolder

-- Delete a file or folder (moves to Trash)
on deleteFile(filePath)
    try
        set fileAlias to POSIX file filePath as alias

        tell application "Finder"
            delete fileAlias
        end tell

        return "success: Moved to Trash"
    on error errMsg
        return "error: " & errMsg
    end try
end deleteFile

-- Reveal a file in Finder
on revealFile(filePath)
    try
        set fileAlias to POSIX file filePath as alias

        tell application "Finder"
            reveal fileAlias
            activate
        end tell

        return "success: Revealed in Finder"
    on error errMsg
        return "error: " & errMsg
    end try
end revealFile
```

### Step 5: Compile AppleScript

```bash
osacompile -o skills/finder/file-operations.scpt skills/finder/file-operations.applescript
# Or save directly as .scpt from Script Editor
```

Note: For testing, you can use the text version and run with `osascript`.

### Step 6: Run test to verify passes

Run: `npm test -- tests/finder-operations.test.js`
Expected: PASS

### Step 7: Commit

```bash
git add skills/finder/file-operations.scpt tests/finder-operations.test.js
git commit -m "feat(finder): add file operations AppleScript"
```

---

## Task 2: Shell Utility: Spotlight Search

**Files:**
- Create: `skills/finder/spotlight-search.sh`

### Step 1: Extend test suite

```javascript
describe('Spotlight Search', () => {
  const SEARCH_SCRIPT = join(SKILL_DIR, 'spotlight-search.sh');

  it('should have executable search script', () => {
    expect(existsSync(SEARCH_SCRIPT)).toBe(true);
  });

  it('should search for files by name', () => {
    // Create test file
    const testFile = join(TEST_DIR, 'spotlight-test-unique-name.txt');
    writeFileSync(testFile, 'Searchable content');

    // Wait briefly for Spotlight to index
    execSync('sleep 2');

    try {
      const result = execSync(
        `"${SEARCH_SCRIPT}" "spotlight-test-unique-name"`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('spotlight-test-unique-name.txt');
    } finally {
      unlinkSync(testFile);
    }
  });

  it('should limit search to specific directory', () => {
    const result = execSync(
      `"${SEARCH_SCRIPT}" -d "${TEST_DIR}" "test"`,
      { encoding: 'utf-8' }
    );

    // Should only show results from TEST_DIR
    expect(result).toContain(TEST_DIR);
  });
});
```

### Step 2: Write implementation

```bash
#!/bin/bash
# skills/finder/spotlight-search.sh
# Search files using Spotlight (mdfind)

set -euo pipefail

usage() {
    echo "Usage: $0 [options] <query>"
    echo ""
    echo "Search files using Spotlight index"
    echo ""
    echo "Options:"
    echo "  -d DIR    Limit search to directory (onlyin)"
    echo "  -c        Count results only"
    echo "  -l        Live updates"
    echo "  -i        Interpret as natural language"
    echo ""
    echo "Examples:"
    echo "  $0 'meeting notes'"
    echo "  $0 -d ~/Documents 'invoice'"
    echo "  $0 'kMDItemKind == \"PDF\"'"
    echo "  $0 -c 'kMDItemContentModificationDate > \$time.today(-7)'"
    exit 1
}

# Parse options
ONLYIN=""
COUNT_ONLY=false
LIVE=false
INTERPRET=false

while getopts "d:cli" opt; do
    case $opt in
        d) ONLYIN="$OPTARG" ;;
        c) COUNT_ONLY=true ;;
        l) LIVE=true ;;
        i) INTERPRET=true ;;
        *) usage ;;
    esac
done

shift $((OPTIND-1))

if [ $# -lt 1 ]; then
    usage
fi

QUERY="$1"

# Build mdfind command
CMD="mdfind"

if [ "$COUNT_ONLY" = true ]; then
    CMD="$CMD -count"
fi

if [ "$LIVE" = true ]; then
    CMD="$CMD -live"
fi

if [ "$INTERPRET" = true ]; then
    CMD="$CMD -interpret"
fi

if [ -n "$ONLYIN" ]; then
    CMD="$CMD -onlyin \"$ONLYIN\""
fi

CMD="$CMD \"$QUERY\""

# Execute search
eval $CMD
```

### Step 3: Make executable and test

```bash
chmod +x skills/finder/spotlight-search.sh
npm test -- tests/finder-operations.test.js
```

### Step 4: Commit

```bash
git add skills/finder/spotlight-search.sh tests/finder-operations.test.js
git commit -m "feat(finder): add Spotlight search utility"
```

---

## Task 3: Shell Utility: Metadata Query

**Files:**
- Create: `skills/finder/file-metadata.sh`

### Step 1: Write implementation

```bash
#!/bin/bash
# skills/finder/file-metadata.sh
# Query file metadata using mdls

set -euo pipefail

usage() {
    echo "Usage: $0 [options] <file-path>"
    echo ""
    echo "Query file metadata using Spotlight metadata store"
    echo ""
    echo "Options:"
    echo "  -a ATTR   Show specific attribute (can be repeated)"
    echo "  -r        Raw output (no attribute names)"
    echo ""
    echo "Examples:"
    echo "  $0 file.pdf"
    echo "  $0 -a kMDItemFSSize file.pdf"
    echo "  $0 -a kMDItemFSSize -a kMDItemContentCreationDate file.pdf"
    echo "  $0 -r -a kMDItemFSSize file.pdf"
    exit 1
}

ATTRIBUTES=()
RAW=false

while getopts "a:r" opt; do
    case $opt in
        a) ATTRIBUTES+=("$OPTARG") ;;
        r) RAW=true ;;
        *) usage ;;
    esac
done

shift $((OPTIND-1))

if [ $# -lt 1 ]; then
    usage
fi

FILE_PATH="$1"

if [ ! -e "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH" >&2
    exit 1
fi

# Build mdls command
CMD="mdls"

if [ "$RAW" = true ]; then
    CMD="$CMD -raw"
fi

if [ ${#ATTRIBUTES[@]} -gt 0 ]; then
    for attr in "${ATTRIBUTES[@]}"; do
        CMD="$CMD -name $attr"
    done
fi

CMD="$CMD \"$FILE_PATH\""

# Execute
eval $CMD
```

### Step 2: Make executable

```bash
chmod +x skills/finder/file-metadata.sh
```

### Step 3: Commit

```bash
git add skills/finder/file-metadata.sh
git commit -m "feat(finder): add metadata query utility"
```

---

## Task 4: Clipboard Integration

**Files:**
- Create: `skills/finder/clipboard.scpt`
- Create: `skills/finder/clipboard.sh`

### Step 1: Write AppleScript version

```applescript
-- skills/finder/clipboard.scpt
-- Clipboard operations using AppleScript

on run argv
    if (count of argv) < 1 then
        -- Default: get clipboard
        return getClipboard()
    end if

    set operation to item 1 of argv

    if operation is "get" then
        return getClipboard()

    else if operation is "set" then
        if (count of argv) < 2 then
            return "Error: Usage: set <text>"
        end if
        return setClipboard(item 2 of argv)

    else if operation is "clear" then
        return clearClipboard()

    else
        return "Error: Unknown operation: " & operation
    end if
end run

on getClipboard()
    try
        set clipContent to the clipboard as text
        return clipContent
    on error
        return ""
    end try
end getClipboard

on setClipboard(newContent)
    try
        set the clipboard to newContent
        return "success: Clipboard set"
    on error errMsg
        return "error: " & errMsg
    end try
end setClipboard

on clearClipboard()
    try
        set the clipboard to ""
        return "success: Clipboard cleared"
    on error errMsg
        return "error: " & errMsg
    end try
end clearClipboard
```

### Step 2: Write shell version

```bash
#!/bin/bash
# skills/finder/clipboard.sh
# Clipboard operations using pbcopy/pbpaste

set -euo pipefail

usage() {
    echo "Usage: $0 <operation> [args]"
    echo ""
    echo "Operations:"
    echo "  get              Get clipboard contents"
    echo "  set <text>       Set clipboard contents"
    echo "  clear            Clear clipboard"
    echo "  from-file <path> Copy file contents to clipboard"
    echo "  to-file <path>   Save clipboard to file"
    echo ""
    echo "Examples:"
    echo "  $0 get"
    echo "  $0 set 'Hello World'"
    echo "  $0 from-file /path/to/file.txt"
    echo "  $0 to-file /tmp/clipboard.txt"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

OPERATION="$1"

case "$OPERATION" in
    get)
        pbpaste
        ;;

    set)
        if [ $# -lt 2 ]; then
            echo "Error: Missing text argument" >&2
            usage
        fi
        echo -n "$2" | pbcopy
        echo "Clipboard set"
        ;;

    clear)
        echo -n "" | pbcopy
        echo "Clipboard cleared"
        ;;

    from-file)
        if [ $# -lt 2 ]; then
            echo "Error: Missing file path" >&2
            usage
        fi
        FILE_PATH="$2"
        if [ ! -f "$FILE_PATH" ]; then
            echo "Error: File not found: $FILE_PATH" >&2
            exit 1
        fi
        cat "$FILE_PATH" | pbcopy
        echo "Copied $(wc -c < "$FILE_PATH") bytes from $FILE_PATH to clipboard"
        ;;

    to-file)
        if [ $# -lt 2 ]; then
            echo "Error: Missing file path" >&2
            usage
        fi
        FILE_PATH="$2"
        pbpaste > "$FILE_PATH"
        echo "Saved clipboard to $FILE_PATH ($(wc -c < "$FILE_PATH") bytes)"
        ;;

    *)
        echo "Error: Unknown operation: $OPERATION" >&2
        usage
        ;;
esac
```

### Step 3: Make executable

```bash
chmod +x skills/finder/clipboard.sh
```

### Step 4: Commit

```bash
git add skills/finder/clipboard.scpt skills/finder/clipboard.sh
git commit -m "feat(finder): add clipboard management utilities"
```

---

## Task 5: Folder Actions

**Files:**
- Create: `skills/finder/attach-folder-action.scpt`
- Create: `skills/finder/folder-action-template.scpt`

### Step 1: Write folder action attach script

```applescript
-- skills/finder/attach-folder-action.scpt
-- Attach a folder action script to a folder

on run argv
    if (count of argv) < 2 then
        return "Error: Usage: attach-folder-action.scpt <folder-path> <script-path>"
    end if

    set folderPath to item 1 of argv
    set scriptPath to item 2 of argv

    try
        set folderAlias to POSIX file folderPath as alias
        set scriptAlias to POSIX file scriptPath as alias

        tell application "System Events"
            -- Enable folder actions if not enabled
            set folder actions enabled to true

            tell folder actions
                -- Check if folder action already exists
                if not (exists folder action folderPath) then
                    make new folder action at end with properties {name:folderPath, path:folderPath}
                end if

                tell folder action folderPath
                    -- Check if script already attached
                    set scriptName to name of scriptAlias as text
                    if not (exists script scriptName) then
                        make new script at end with properties {name:scriptName, path:scriptPath}
                    end if

                    -- Enable the folder action
                    set enabled to true
                end tell
            end tell
        end tell

        return "success: Attached " & scriptPath & " to " & folderPath
    on error errMsg
        return "error: " & errMsg
    end try
end run
```

### Step 2: Write template folder action script

```applescript
-- skills/finder/folder-action-template.scpt
-- Template for folder action scripts
-- Copy and customize for specific automation tasks

on adding folder items to thisFolder after receiving addedItems
    -- This handler is called when items are added to the folder

    tell application "Finder"
        set folderName to name of thisFolder
    end tell

    repeat with anItem in addedItems
        tell application "Finder"
            set itemName to name of anItem
            set itemPath to POSIX path of (anItem as alias)
        end tell

        -- Log the event (customize this)
        do shell script "echo '[Folder Action] File added: " & itemPath & "' >> /tmp/folder-actions.log"

        -- Example: Process .txt files
        if itemName ends with ".txt" then
            -- Do something with text files
            -- e.g., move to subfolder, process content, etc.
        end if
    end repeat
end adding folder items to

on removing folder items from thisFolder after losing removedItems
    -- This handler is called when items are removed from the folder

    repeat with anItem in removedItems
        -- Note: removedItems are aliases that may no longer exist
        try
            tell application "Finder"
                set itemName to name of anItem
            end tell
            do shell script "echo '[Folder Action] File removed: " & itemName & "' >> /tmp/folder-actions.log"
        end try
    end repeat
end removing folder items from

on opening folder thisFolder
    -- Called when folder is opened in Finder
    tell application "Finder"
        set folderName to name of thisFolder
    end tell
    do shell script "echo '[Folder Action] Folder opened: " & folderName & "' >> /tmp/folder-actions.log"
end opening folder

on closing folder window for thisFolder
    -- Called when folder window is closed
    tell application "Finder"
        set folderName to name of thisFolder
    end tell
    do shell script "echo '[Folder Action] Folder closed: " & folderName & "' >> /tmp/folder-actions.log"
end closing folder window for
```

### Step 3: Commit

```bash
git add skills/finder/attach-folder-action.scpt skills/finder/folder-action-template.scpt
git commit -m "feat(finder): add folder action utilities"
```

---

## Task 6: Integration Module

**Files:**
- Create: `lib/finder-system.js`
- Create: `tests/finder-system-integration.test.js`

### Step 1: Write integration test

```javascript
// tests/finder-system-integration.test.js
import { describe, it, expect } from 'vitest';
import {
  renameFile,
  copyFile,
  moveFile,
  createFolder,
  spotlightSearch,
  getFileMetadata,
  getClipboard,
  setClipboard
} from '../lib/finder-system.js';
import { writeFileSync, unlinkSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = '/tmp/finder-integration-test';

describe('Finder System Integration', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('File Operations', () => {
    it('should rename file', async () => {
      const testFile = join(TEST_DIR, 'original.txt');
      writeFileSync(testFile, 'test');

      const result = await renameFile(testFile, 'renamed.txt');

      expect(result.success).toBe(true);
      expect(existsSync(join(TEST_DIR, 'renamed.txt'))).toBe(true);
    });

    it('should copy file', async () => {
      const sourceFile = join(TEST_DIR, 'source.txt');
      writeFileSync(sourceFile, 'source');

      const destDir = join(TEST_DIR, 'dest');
      mkdirSync(destDir);

      const result = await copyFile(sourceFile, destDir);

      expect(result.success).toBe(true);
      expect(existsSync(join(destDir, 'source.txt'))).toBe(true);
    });
  });

  describe('Spotlight Search', () => {
    it('should search for files', async () => {
      const results = await spotlightSearch('test', { directory: TEST_DIR });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Clipboard', () => {
    it('should get and set clipboard', async () => {
      const testText = 'Test clipboard content ' + Date.now();

      const setResult = await setClipboard(testText);
      expect(setResult.success).toBe(true);

      const getResult = await getClipboard();
      expect(getResult.success).toBe(true);
      expect(getResult.content).toBe(testText);
    });
  });
});
```

### Step 2: Write implementation

```javascript
// lib/finder-system.js
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

const SKILL_DIR = join(process.cwd(), 'skills/finder');
const FILE_OPS_SCRIPT = join(SKILL_DIR, 'file-operations.scpt');
const SPOTLIGHT_SCRIPT = join(SKILL_DIR, 'spotlight-search.sh');
const METADATA_SCRIPT = join(SKILL_DIR, 'file-metadata.sh');
const CLIPBOARD_SCRIPT = join(SKILL_DIR, 'clipboard.sh');

/**
 * Rename a file or folder using Finder
 * @param {string} filePath - Path to file/folder
 * @param {string} newName - New name (not full path, just name)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function renameFile(filePath, newName) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" rename "${filePath}" "${newName}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Copy a file or folder using Finder
 * @param {string} sourcePath - Source file/folder
 * @param {string} destPath - Destination folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function copyFile(sourcePath, destPath) {
  if (!existsSync(sourcePath)) {
    return { success: false, error: `Source not found: ${sourcePath}` };
  }
  if (!existsSync(destPath)) {
    return { success: false, error: `Destination not found: ${destPath}` };
  }

  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" copy "${sourcePath}" "${destPath}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Move a file or folder using Finder
 * @param {string} sourcePath - Source file/folder
 * @param {string} destPath - Destination folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function moveFile(sourcePath, destPath) {
  if (!existsSync(sourcePath)) {
    return { success: false, error: `Source not found: ${sourcePath}` };
  }
  if (!existsSync(destPath)) {
    return { success: false, error: `Destination not found: ${destPath}` };
  }

  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" move "${sourcePath}" "${destPath}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a new folder using Finder
 * @param {string} folderPath - Full path for new folder
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createFolder(folderPath) {
  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" create_folder "${folderPath}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete a file or folder (moves to Trash)
 * @param {string} filePath - Path to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFile(filePath) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" delete "${filePath}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reveal a file in Finder
 * @param {string} filePath - Path to reveal
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function revealFile(filePath) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    const { stdout } = await execAsync(
      `osascript "${FILE_OPS_SCRIPT}" reveal "${filePath}"`
    );

    if (stdout.includes('success')) {
      return { success: true };
    } else {
      return { success: false, error: stdout };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Search for files using Spotlight
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} options.directory - Limit to directory
 * @param {boolean} options.countOnly - Return count only
 * @returns {Promise<Array<string>|number>}
 */
export async function spotlightSearch(query, options = {}) {
  try {
    let cmd = `"${SPOTLIGHT_SCRIPT}"`;

    if (options.directory) {
      cmd += ` -d "${options.directory}"`;
    }
    if (options.countOnly) {
      cmd += ` -c`;
    }

    cmd += ` "${query}"`;

    const { stdout } = await execAsync(cmd);

    if (options.countOnly) {
      return parseInt(stdout.trim(), 10);
    }

    return stdout.trim().split('\n').filter(line => line.length > 0);
  } catch (err) {
    console.error('[Spotlight Search] Error:', err.message);
    return options.countOnly ? 0 : [];
  }
}

/**
 * Get file metadata using mdls
 * @param {string} filePath - File to query
 * @param {Array<string>} attributes - Specific attributes (optional)
 * @returns {Promise<{success: boolean, metadata?: Object, error?: string}>}
 */
export async function getFileMetadata(filePath, attributes = []) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    let cmd = `"${METADATA_SCRIPT}"`;

    for (const attr of attributes) {
      cmd += ` -a ${attr}`;
    }

    cmd += ` "${filePath}"`;

    const { stdout } = await execAsync(cmd);

    // Parse output
    const metadata = {};
    const lines = stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+=\s+(.+)$/);
      if (match) {
        metadata[match[1]] = match[2];
      }
    }

    return { success: true, metadata };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get clipboard contents
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function getClipboard() {
  try {
    const { stdout } = await execAsync(`"${CLIPBOARD_SCRIPT}" get`);
    return { success: true, content: stdout };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Set clipboard contents
 * @param {string} content - Text to set
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setClipboard(content) {
  try {
    await execAsync(`"${CLIPBOARD_SCRIPT}" set "${content.replace(/"/g, '\\"')}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Copy file contents to clipboard
 * @param {string} filePath - File to copy
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function copyFileToClipboard(filePath) {
  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    await execAsync(`"${CLIPBOARD_SCRIPT}" from-file "${filePath}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Save clipboard to file
 * @param {string} filePath - Destination file
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveClipboardToFile(filePath) {
  try {
    await execAsync(`"${CLIPBOARD_SCRIPT}" to-file "${filePath}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
```

### Step 3: Test

Run: `npm test -- tests/finder-system-integration.test.js`

### Step 4: Commit

```bash
git add lib/finder-system.js tests/finder-system-integration.test.js
git commit -m "feat(finder): add system integration module"
```

---

## Task 7: Skill Documentation

**Files:**
- Create: `skills/finder/skill.md`

### Step 1: Create comprehensive documentation

Create: `skills/finder/skill.md` (see full content in actual plan - includes usage, examples, troubleshooting)

### Step 2: Commit

```bash
git add skills/finder/skill.md
git commit -m "docs(finder): add comprehensive skill documentation"
```

---

## Task 8: Command Registration

**Files:**
- Modify: `lib/command-registry.js`

### Step 1: Add commands

```javascript
{
  name: 'find',
  aliases: ['search'],
  description: 'Search for files using Spotlight',
  handler: {
    type: 'skill',
    skill: 'finder',
    action: 'search'
  }
},
{
  name: 'reveal',
  aliases: [],
  description: 'Show file in Finder',
  handler: {
    type: 'skill',
    skill: 'finder',
    action: 'reveal'
  }
},
{
  name: 'clipboard',
  aliases: ['clip'],
  description: 'Get or set clipboard contents',
  handler: {
    type: 'skill',
    skill: 'finder',
    action: 'clipboard'
  }
}
```

### Step 2: Commit

```bash
git add lib/command-registry.js
git commit -m "feat(commands): register Finder system commands"
```

---

## Task 9: CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

### Step 1: Update capabilities

```markdown
### Finder & System Integration

- **File operations**: Move, copy, rename via Finder (preserves metadata)
- **Spotlight search**: Find files by name, content, metadata
- **Clipboard**: Get/set clipboard programmatically
- **Folder actions**: Attach automation scripts to folders

See `skills/finder/skill.md` for details.
```

### Step 2: Commit

```bash
git add CLAUDE.md
git commit -m "docs: add Finder system capabilities to CLAUDE.md"
```

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `file-operations.scpt` | Finder file operations |
| 2 | `spotlight-search.sh` | Spotlight search |
| 3 | `file-metadata.sh` | Metadata queries |
| 4 | `clipboard.scpt`, `clipboard.sh` | Clipboard management |
| 5 | `attach-folder-action.scpt` | Folder action attachment |
| 6 | `lib/finder-system.js` | Integration module |
| 7 | `skill.md` | Documentation |
| 8 | `command-registry.js` | Commands |
| 9 | `CLAUDE.md` | System docs |

## Post-Implementation Notes

### Performance

- Finder AppleScript is slower than shell but preserves metadata
- Spotlight search is very fast (indexed)
- Use shell for bulk operations, Finder for user-visible operations

### Permissions

All operations require:
- **Automation**: Terminal → Finder
- **Automation**: Terminal → System Events (for folder actions)

### Future Enhancements

1. **Smart File Organization** - Auto-categorize downloads
2. **Advanced Folder Actions** - Process uploaded files automatically
3. **Metadata Tagging** - Programmatic tag management
4. **Quick Look Integration** - Generate previews programmatically
5. **Desktop Cleanup** - Automated organization scripts
