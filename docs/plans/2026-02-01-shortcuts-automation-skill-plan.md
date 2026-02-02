# Shortcuts/Automation Skill Implementation Plan

> **Architecture Reference:** This plan follows the standardized patterns defined in
> `docs/concepts/2026-02-01-apple-integration-architecture.md`

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Add Shortcuts skill to enable running macOS Shortcuts automations, bridging to capabilities without direct AppleScript support (Focus Modes, Location Services, iOS integrations).

**Architecture:** This IS the bridge to Apple Shortcuts app for the Apple Integration suite. Provides access to macOS Shortcuts via AppleScript (Shortcuts Events) and CLI. Other skills use this to access iOS-only capabilities, Focus Modes, Location Services, and HomeKit. Follows the standardized Apple Integration skill structure.

> **⏸️ DEFERRED - Focus Modes:** Before implementing Focus Mode functionality (Task 3),
> brainstorm with Tommy to confirm use cases and benefits. Currently unclear what
> value Focus Mode reading/setting provides for the agent. See sprint index for status.

**Tech Stack:** Node.js, osascript (Shortcuts Events AppleScript), `/usr/bin/shortcuts` CLI, JXA (for Focus Mode reading), lib/icloud-storage.js for storing outputs

---

## Skill Directory Structure

```
skills/shortcuts/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── shortcuts.js            # Core shortcuts runner
│   ├── shortcuts-lister.js     # List available shortcuts
│   ├── focus-reader.js         # Read Focus mode via JXA
│   ├── location-reader.js      # Get location via Shortcuts bridge
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   ├── shortcuts-events.md     # AppleScript Shortcuts Events reference
│   ├── focus-mode.md           # Focus mode reading documentation
│   └── location-bridge.md      # Location via Shortcuts workaround
├── scripts/                    # Reusable automation scripts
│   ├── run-shortcut.scpt       # AppleScript to run shortcuts
│   ├── list-shortcuts.scpt     # AppleScript to list shortcuts
│   └── get-focus.jxa           # JXA script to read Focus mode
└── tests/
    ├── shortcuts-runner.test.js
    ├── shortcuts-lister.test.js
    ├── focus-reader.test.js
    └── location-reader.test.js
```

## Command File

**Location:** `.claude/commands/shortcuts.md`

```yaml
---
name: shortcuts
description: Bridge to Apple Shortcuts app - run shortcuts, check Focus mode, get location
argument-hint: [action] [args...]
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Load the Shortcuts skill and process: $ARGUMENTS

Available actions:
- run <shortcut-name> [input] - Run a macOS shortcut
- list - List all available shortcuts
- focus - Get current Focus mode
- location - Get current location (via Shortcuts bridge)

This skill bridges to Apple Shortcuts for:
- iOS integrations (HomeKit, iMessages, etc.)
- Focus Mode detection
- Location Services
- Any automation without direct AppleScript support

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## How Other Skills Use This

The Shortcuts skill provides a bridge for capabilities without direct API access:

```javascript
// In skills/bluetooth/lib/device-manager.js
import { runShortcut } from '../../../skills/shortcuts/lib/shortcuts.js';

// Control AirPods noise mode via Shortcuts
await runShortcut('AirPods Noise Control');

// In notification monitor
import { getCurrentFocus } from '../../../skills/shortcuts/lib/focus-reader.js';

// Check Focus mode before sending notifications
const focus = await getCurrentFocus();
if (focus === 'Work' || focus === 'Do Not Disturb') {
  // Queue instead of sending immediately
}
```

## iCloud Storage Integration

Use `lib/icloud-storage.js` for storing shortcut outputs:

```javascript
import { getPath } from '../../lib/icloud-storage.js';

// Store shortcut outputs in iCloud
const outputPath = getPath('exports', `shortcut-output-${date}.txt`);
```

---

## CRITICAL: Research Findings (2026-02-01)

### Shortcuts Events AppleScript Dictionary

**Confirmed:** macOS Shortcuts supports AppleScript via "Shortcuts Events" application.

From [WWDC21 - Meet Shortcuts for macOS](https://developer.apple.com/videos/play/wwdc2021/10232/):
> "By communicating with the 'Shortcuts Events' process, your app can get a list of shortcuts that the user has set up, as well as start running one. In AppleScript, you can accomplish this by telling the 'Shortcuts Events' process to run a shortcut by name."

**AppleScript Syntax:**
```applescript
tell application "Shortcuts Events"
    run shortcut "Shortcut Name"
end tell

-- With input
tell application "Shortcuts Events"
    run shortcut "Process Text" with input "Hello World"
end tell

-- List shortcuts
tell application "Shortcuts Events"
    get name of every shortcut
end tell
```

**Source:** [Pro-Tip: Shortcuts Has Its Own Suite of AppleScript Commands](https://matthewcassinelli.com/shortcuts-applescript-commands/) by Matthew Cassinelli

### shortcuts CLI Command

**Confirmed:** macOS includes built-in `/usr/bin/shortcuts` command-line tool.

```bash
# Run a shortcut
shortcuts run "Shortcut Name"

# Run with input
shortcuts run "Shortcut Name" --input-path input.txt --output-path output.txt

# List all shortcuts
shortcuts list

# List with identifiers
shortcuts list --show-identifiers

# List shortcuts in folder
shortcuts list --folder-name "Folder Name"

# List folders
shortcuts list --folders
```

**Man Page:** `man shortcuts` on macOS 14.8.3

### Focus Mode Detection

**Limitation:** No direct AppleScript dictionary for Focus modes.

**Workaround:** Read Focus mode status via JXA (JavaScript for Automation) by parsing macOS system files.

**JXA Script:** [Read current Focus mode on macOS Monterey (12.0+)](https://gist.github.com/drewkerr/0f2b61ce34e2b9e3ce0ec6a92ab05c18) by Drew Kerr

```javascript
// Reads ~/Library/DoNotDisturb/DB/Assertions.json
// Reads ~/Library/DoNotDisturb/DB/ModeConfigurations.json
// Returns: "No focus" or focus mode name (e.g., "Work", "Sleep")
```

**Requirements:**
- Full Disk Access permission for Terminal/Node
- Reads JSON config files from `~/Library/DoNotDisturb/DB/`

**Alternative:** Create a Shortcuts automation that reads Focus mode and exposes it as a runnable shortcut (bridge pattern).

### Location Services

**Limitation:** CoreLocationCLI broken in macOS Ventura+ ([Ben Ward's blog](https://benward.uk/blog/macos-location-cli))

**Workaround:** Use Shortcuts "Get current location" action as bridge.

**Known Issue:** "Get Current Location" action has intermittent reliability issues in macOS 15.x ([Apple Community Discussion](https://discussions.apple.com/thread/255885320)), but Maps and Weather work correctly. Users report it works sometimes, fails other times.

**Implementation Strategy:**
1. Create a shortcut named "Get Location for Brokkr" using "Get current location" action
2. Run via AppleScript: `run shortcut "Get Location for Brokkr"`
3. Parse latitude/longitude from output
4. Add retry logic with 3 attempts

### Official Documentation Sources

- [WWDC21 - Meet Shortcuts for macOS](https://developer.apple.com/videos/play/wwdc2021/10232/) - Official Apple video on Shortcuts Events API
- [Shortcuts, AppleScript, Terminal: Working around automation roadblocks](https://sixcolors.com/post/2022/01/shortcuts-applescript-terminal-working-around-automation-roadblocks/) - Six Colors article on integration patterns
- [Apple AppleScript Language Guide](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/introduction/ASLR_intro.html) - Official AppleScript documentation
- [Get current Focus mode via script](https://talk.automators.fm/t/get-current-focus-mode-via-script/12423) - Automators Talk discussion

---

## Design Decisions

### Why Both AppleScript and CLI?

1. **AppleScript (Shortcuts Events)** - Programmatic access, better for integration, can pass input/output
2. **CLI (`shortcuts`)** - Fallback option, better for debugging, direct terminal access
3. **Prefer AppleScript** for production (more reliable, better error messages)

### Command Structure

Following existing skill command patterns:

| Command | Type | Description |
|---------|------|-------------|
| `/shortcut <name>` | skill | Run shortcut by name |
| `/shortcut <name> <input>` | skill | Run shortcut with input text |
| `/shortcuts` | skill | List available shortcuts |
| `/focus` | skill | Get current Focus mode |
| `/location` | skill | Get current location (via Shortcuts bridge) |

### Skill Registration

All commands registered in `lib/builtin-commands.js` using `CommandFactory.skill()` pattern.

### Error Handling

1. **Shortcut not found** - List available shortcuts to help user
2. **Permission denied** - Guide user to grant Full Disk Access / Automation permissions
3. **Location unavailable** - Retry up to 3 times, return error message if all fail
4. **Focus mode read failure** - Fall back to "Unable to read Focus mode" message

### Focus Mode Bridge Strategy

Focus modes are read via JXA (JavaScript for Automation) by parsing macOS system files:

1. JXA script reads `~/Library/DoNotDisturb/DB/Assertions.json`
2. JXA script reads `~/Library/DoNotDisturb/DB/ModeConfigurations.json`
3. Parses configurations to determine active Focus mode
4. Requires Full Disk Access permission for Terminal

**Benefit:** Direct, reliable, no dependency on Shortcuts app for this feature

### Location Bridge Setup

User must create shortcut manually (one-time setup):

1. Open Shortcuts app
2. Create new shortcut: "Get Location for Brokkr"
3. Add action: "Get current location"
4. Add action: "Get details of location" → Latitude, Longitude
5. Add action: "Combine text" → Format as JSON: `{"lat": <lat>, "lon": <lon>}`
6. Bot runs this shortcut when `/location` invoked

**Documentation:** Include setup instructions in `skills/shortcuts/skill.md`

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | AppleScript Shortcuts Runner Module | `lib/shortcuts-runner.js`, `tests/shortcuts-runner.test.js` |
| 2 | Shortcuts Lister Module | `lib/shortcuts-lister.js`, `tests/shortcuts-lister.test.js` |
| 3 | Focus Mode Reader Module | `lib/focus-reader.js`, `tests/focus-reader.test.js` |
| 4 | Location Reader Module | `lib/location-reader.js`, `tests/location-reader.test.js` |
| 5 | Command Registration | `lib/builtin-commands.js` |
| 6 | AppleScript Helper Scripts | `skills/shortcuts/*.scpt` |
| 7 | Skill Documentation | `skills/shortcuts/skill.md` |
| 8 | Setup Guide | `skills/shortcuts/SETUP.md` |
| 9 | Integration Testing | Manual testing checklist |
| 10 | Update CLAUDE.md | Document new commands |

---

## Task 1: AppleScript Shortcuts Runner Module

**Files:**
- Create: `lib/shortcuts-runner.js`
- Create: `tests/shortcuts-runner.test.js`

### Step 1: Write the failing test

```javascript
// tests/shortcuts-runner.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runShortcut, buildRunScript, parseShortcutOutput } from '../lib/shortcuts-runner.js';
import { exec } from 'child_process';

// Mock child_process
vi.mock('child_process');

describe('Shortcuts Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildRunScript', () => {
    it('should build AppleScript to run shortcut by name', () => {
      const script = buildRunScript('Morning Routine');

      expect(script).toContain('tell application "Shortcuts Events"');
      expect(script).toContain('run shortcut "Morning Routine"');
    });

    it('should build script with input parameter', () => {
      const script = buildRunScript('Process Text', 'Hello World');

      expect(script).toContain('run shortcut "Process Text" with input "Hello World"');
    });

    it('should escape quotes in shortcut name', () => {
      const script = buildRunScript('My "Special" Shortcut');

      expect(script).toContain('My \\"Special\\" Shortcut');
    });

    it('should escape quotes in input text', () => {
      const script = buildRunScript('Test', 'Text with "quotes"');

      expect(script).toContain('Text with \\"quotes\\"');
    });
  });

  describe('parseShortcutOutput', () => {
    it('should return output text as-is', () => {
      const output = 'Shortcut completed successfully';
      const result = parseShortcutOutput(output);

      expect(result).toBe('Shortcut completed successfully');
    });

    it('should trim whitespace', () => {
      const output = '  Result text  \n';
      const result = parseShortcutOutput(output);

      expect(result).toBe('Result text');
    });

    it('should return null for empty output', () => {
      expect(parseShortcutOutput('')).toBe(null);
      expect(parseShortcutOutput('   ')).toBe(null);
      expect(parseShortcutOutput(null)).toBe(null);
    });

    it('should handle multi-line output', () => {
      const output = 'Line 1\nLine 2\nLine 3';
      const result = parseShortcutOutput(output);

      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('runShortcut', () => {
    it('should execute AppleScript and return output', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Success', stderr: '' });
      });

      const result = await runShortcut('Test Shortcut');

      expect(result).toBe('Success');
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('osascript'),
        expect.any(Function)
      );
    });

    it('should pass input parameter', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Processed', stderr: '' });
      });

      await runShortcut('Process Text', 'Input data');

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('with input "Input data"'),
        expect.any(Function)
      );
    });

    it('should throw error when shortcut fails', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Shortcut not found'), { stdout: '', stderr: 'Error: The shortcut "Bad Name" could not be found.' });
      });

      await expect(runShortcut('Bad Name')).rejects.toThrow('Shortcut not found');
    });

    it('should handle permission errors', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Not authorized'), { stdout: '', stderr: 'Not authorized to send Apple events to Shortcuts Events.' });
      });

      await expect(runShortcut('Test')).rejects.toThrow('Not authorized');
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- tests/shortcuts-runner.test.js
```

**Expected:** FAIL with "Cannot find module '../lib/shortcuts-runner.js'"

### Step 3: Write minimal implementation

```javascript
// lib/shortcuts-runner.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Escapes quotes in a string for AppleScript
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeAppleScriptString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Builds AppleScript to run a shortcut
 * @param {string} shortcutName - Name of the shortcut to run
 * @param {string|null} input - Optional input to pass to shortcut
 * @returns {string} AppleScript code
 */
export function buildRunScript(shortcutName, input = null) {
  const escapedName = escapeAppleScriptString(shortcutName);

  if (input !== null) {
    const escapedInput = escapeAppleScriptString(input);
    return `tell application "Shortcuts Events"
  run shortcut "${escapedName}" with input "${escapedInput}"
end tell`;
  }

  return `tell application "Shortcuts Events"
  run shortcut "${escapedName}"
end tell`;
}

/**
 * Parses output from shortcut execution
 * @param {string|null} output - Raw output from osascript
 * @returns {string|null} Parsed output or null if empty
 */
export function parseShortcutOutput(output) {
  if (!output || typeof output !== 'string') {
    return null;
  }

  const trimmed = output.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Runs a macOS shortcut via AppleScript
 * @param {string} shortcutName - Name of the shortcut to run
 * @param {string|null} input - Optional input to pass to shortcut
 * @returns {Promise<string|null>} Output from shortcut execution
 * @throws {Error} If shortcut fails or not found
 */
export async function runShortcut(shortcutName, input = null) {
  const script = buildRunScript(shortcutName, input);

  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr && stderr.length > 0) {
      // Check for common errors
      if (stderr.includes('could not be found')) {
        throw new Error(`Shortcut "${shortcutName}" not found`);
      }
      if (stderr.includes('Not authorized')) {
        throw new Error('Not authorized to run shortcuts. Grant Automation permission in System Settings.');
      }
      // Generic stderr warning (might not be fatal)
      console.warn(`Shortcut stderr: ${stderr}`);
    }

    return parseShortcutOutput(stdout);
  } catch (error) {
    // Re-throw with more context
    throw new Error(`Failed to run shortcut "${shortcutName}": ${error.message}`);
  }
}
```

### Step 4: Run test to verify it passes

```bash
npm test -- tests/shortcuts-runner.test.js
```

**Expected:** PASS (all tests green)

### Step 5: Commit

```bash
git add lib/shortcuts-runner.js tests/shortcuts-runner.test.js
git commit -m "Add shortcuts runner module with AppleScript integration

- Build AppleScript to run shortcuts via Shortcuts Events
- Parse shortcut output and handle errors
- Tests cover shortcut execution, input passing, error handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Shortcuts Lister Module

**Files:**
- Create: `lib/shortcuts-lister.js`
- Create: `tests/shortcuts-lister.test.js`

### Step 1: Write the failing test

```javascript
// tests/shortcuts-lister.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listShortcuts, buildListScript, parseShortcutsList } from '../lib/shortcuts-lister.js';
import { exec } from 'child_process';

vi.mock('child_process');

describe('Shortcuts Lister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildListScript', () => {
    it('should build AppleScript to list all shortcuts', () => {
      const script = buildListScript();

      expect(script).toContain('tell application "Shortcuts Events"');
      expect(script).toContain('get name of every shortcut');
    });
  });

  describe('parseShortcutsList', () => {
    it('should parse comma-separated shortcut names', () => {
      const output = 'Morning Routine, Get Weather, Process Text';
      const shortcuts = parseShortcutsList(output);

      expect(shortcuts).toEqual([
        'Morning Routine',
        'Get Weather',
        'Process Text'
      ]);
    });

    it('should handle single shortcut', () => {
      const output = 'Single Shortcut';
      const shortcuts = parseShortcutsList(output);

      expect(shortcuts).toEqual(['Single Shortcut']);
    });

    it('should return empty array for no shortcuts', () => {
      expect(parseShortcutsList('')).toEqual([]);
      expect(parseShortcutsList(null)).toEqual([]);
      expect(parseShortcutsList('   ')).toEqual([]);
    });

    it('should trim whitespace from shortcut names', () => {
      const output = ' Name1 ,  Name2  , Name3';
      const shortcuts = parseShortcutsList(output);

      expect(shortcuts).toEqual(['Name1', 'Name2', 'Name3']);
    });

    it('should filter out empty entries', () => {
      const output = 'Name1, , Name2, ,';
      const shortcuts = parseShortcutsList(output);

      expect(shortcuts).toEqual(['Name1', 'Name2']);
    });
  });

  describe('listShortcuts', () => {
    it('should execute AppleScript and return shortcut names', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Shortcut A, Shortcut B, Shortcut C', stderr: '' });
      });

      const shortcuts = await listShortcuts();

      expect(shortcuts).toEqual(['Shortcut A', 'Shortcut B', 'Shortcut C']);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('osascript'),
        expect.any(Function)
      );
    });

    it('should return empty array when no shortcuts exist', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const shortcuts = await listShortcuts();

      expect(shortcuts).toEqual([]);
    });

    it('should throw error on permission denied', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Not authorized'), { stdout: '', stderr: 'Not authorized to send Apple events' });
      });

      await expect(listShortcuts()).rejects.toThrow('Not authorized');
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- tests/shortcuts-lister.test.js
```

**Expected:** FAIL with "Cannot find module '../lib/shortcuts-lister.js'"

### Step 3: Write minimal implementation

```javascript
// lib/shortcuts-lister.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Builds AppleScript to list all shortcuts
 * @returns {string} AppleScript code
 */
export function buildListScript() {
  return `tell application "Shortcuts Events"
  get name of every shortcut
end tell`;
}

/**
 * Parses AppleScript output into array of shortcut names
 * @param {string|null} output - Raw output from osascript
 * @returns {string[]} Array of shortcut names
 */
export function parseShortcutsList(output) {
  if (!output || typeof output !== 'string') {
    return [];
  }

  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // AppleScript returns comma-separated list
  return trimmed
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);
}

/**
 * Lists all available macOS shortcuts
 * @returns {Promise<string[]>} Array of shortcut names
 * @throws {Error} If unable to list shortcuts
 */
export async function listShortcuts() {
  const script = buildListScript();

  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr && stderr.length > 0) {
      if (stderr.includes('Not authorized')) {
        throw new Error('Not authorized to access shortcuts. Grant Automation permission in System Settings.');
      }
      console.warn(`List shortcuts stderr: ${stderr}`);
    }

    return parseShortcutsList(stdout);
  } catch (error) {
    throw new Error(`Failed to list shortcuts: ${error.message}`);
  }
}
```

### Step 4: Run test to verify it passes

```bash
npm test -- tests/shortcuts-lister.test.js
```

**Expected:** PASS (all tests green)

### Step 5: Commit

```bash
git add lib/shortcuts-lister.js tests/shortcuts-lister.test.js
git commit -m "Add shortcuts lister module for discovering available shortcuts

- Build AppleScript to get all shortcut names
- Parse comma-separated output into array
- Tests cover list parsing and error handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Focus Mode Reader Module

**Files:**
- Create: `lib/focus-reader.js`
- Create: `tests/focus-reader.test.js`
- Create: `skills/shortcuts/get-focus.jxa` (JXA script)

### Step 1: Write the failing test

```javascript
// tests/focus-reader.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentFocus, buildFocusJXAScript, parseFocusOutput } from '../lib/focus-reader.js';
import { exec } from 'child_process';
import * as fs from 'fs';

vi.mock('child_process');
vi.mock('fs');

describe('Focus Reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildFocusJXAScript', () => {
    it('should return path to JXA script file', () => {
      const scriptPath = buildFocusJXAScript();

      expect(scriptPath).toContain('skills/shortcuts/get-focus.jxa');
      expect(scriptPath).toMatch(/\.jxa$/);
    });
  });

  describe('parseFocusOutput', () => {
    it('should return focus mode name', () => {
      const output = 'Work';
      const result = parseFocusOutput(output);

      expect(result).toBe('Work');
    });

    it('should handle "No focus" output', () => {
      const output = 'No focus';
      const result = parseFocusOutput(output);

      expect(result).toBe('No focus');
    });

    it('should trim whitespace', () => {
      const output = '  Sleep  \n';
      const result = parseFocusOutput(output);

      expect(result).toBe('Sleep');
    });

    it('should return "Unknown" for empty output', () => {
      expect(parseFocusOutput('')).toBe('Unknown');
      expect(parseFocusOutput(null)).toBe('Unknown');
      expect(parseFocusOutput('   ')).toBe('Unknown');
    });
  });

  describe('getCurrentFocus', () => {
    it('should execute JXA script and return focus mode', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Work', stderr: '' });
      });

      const focus = await getCurrentFocus();

      expect(focus).toBe('Work');
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('osascript'),
        expect.any(Function)
      );
    });

    it('should return "No focus" when no focus is active', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'No focus', stderr: '' });
      });

      const focus = await getCurrentFocus();

      expect(focus).toBe('No focus');
    });

    it('should throw error on permission denied', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd, callback) => {
        callback(new Error('Permission denied'), { stdout: '', stderr: 'Error: read operation not permitted' });
      });

      await expect(getCurrentFocus()).rejects.toThrow();
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- tests/focus-reader.test.js
```

**Expected:** FAIL with "Cannot find module '../lib/focus-reader.js'"

### Step 3: Create JXA script

```javascript
// skills/shortcuts/get-focus.jxa
const app = Application.currentApplication();
app.includeStandardAdditions = true;

function getJSON(path) {
  const fullPath = path.replace(/^~/, app.pathTo('home folder'));
  try {
    const contents = app.read(fullPath);
    return JSON.parse(contents);
  } catch (error) {
    return null;
  }
}

function run() {
  let focus = "No focus"; // default

  try {
    const assertData = getJSON("~/Library/DoNotDisturb/DB/Assertions.json");
    const configData = getJSON("~/Library/DoNotDisturb/DB/ModeConfigurations.json");

    if (!assertData || !configData) {
      return "Unknown";
    }

    const assert = assertData.data && assertData.data[0] ? assertData.data[0].storeAssertionRecords : null;
    const config = configData.data && configData.data[0] ? configData.data[0].modeConfigurations : null;

    if (!config) {
      return "Unknown";
    }

    if (assert && assert.length > 0) {
      // Focus set manually
      const modeid = assert[0].assertionDetails.assertionDetailsModeIdentifier;
      if (config[modeid] && config[modeid].mode) {
        focus = config[modeid].mode.name;
      }
    } else {
      // Focus set by time-based trigger
      const date = new Date();
      const now = date.getHours() * 60 + date.getMinutes();

      for (const modeid in config) {
        const triggers = config[modeid].triggers && config[modeid].triggers.triggers ? config[modeid].triggers.triggers[0] : null;

        if (triggers && triggers.enabledSetting === 2) {
          const start = triggers.timePeriodStartTimeHour * 60 + triggers.timePeriodStartTimeMinute;
          const end = triggers.timePeriodEndTimeHour * 60 + triggers.timePeriodEndTimeMinute;

          if (start < end) {
            if (now >= start && now < end) {
              focus = config[modeid].mode.name;
            }
          } else if (start > end) {
            // Includes midnight
            if (now >= start || now < end) {
              focus = config[modeid].mode.name;
            }
          }
        }
      }
    }
  } catch (error) {
    return "Error: " + error.message;
  }

  return focus;
}
```

### Step 4: Write minimal implementation

```javascript
// lib/focus-reader.js
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

// Get current file directory for finding JXA script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gets path to the Focus mode JXA script
 * @returns {string} Absolute path to get-focus.jxa
 */
export function buildFocusJXAScript() {
  return join(__dirname, '..', 'skills', 'shortcuts', 'get-focus.jxa');
}

/**
 * Parses JXA output to extract focus mode name
 * @param {string|null} output - Raw output from osascript
 * @returns {string} Focus mode name or "Unknown"
 */
export function parseFocusOutput(output) {
  if (!output || typeof output !== 'string') {
    return 'Unknown';
  }

  const trimmed = output.trim();
  return trimmed.length > 0 ? trimmed : 'Unknown';
}

/**
 * Gets the current macOS Focus mode
 * @returns {Promise<string>} Focus mode name (e.g., "Work", "Sleep", "No focus", "Unknown")
 * @throws {Error} If unable to read Focus mode
 */
export async function getCurrentFocus() {
  const scriptPath = buildFocusJXAScript();

  try {
    const { stdout, stderr } = await execAsync(`osascript -l JavaScript "${scriptPath}"`);

    if (stderr && stderr.length > 0) {
      if (stderr.includes('not permitted')) {
        throw new Error('Permission denied. Grant Full Disk Access to Terminal in System Settings.');
      }
      console.warn(`Focus mode stderr: ${stderr}`);
    }

    const focus = parseFocusOutput(stdout);

    // Check for error in output
    if (focus.startsWith('Error:')) {
      throw new Error(focus);
    }

    return focus;
  } catch (error) {
    throw new Error(`Failed to read Focus mode: ${error.message}`);
  }
}
```

### Step 5: Run test to verify it passes

```bash
npm test -- tests/focus-reader.test.js
```

**Expected:** PASS (all tests green)

### Step 6: Commit

```bash
git add lib/focus-reader.js tests/focus-reader.test.js skills/shortcuts/get-focus.jxa
git commit -m "Add Focus mode reader using JXA

- JXA script reads macOS DoNotDisturb configuration files
- Detects manual and time-triggered Focus modes
- Tests cover parsing and error handling
- Requires Full Disk Access permission

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Location Reader Module

**Files:**
- Create: `lib/location-reader.js`
- Create: `tests/location-reader.test.js`

### Step 1: Write the failing test

```javascript
// tests/location-reader.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentLocation, parseLocationOutput } from '../lib/location-reader.js';
import { runShortcut } from '../lib/shortcuts-runner.js';

vi.mock('../lib/shortcuts-runner.js');

describe('Location Reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseLocationOutput', () => {
    it('should parse JSON location output', () => {
      const output = '{"lat": 47.6062, "lon": -122.3321}';
      const location = parseLocationOutput(output);

      expect(location).toEqual({
        latitude: 47.6062,
        longitude: -122.3321
      });
    });

    it('should parse location from text format', () => {
      const output = 'Latitude: 47.6062, Longitude: -122.3321';
      const location = parseLocationOutput(output);

      expect(location).toEqual({
        latitude: 47.6062,
        longitude: -122.3321
      });
    });

    it('should handle alternative key names', () => {
      const output = '{"latitude": 47.6062, "longitude": -122.3321}';
      const location = parseLocationOutput(output);

      expect(location).toEqual({
        latitude: 47.6062,
        longitude: -122.3321
      });
    });

    it('should return null for invalid output', () => {
      expect(parseLocationOutput('')).toBe(null);
      expect(parseLocationOutput(null)).toBe(null);
      expect(parseLocationOutput('Not a location')).toBe(null);
      expect(parseLocationOutput('{}')).toBe(null);
    });

    it('should validate coordinate ranges', () => {
      // Latitude out of range
      expect(parseLocationOutput('{"lat": 91, "lon": 0}')).toBe(null);
      expect(parseLocationOutput('{"lat": -91, "lon": 0}')).toBe(null);

      // Longitude out of range
      expect(parseLocationOutput('{"lat": 0, "lon": 181}')).toBe(null);
      expect(parseLocationOutput('{"lat": 0, "lon": -181}')).toBe(null);
    });
  });

  describe('getCurrentLocation', () => {
    it('should run location shortcut and parse result', async () => {
      const mockRunShortcut = vi.mocked(runShortcut);
      mockRunShortcut.mockResolvedValue('{"lat": 47.6062, "lon": -122.3321}');

      const location = await getCurrentLocation();

      expect(location).toEqual({
        latitude: 47.6062,
        longitude: -122.3321
      });
      expect(mockRunShortcut).toHaveBeenCalledWith('Get Location for Brokkr');
    });

    it('should retry up to 3 times on failure', async () => {
      const mockRunShortcut = vi.mocked(runShortcut);
      mockRunShortcut
        .mockRejectedValueOnce(new Error('Location unavailable'))
        .mockRejectedValueOnce(new Error('Location unavailable'))
        .mockResolvedValue('{"lat": 47.6062, "lon": -122.3321}');

      const location = await getCurrentLocation();

      expect(location).toEqual({
        latitude: 47.6062,
        longitude: -122.3321
      });
      expect(mockRunShortcut).toHaveBeenCalledTimes(3);
    });

    it('should throw error after 3 failed attempts', async () => {
      const mockRunShortcut = vi.mocked(runShortcut);
      mockRunShortcut.mockRejectedValue(new Error('Location unavailable'));

      await expect(getCurrentLocation()).rejects.toThrow('Failed to get location after 3 attempts');
      expect(mockRunShortcut).toHaveBeenCalledTimes(3);
    });

    it('should throw error if shortcut not found', async () => {
      const mockRunShortcut = vi.mocked(runShortcut);
      mockRunShortcut.mockRejectedValue(new Error('Shortcut "Get Location for Brokkr" not found'));

      await expect(getCurrentLocation()).rejects.toThrow('Shortcut "Get Location for Brokkr" not found');
    });

    it('should throw error if output cannot be parsed', async () => {
      const mockRunShortcut = vi.mocked(runShortcut);
      mockRunShortcut.mockResolvedValue('Invalid location data');

      await expect(getCurrentLocation()).rejects.toThrow('Could not parse location from shortcut output');
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- tests/location-reader.test.js
```

**Expected:** FAIL with "Cannot find module '../lib/location-reader.js'"

### Step 3: Write minimal implementation

```javascript
// lib/location-reader.js
import { runShortcut } from './shortcuts-runner.js';

const LOCATION_SHORTCUT_NAME = 'Get Location for Brokkr';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses location data from shortcut output
 * @param {string|null} output - Output from location shortcut
 * @returns {Object|null} Object with latitude and longitude, or null if invalid
 */
export function parseLocationOutput(output) {
  if (!output || typeof output !== 'string') {
    return null;
  }

  let lat = null;
  let lon = null;

  // Try parsing as JSON first
  try {
    const json = JSON.parse(output);
    lat = json.lat || json.latitude;
    lon = json.lon || json.lng || json.longitude;
  } catch (error) {
    // Not JSON, try text parsing
    const latMatch = output.match(/Latitude:\s*([-+]?[0-9]*\.?[0-9]+)/i);
    const lonMatch = output.match(/Longitude:\s*([-+]?[0-9]*\.?[0-9]+)/i);

    if (latMatch && lonMatch) {
      lat = parseFloat(latMatch[1]);
      lon = parseFloat(lonMatch[1]);
    }
  }

  // Validate coordinates
  if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
    return null;
  }

  // Validate ranges
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lon
  };
}

/**
 * Gets current location via Shortcuts bridge
 * @returns {Promise<Object>} Object with latitude and longitude
 * @throws {Error} If location cannot be retrieved or shortcut not found
 */
export async function getCurrentLocation() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Run the location shortcut
      const output = await runShortcut(LOCATION_SHORTCUT_NAME);

      // Parse the output
      const location = parseLocationOutput(output);

      if (!location) {
        throw new Error('Could not parse location from shortcut output');
      }

      return location;
    } catch (error) {
      lastError = error;

      // Don't retry if shortcut not found (setup issue)
      if (error.message.includes('not found')) {
        throw new Error(
          `Shortcut "${LOCATION_SHORTCUT_NAME}" not found. ` +
          `Please create this shortcut in the Shortcuts app with "Get current location" action. ` +
          `See skills/shortcuts/SETUP.md for instructions.`
        );
      }

      // If this was the last attempt, throw
      if (attempt === MAX_RETRIES) {
        break;
      }

      // Wait before retry
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  // All retries failed
  throw new Error(
    `Failed to get location after ${MAX_RETRIES} attempts. ` +
    `Last error: ${lastError?.message || 'Unknown error'}. ` +
    `This is a known issue with macOS Shortcuts "Get current location" action.`
  );
}
```

### Step 4: Run test to verify it passes

```bash
npm test -- tests/location-reader.test.js
```

**Expected:** PASS (all tests green)

### Step 5: Commit

```bash
git add lib/location-reader.js tests/location-reader.test.js
git commit -m "Add location reader via Shortcuts bridge

- Runs 'Get Location for Brokkr' shortcut
- Parses JSON and text location formats
- Retries up to 3 times (known macOS Shortcuts issue)
- Validates coordinate ranges
- Tests cover parsing, retries, error handling

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Command Registration

**Files:**
- Update: `lib/builtin-commands.js`

### Step 1: Add shortcut commands to builtin-commands.js

```javascript
// lib/builtin-commands.js
// ... existing imports ...

export function registerBuiltinCommands(registry = getDefaultRegistry()) {
  // ... existing commands ...

  // ===== Shortcuts/Automation Commands =====

  // /shortcut <name> [input] - Run a macOS shortcut
  registry.register(
    CommandFactory.skill({
      name: 'shortcut',
      description: 'Run a macOS shortcut by name',
      skill: 'shortcuts',
      arguments: {
        required: ['name'],
        optional: ['input'],
        hint: '<name> [input]'
      }
    })
  );

  // /shortcuts - List available shortcuts
  registry.register(
    CommandFactory.skill({
      name: 'shortcuts',
      description: 'List all available macOS shortcuts',
      skill: 'shortcuts',
      arguments: {
        required: [],
        optional: [],
        hint: ''
      }
    })
  );

  // /focus - Get current Focus mode
  registry.register(
    CommandFactory.skill({
      name: 'focus',
      description: 'Get current macOS Focus mode',
      skill: 'shortcuts',
      arguments: {
        required: [],
        optional: [],
        hint: ''
      }
    })
  );

  // /location - Get current location
  registry.register(
    CommandFactory.skill({
      name: 'location',
      description: 'Get current location via Shortcuts bridge',
      skill: 'shortcuts',
      aliases: ['loc'],
      arguments: {
        required: [],
        optional: [],
        hint: ''
      }
    })
  );

  return registry;
}
```

### Step 2: Update tests

```bash
# Update builtin-commands.test.js to include new commands
npm test -- tests/builtin-commands.test.js
```

Expected: Tests should verify new commands are registered correctly.

### Step 3: Test command registration

```bash
node dry-run-test.js "/shortcut Morning Routine"
node dry-run-test.js "/shortcuts"
node dry-run-test.js "/focus"
node dry-run-test.js "/location"
```

Expected: All commands should be recognized and parsed correctly.

### Step 4: Commit

```bash
git add lib/builtin-commands.js tests/builtin-commands.test.js
git commit -m "Register shortcuts/automation commands

- /shortcut <name> [input] - Run shortcut
- /shortcuts - List shortcuts
- /focus - Get Focus mode
- /location - Get location

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: AppleScript Helper Scripts

**Files:**
- Create: `skills/shortcuts/run-shortcut.scpt`
- Create: `skills/shortcuts/list-shortcuts.scpt`

### Step 1: Create run-shortcut.scpt

```applescript
-- skills/shortcuts/run-shortcut.scpt
-- Run a macOS shortcut via Shortcuts Events
-- Usage: osascript run-shortcut.scpt "Shortcut Name" ["input text"]

on run argv
	set shortcutName to item 1 of argv

	tell application "Shortcuts Events"
		if (count of argv) > 1 then
			-- Run with input
			set inputText to item 2 of argv
			set result to run shortcut shortcutName with input inputText
		else
			-- Run without input
			set result to run shortcut shortcutName
		end if
	end tell

	return result
end run
```

### Step 2: Create list-shortcuts.scpt

```applescript
-- skills/shortcuts/list-shortcuts.scpt
-- List all macOS shortcuts via Shortcuts Events
-- Usage: osascript list-shortcuts.scpt

tell application "Shortcuts Events"
	get name of every shortcut
end tell
```

### Step 3: Test scripts manually

```bash
# Test list
osascript skills/shortcuts/list-shortcuts.scpt

# Test run (if you have a shortcut)
osascript skills/shortcuts/run-shortcut.scpt "Test Shortcut"

# Test run with input
osascript skills/shortcuts/run-shortcut.scpt "Process Text" "Hello World"
```

### Step 4: Commit

```bash
git add skills/shortcuts/run-shortcut.scpt skills/shortcuts/list-shortcuts.scpt
git commit -m "Add AppleScript helper scripts for Shortcuts

- run-shortcut.scpt - Run shortcut with optional input
- list-shortcuts.scpt - List all available shortcuts

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Skill Documentation

**Files:**
- Create: `skills/shortcuts/SKILL.md`

### Step 1: Create SKILL.md with standard header

```yaml
---
name: shortcuts
description: Bridge to Apple Shortcuts app - run shortcuts, Focus mode, location, iOS integrations
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---
```

```markdown
# Shortcuts/Automation Skill

> **For Claude:** This skill is the BRIDGE to Apple Shortcuts for the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

Run macOS Shortcuts automations and access system features without direct AppleScript support.

## Capabilities

- Run any macOS Shortcut by name
- List all available shortcuts
- Read current Focus mode
- Get current location (via Shortcuts bridge)
- Bridge to iOS-only capabilities (HomeKit, etc.)
- Store outputs in iCloud via lib/icloud-storage.js

## Usage

### Via Command (Manual)
```
/shortcuts run "Morning Routine"
/shortcuts run "Process Text" "Hello World"
/shortcuts list
/shortcuts focus
/shortcuts location
```

### Via Notification (Automatic)
Triggered by notification monitor for Focus mode changes or scheduled automations.

### Via Other Skills
```javascript
import { runShortcut } from '../shortcuts/lib/shortcuts.js';
import { getCurrentFocus } from '../shortcuts/lib/focus-reader.js';
import { getCurrentLocation } from '../shortcuts/lib/location-reader.js';
```

## Commands

### /shortcut <name> [input]

Run a macOS shortcut by name.

**Examples:**
```
/shortcut Morning Routine
/shortcut Process Text "Hello World"
/shortcut Send Tweet "Just deployed new feature!"
```

**WhatsApp:**
```
/claude run my Morning Routine shortcut
/c run shortcut "Get Weather"
```

### /shortcuts

List all available macOS shortcuts.

**Output:**
```
Available shortcuts:
- Morning Routine
- Get Weather
- Process Text
- Send Tweet
- Get Location for Brokkr
```

### /focus

Get current macOS Focus mode.

**Output:**
```
Current Focus: Work
```

or

```
Current Focus: No focus
```

**Possible values:**
- "No focus" - No Focus mode active
- "Work" - Work Focus mode
- "Sleep" - Sleep Focus mode
- "Personal" - Personal Time Focus mode
- "Do Not Disturb" - DND Focus mode
- Custom Focus mode names

### /location

Get current location via Shortcuts bridge.

**Output:**
```
Current location: 47.6062, -122.3321
(Seattle, WA)
```

**Note:** Requires "Get Location for Brokkr" shortcut to be created. See SETUP.md.

## Use Cases

### Bridge to iOS Automations

Shortcuts sync across iPhone and Mac. Run shortcuts that:
- Control HomeKit devices
- Send iMessages
- Interact with iOS-only apps
- Trigger automation workflows

### Focus Mode Awareness

Check Focus mode before sending notifications:
```
/claude Check my Focus mode. If I'm in Work or DND, save this for later instead of notifying me.
```

### Location-Based Actions

```
/claude Get my location and find nearby coffee shops
/claude If I'm at home, remind me to water plants
```

### Complex Multi-App Workflows

Shortcuts can orchestrate multiple apps:
- Download file → Upload to iCloud → Share link
- Get calendar events → Format → Send via email
- Scrape website → Parse data → Create reminder

## Implementation

### Modules

- `lib/shortcuts-runner.js` - Run shortcuts via AppleScript
- `lib/shortcuts-lister.js` - List available shortcuts
- `lib/focus-reader.js` - Read Focus mode via JXA
- `lib/location-reader.js` - Get location via Shortcuts bridge

### AppleScript Interface

Uses **Shortcuts Events** application for AppleScript access:

```applescript
tell application "Shortcuts Events"
    run shortcut "Shortcut Name"
end tell
```

### CLI Fallback

Can use `/usr/bin/shortcuts` CLI command as fallback:

```bash
shortcuts run "Shortcut Name"
shortcuts list
```

## Permissions

### Required Permissions

1. **Automation** - Allow Terminal to control Shortcuts Events
   - System Settings → Privacy & Security → Automation
   - Enable: Terminal → Shortcuts Events

2. **Full Disk Access** (for Focus mode reading)
   - System Settings → Privacy & Security → Full Disk Access
   - Add Terminal.app or node binary

### Permission Errors

If you see "Not authorized to send Apple events":
- Grant Automation permission in System Settings
- Restart Terminal after granting permission

If you see "Permission denied" when reading Focus mode:
- Grant Full Disk Access to Terminal
- Restart Terminal

## Known Issues

### Location Services Intermittent

The macOS Shortcuts "Get current location" action has known reliability issues in macOS 15.x. The skill retries up to 3 times with exponential backoff.

**Workaround:** If location fails repeatedly, check:
1. System Settings → Privacy & Security → Location Services → Shortcuts (enabled)
2. Try running the shortcut manually in Shortcuts app
3. Recreate the "Get Location for Brokkr" shortcut

### Focus Mode File Paths

The Focus mode reader reads from `~/Library/DoNotDisturb/DB/`. If Apple changes the file structure in future macOS versions, the JXA script may need updates.

## References

- [WWDC21 - Meet Shortcuts for macOS](https://developer.apple.com/videos/play/wwdc2021/10232/)
- [Matthew Cassinelli - Shortcuts AppleScript Commands](https://matthewcassinelli.com/shortcuts-applescript-commands/)
- [Drew Kerr - Focus Mode JXA Gist](https://gist.github.com/drewkerr/0f2b61ce34e2b9e3ce0ec6a92ab05c18)
- [Six Colors - Shortcuts, AppleScript, Terminal](https://sixcolors.com/post/2022/01/shortcuts-applescript-terminal-working-around-automation-roadblocks/)
```

### Step 2: Commit

```bash
git add skills/shortcuts/skill.md
git commit -m "Add Shortcuts skill documentation

- Command usage and examples
- Use cases for iOS bridge, Focus, Location
- Permission requirements
- Known issues and workarounds
- Reference links

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Setup Guide

**Files:**
- Create: `skills/shortcuts/SETUP.md`

### Step 1: Create SETUP.md

```markdown
# Shortcuts Skill Setup Guide

This guide walks through setting up the Shortcuts skill for Brokkr agent.

## Prerequisites

- macOS 14.8.3 (Sonoma) or later
- Shortcuts app installed (included with macOS)
- Terminal or Node.js with permissions

## Step 1: Create Location Shortcut

The `/location` command requires a custom shortcut that bridges to Location Services.

### Instructions

1. Open **Shortcuts** app
2. Click **+** to create new shortcut
3. Name it: **Get Location for Brokkr** (exact name required)
4. Add actions:
   - Search for "Get current location" → Add
   - Search for "Get details of location" → Add
   - Select: **Latitude** and **Longitude**
   - Search for "Text" → Add
   - Enter: `{"lat": [Latitude], "lon": [Longitude]}`
   - (Use Insert Variable to add Latitude/Longitude from previous action)
5. Save the shortcut

### Expected Output Format

When run, the shortcut should output JSON:
```json
{"lat": 47.6062, "lon": -122.3321}
```

### Testing

Run from command line:
```bash
shortcuts run "Get Location for Brokkr"
```

Expected: `{"lat": XX.XXXX, "lon": -YY.YYYY}`

## Step 2: Grant Permissions

### Automation Permission

Required for running shortcuts via AppleScript.

1. Open **System Settings**
2. Go to **Privacy & Security** → **Automation**
3. Find **Terminal** in the list
4. Enable: **Shortcuts Events**
5. Click **Done**
6. **Restart Terminal**

### Full Disk Access (for Focus Mode)

Required for reading Focus mode configuration files.

1. Open **System Settings**
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click **+** button
4. Add: **/Applications/Utilities/Terminal.app**
5. Toggle it **ON**
6. **Restart Terminal**

**Alternative:** If using Node directly, add the node binary instead:
```
/opt/homebrew/opt/node@22/bin/node
```

### Location Services (for Location Shortcut)

Required for "Get Location for Brokkr" shortcut to work.

1. Open **System Settings**
2. Go to **Privacy & Security** → **Location Services**
3. Ensure **Location Services** is enabled (top toggle)
4. Find **Shortcuts** in the list
5. Set to: **While Using the App**
6. Click **Details** and enable **Precise Location**

## Step 3: Verify Installation

### Test Listing Shortcuts

```bash
osascript -e 'tell application "Shortcuts Events" to get name of every shortcut'
```

Expected: Comma-separated list of shortcut names including "Get Location for Brokkr"

### Test Running a Shortcut

```bash
osascript -e 'tell application "Shortcuts Events" to run shortcut "Get Location for Brokkr"'
```

Expected: JSON output with lat/lon

### Test Focus Mode Reading

```bash
osascript -l JavaScript skills/shortcuts/get-focus.jxa
```

Expected: Current Focus mode name or "No focus"

### Test via Brokkr Commands

```bash
# Test in dry-run mode
node dry-run-test.js "/shortcuts"
node dry-run-test.js "/shortcut Get Location for Brokkr"
node dry-run-test.js "/focus"
node dry-run-test.js "/location"
```

Expected: Commands recognized and parsed correctly

## Optional: Create Additional Shortcuts

Consider creating these shortcuts for enhanced automation:

### Morning Briefing
- Get calendar events for today
- Get current weather
- Get top news headlines
- Format as text summary

### Focus Mode Control
- Set Focus mode (use "Set Focus" action if available)
- Turn off Focus mode
- Schedule Focus mode for later

### Smart Home Integration
- "Turn On Work Mode" - Lights + Focus + Music
- "Arriving Home" - Unlock door + Turn on lights + Disable Work Focus
- "Leaving Home" - Lock doors + Set Away scene

### iOS Integration
- Send iMessage via Shortcuts (syncs to iPhone)
- Control HomeKit scenes
- Trigger iOS automations remotely

## Troubleshooting

### "Not authorized to send Apple events"

**Cause:** Automation permission not granted.

**Fix:**
1. System Settings → Privacy & Security → Automation
2. Enable Terminal → Shortcuts Events
3. Restart Terminal

### "Shortcut not found"

**Cause:** Shortcut name mismatch or shortcut doesn't exist.

**Fix:**
1. Run: `shortcuts list` to see all shortcuts
2. Verify exact name (case-sensitive)
3. Ensure shortcut is saved in Shortcuts app

### "Permission denied" (Focus mode)

**Cause:** Full Disk Access not granted.

**Fix:**
1. System Settings → Privacy & Security → Full Disk Access
2. Add Terminal.app
3. Toggle ON
4. Restart Terminal

### Location returns "Unknown" or fails

**Cause:** Known macOS Shortcuts issue or Location Services disabled.

**Fix:**
1. Check Location Services enabled for Shortcuts
2. Try running shortcut manually in Shortcuts app
3. Recreate the "Get Location for Brokkr" shortcut
4. Enable Precise Location in Location Services → Shortcuts
5. Wait and retry (intermittent issue)

### Focus mode returns "Unknown"

**Cause:** DoNotDisturb database files not readable or structure changed.

**Fix:**
1. Verify Full Disk Access granted
2. Check files exist:
   - `~/Library/DoNotDisturb/DB/Assertions.json`
   - `~/Library/DoNotDisturb/DB/ModeConfigurations.json`
3. If files missing, Focus modes may not be configured

## Advanced: Custom Shortcuts

You can create custom shortcuts and run them via `/shortcut` command.

**Example - Tweet Draft:**
1. Create shortcut: "Draft Tweet"
2. Add action: "Get text from input"
3. Add action: "Set variable" → TweetText
4. Add action: "Show result" → TweetText
5. Run: `/shortcut Draft Tweet "Just shipped a new feature!"`

**Example - Screenshot to iCloud:**
1. Create shortcut: "Save Screenshot to iCloud"
2. Add action: "Get latest screenshot"
3. Add action: "Save file" → iCloud Drive/Screenshots/
4. Run: `/shortcut Save Screenshot to iCloud`

## Support

If you encounter issues not covered here:

1. Check Shortcuts app works manually
2. Review skill.md for command usage
3. Check logs: `/tmp/whatsapp-bot.log`
4. Test with dry-run: `node dry-run-test.js`

## References

- [Apple Shortcuts User Guide](https://support.apple.com/guide/shortcuts-mac/welcome/mac)
- [WWDC21 - Meet Shortcuts for macOS](https://developer.apple.com/videos/play/wwdc2021/10232/)
```

### Step 2: Commit

```bash
git add skills/shortcuts/SETUP.md
git commit -m "Add Shortcuts skill setup guide

- Step-by-step shortcut creation
- Permission configuration instructions
- Verification tests
- Troubleshooting common issues
- Advanced shortcut examples

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Integration Testing

**Manual Testing Checklist**

### Pre-flight Checks

```bash
# 1. All tests pass
npm test

# 2. Dry-run commands recognized
node dry-run-test.js "/shortcuts"
node dry-run-test.js "/shortcut Test"
node dry-run-test.js "/focus"
node dry-run-test.js "/location"
```

### Manual Testing

#### Test 1: List Shortcuts

**Steps:**
1. Ensure you have at least one shortcut in Shortcuts app
2. Run: `osascript skills/shortcuts/list-shortcuts.scpt`
3. Expected: Comma-separated list of shortcut names

**Via Brokkr:**
1. Send WhatsApp message: `/shortcuts`
2. Expected: List of available shortcuts

#### Test 2: Run a Shortcut

**Setup:**
1. Create simple test shortcut in Shortcuts app: "Test Brokkr"
2. Add action: "Show result" → "Hello from Shortcuts"

**Steps:**
1. Run: `osascript skills/shortcuts/run-shortcut.scpt "Test Brokkr"`
2. Expected: "Hello from Shortcuts"

**Via Brokkr:**
1. Send WhatsApp message: `/shortcut Test Brokkr`
2. Expected: "Hello from Shortcuts"

#### Test 3: Run Shortcut with Input

**Setup:**
1. Create shortcut: "Echo Text"
2. Add action: "Get text from input"
3. Add action: "Show result" → [input text]

**Steps:**
1. Run: `osascript skills/shortcuts/run-shortcut.scpt "Echo Text" "Testing input"`
2. Expected: "Testing input"

**Via Brokkr:**
1. Send WhatsApp message: `/shortcut Echo Text "Hello World"`
2. Expected: "Hello World"

#### Test 4: Focus Mode Reading

**Steps:**
1. Set a Focus mode manually (e.g., Work)
2. Run: `osascript -l JavaScript skills/shortcuts/get-focus.jxa`
3. Expected: "Work"
4. Turn off Focus mode
5. Run again
6. Expected: "No focus"

**Via Brokkr:**
1. Send WhatsApp message: `/focus`
2. Expected: Current Focus mode or "No focus"

#### Test 5: Location Retrieval

**Prerequisites:**
- "Get Location for Brokkr" shortcut created (see SETUP.md)
- Location Services enabled for Shortcuts

**Steps:**
1. Run: `shortcuts run "Get Location for Brokkr"`
2. Expected: JSON with lat/lon
3. Verify coordinates are within valid ranges

**Via Brokkr:**
1. Send WhatsApp message: `/location`
2. Expected: Latitude and longitude coordinates

#### Test 6: Error Handling

**Test shortcut not found:**
1. Send: `/shortcut Nonexistent Shortcut`
2. Expected: Error message with list of available shortcuts

**Test permission denied:**
1. Revoke Automation permission temporarily
2. Send: `/shortcuts`
3. Expected: Error message about granting permission
4. Re-grant permission

**Test location unavailable:**
1. Disable Location Services for Shortcuts
2. Send: `/location`
3. Expected: Error after 3 retry attempts

### Test Report Template

```markdown
## Shortcuts Skill Integration Test Report

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** macOS [version], Brokkr [version]

### Test Results

| Test | Status | Notes |
|------|--------|-------|
| List shortcuts | PASS/FAIL | |
| Run shortcut | PASS/FAIL | |
| Run with input | PASS/FAIL | |
| Focus mode | PASS/FAIL | |
| Location | PASS/FAIL | |
| Error handling | PASS/FAIL | |

### Issues Found

[List any issues encountered]

### Recommendations

[Any suggestions for improvements]
```

### Commit Test Report

```bash
# After completing tests, create report
echo "# Integration Test Report - Shortcuts Skill" > docs/tests/shortcuts-integration-test.md
# ... fill in test results ...

git add docs/tests/shortcuts-integration-test.md
git commit -m "Add integration test report for Shortcuts skill

[Summary of test results]

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Update: `CLAUDE.md`

### Step 1: Add shortcuts commands to CLAUDE.md

Find the section listing commands and add:

```markdown
## Shortcuts/Automation Commands

| Command | Description |
|---------|-------------|
| `/shortcut <name>` | Run macOS shortcut by name |
| `/shortcut <name> <input>` | Run shortcut with input |
| `/shortcuts` | List available shortcuts |
| `/focus` | Get current Focus mode |
| `/location` | Get current location (via Shortcuts bridge) |
```

### Step 2: Add to Capabilities section

```markdown
### Shortcuts/Automation

- **Shortcuts Runner**: Run macOS Shortcuts via AppleScript (Shortcuts Events)
- **Shortcuts Lister**: List all available shortcuts
- **Focus Mode Reader**: Read current Focus mode via JXA
- **Location Services**: Get location via Shortcuts bridge (workaround for broken CoreLocationCLI)
- **iOS Bridge**: Shortcuts sync across devices for iOS integration
```

### Step 3: Add permission notes

```markdown
## Permissions for Shortcuts Skill

Required permissions configured in System Settings → Privacy & Security:

1. **Automation** - Terminal → Shortcuts Events (for running shortcuts)
2. **Full Disk Access** - Terminal.app (for reading Focus mode)
3. **Location Services** - Shortcuts → While Using (for location shortcut)
```

### Step 4: Commit

```bash
git add CLAUDE.md
git commit -m "Document Shortcuts skill commands in CLAUDE.md

- Add /shortcut, /shortcuts, /focus, /location commands
- Document capabilities and permissions
- Note iOS bridge capability

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Final Verification

Before marking complete:

1. **All tests pass:**
   ```bash
   npm test
   ```

2. **Dry-run tests work:**
   ```bash
   node dry-run-test.js --interactive
   # Try: /shortcuts, /shortcut Test, /focus, /location
   ```

3. **Documentation complete:**
   - [ ] `skills/shortcuts/skill.md` exists
   - [ ] `skills/shortcuts/SETUP.md` exists
   - [ ] `CLAUDE.md` updated with new commands

4. **Files created:**
   - [ ] `lib/shortcuts-runner.js` + tests
   - [ ] `lib/shortcuts-lister.js` + tests
   - [ ] `lib/focus-reader.js` + tests
   - [ ] `lib/location-reader.js` + tests
   - [ ] `skills/shortcuts/get-focus.jxa`
   - [ ] `skills/shortcuts/run-shortcut.scpt`
   - [ ] `skills/shortcuts/list-shortcuts.scpt`

5. **Commands registered:**
   - [ ] `/shortcut` in builtin-commands.js
   - [ ] `/shortcuts` in builtin-commands.js
   - [ ] `/focus` in builtin-commands.js
   - [ ] `/location` in builtin-commands.js

6. **Git commits:**
   - [ ] All changes committed with descriptive messages
   - [ ] Co-authored by Claude Opus 4.5

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Commands recognized by message parser
- [ ] Can list shortcuts via AppleScript
- [ ] Can run shortcuts via AppleScript
- [ ] Can read Focus mode via JXA
- [ ] Can get location via Shortcuts bridge (with retry logic)
- [ ] Error messages guide user to fix permission issues
- [ ] Documentation includes setup guide
- [ ] CLAUDE.md updated with new commands

---

## Follow-up Tasks (Future Enhancements)

Not in scope for initial implementation, but worth considering:

1. **Focus Mode Setter** - Create shortcut to set Focus mode (requires UI scripting or native Shortcuts action)
2. **HomeKit Integration** - Add commands to control HomeKit scenes via Shortcuts
3. **iOS Automation Bridge** - Commands that trigger iOS-specific automations
4. **Shortcut Creation** - Programmatically create shortcuts via AppleScript
5. **Shortcut Folders** - Support for organizing shortcuts in folders
6. **Shortcut Parameters** - Support for shortcuts with multiple input parameters
7. **Background Execution** - Run shortcuts without bringing Shortcuts app to foreground
8. **Result Caching** - Cache location/focus results for short periods to reduce API calls

---

## References

### Official Documentation
- [WWDC21 - Meet Shortcuts for macOS](https://developer.apple.com/videos/play/wwdc2021/10232/) - Apple's official introduction
- [AppleScript Language Guide](https://developer.apple.com/library/archive/documentation/AppleScript/Conceptual/AppleScriptLangGuide/introduction/ASLR_intro.html) - Apple's AppleScript docs
- [Apple Shortcuts User Guide](https://support.apple.com/guide/shortcuts-mac/welcome/mac) - End-user documentation

### Community Resources
- [Matthew Cassinelli - Shortcuts AppleScript Commands](https://matthewcassinelli.com/shortcuts-applescript-commands/) - Shortcuts Events overview
- [Six Colors - Shortcuts, AppleScript, Terminal](https://sixcolors.com/post/2022/01/shortcuts-applescript-terminal-working-around-automation-roadblocks/) - Integration patterns
- [Drew Kerr - Focus Mode JXA Gist](https://gist.github.com/drewkerr/0f2b61ce34e2b9e3ce0ec6a92ab05c18) - Focus mode reading code
- [Automators Talk - Get current focus mode via script](https://talk.automators.fm/t/get-current-focus-mode-via-script/12423) - Community discussion

### Known Issues
- [Apple Community - Shortcuts "Get Current Location" issues](https://discussions.apple.com/thread/255885320) - Location reliability problems
- [Ben Ward - macOS location CLI](https://benward.uk/blog/macos-location-cli) - CoreLocationCLI broken in Ventura+
