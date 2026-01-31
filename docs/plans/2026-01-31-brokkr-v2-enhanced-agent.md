# Brokkr V2: Enhanced 24/7 Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Brokkr into a production-ready 24/7 autonomous agent with priority-based job queuing, resumable sessions with short codes, intelligent resource management, and webhook support.

**Architecture:** Single-worker serial execution with priority queue (WhatsApp > Webhooks > Cron). Sessions persist with 2-char (WhatsApp) and 3-char (webhook) codes for easy resumption. Resources (Chrome, processes) only cleanup on context switch, not within ongoing conversations. Claude Agent SDK patterns for session management and subagent support.

**Tech Stack:** Node.js, whatsapp-web.js, Express (webhooks), file-based job queue, Claude Code CLI with `--resume`, cron

---

## Design Principles

1. **Serial execution** - One task at a time to conserve RAM on dedicated machine
2. **Priority-based queue** - WhatsApp (CRITICAL) > Webhooks (HIGH) > Cron (NORMAL)
3. **Session continuity** - Keep Claude process alive within same conversation
4. **Lazy cleanup** - Only cleanup resources when switching contexts
5. **Short codes** - Human-friendly session identifiers for WhatsApp/webhook resumption
6. **Subagent-safe** - Don't kill processes that may be legitimate subagents

---

## Priority Levels

| Priority | Value | Source | Behavior |
|----------|-------|--------|----------|
| CRITICAL | 100 | WhatsApp `/claude`, `/<session>` | Immediate |
| HIGH | 75 | Webhook requests | After WhatsApp |
| NORMAL | 50 | Cron jobs, `/schedule` | After webhooks |
| LOW | 25 | Self-maintenance | When idle |

---

## Session Code Format

**WhatsApp (2-char):** Lowercase alphanumeric, no repeating chars
- Character set: `a-z0-9` (36 chars)
- Combinations: 36 × 35 = 1,260
- Examples: `k7`, `m3`, `9a`, `px`

**Webhook (3-char):** Lowercase alphanumeric, no repeating chars
- Character set: `a-z0-9` (36 chars)
- Combinations: 36 × 35 × 34 = 42,840
- Examples: `k7m`, `3ax`, `pz9`

---

## Research Notes

```
⚠️ TO RESEARCH BEFORE IMPLEMENTATION:

Claude Agent SDK Subagent Handling:
1. How does SDK track parent/child agent relationships?
2. Is there a process group or session ID we can use?
3. Should we use --resume with subagent session IDs?
4. Does SDK provide cleanup hooks (SubagentStop) we should use?
5. Can we tag processes to distinguish bot-spawned vs subagents?

References:
- https://github.com/anthropics/claude-agent-sdk-python
- https://github.com/anthropics/claude-agent-sdk-typescript
- Session resumption: query(prompt, options={resume: sessionId})
- Hooks: PreToolUse, PostToolUse, SessionStart, SessionEnd, Stop, SubagentStop
```

---

## Implementation Progress

### Phase 0: Command Factory - COMPLETE ✅

**Completed: 2026-01-31**

All Phase 0 tasks implemented with 159 tests passing:

| Task | Files | Tests | Commit |
|------|-------|-------|--------|
| 0.1: Command Schema | `lib/command-schema.js` | 21 | `641c577` |
| 0.2: Command Factory | `lib/command-factory.js` | 21 | `e64e1e3` |
| 0.3: Command Registry | `lib/command-registry.js` | 30 | `85a4e81` |
| 0.4: Argument Parser | `lib/argument-parser.js` | 30 | `48cc41f` |
| 0.5: Built-in Commands | `lib/builtin-commands.js` | 41 | `e7c6c89` |
| 0.6: Create Command Skill | `.claude/skills/create-command/SKILL.md` | - | `acfdf7a` |

### Dry-Run Integration - COMPLETE ✅

**Completed: 2026-01-31**

Integrated command parsing with `whatsapp-bot.js` and added dry-run testing capability:

**New Files:**
- `lib/message-parser.js` - Parse WhatsApp messages into command invocations
- `lib/executor.js` - Execute or dry-run commands with extensible hooks
- `lib/dry-run.js` - Pretty printing and test utilities
- `dry-run-test.js` - CLI test tool
- `tests/message-parser.test.js` - Parser tests
- `tests/executor.test.js` - Executor tests

**WhatsApp Bot Updates (`whatsapp-bot.js`):**
- Added `--dry-run` flag for testing without execution
- Added `--debug` flag for verbose logging
- Integrated `parseMessage()` for all command types
- Handles: commands, aliases, session codes, unknown commands
- Skip logic to ignore bot's own responses

**Usage:**
```bash
# Dry-run mode (parse but don't execute)
node whatsapp-bot.js --dry-run

# With debug output
node whatsapp-bot.js --dry-run --debug

# CLI testing
node dry-run-test.js --interactive
```

**Verified Commands (2026-01-31):**
- `/claude`, `/c` (alias) → Claude handler
- `/help`, `/h`, `/?` → Internal handler
- `/status`, `/s` → Internal handler
- `/research`, `/r` → Skill handler
- `/github`, `/gh` → Skill handler
- `/k7` (session code) → Session resume
- `/unknown` → Unknown command error

### Phase 1: Core Infrastructure - COMPLETE ✅

**Completed: 2026-01-31**

All Phase 1 tasks implemented with 266 tests passing (107 new tests):

| Task | Files | Tests | Commit |
|------|-------|-------|--------|
| 1.1: Session Code Generator | `lib/session-codes.js` | 14 | `bc48b3c`, `84bf0b5` |
| 1.2: Session Store | `lib/sessions.js` | 25 | `efa8763`, `b917483` |
| 1.3: Priority Queue | `lib/queue.js` | 23 | `9cb0bd1` |
| 1.4: Resource Manager | `lib/resources.js` | 29 | `b0622ca` |
| 1.5: Help Command Generator | `lib/message-parser.js` | 17 | `d1009c3` |

**Key Features Implemented:**

**Session Codes (`lib/session-codes.js`):**
- `generateCode(length)` - Generate 2-3 char codes with no repeating characters
- `isValidCode(code, expectedLength)` - Validate codes
- Input validation to prevent infinite loops

**Session Store (`lib/sessions.js`):**
- `createSession()` - WhatsApp=2-char, webhook=3-char codes
- `getSessionByCode()` - Retrieve active sessions
- `expireSessions()` - Clean up old sessions
- Atomic writes to prevent data corruption
- File-based persistence in `data/sessions.json`

**Priority Queue (`lib/queue.js`):**
- Priority levels: CRITICAL (100), HIGH (75), NORMAL (50), LOW (25)
- `enqueue()`, `getNextJob()`, `getPendingJobs()`
- `markActive()`, `markCompleted()`, `markFailed()`
- File-based queue in `jobs/` directory

**Resource Manager (`lib/resources.js`):**
- `shouldCleanup()` - Smart cleanup when switching sessions
- Process tracking: `trackProcess()`, `untrackProcess()`
- `cleanupTrackedProcesses()`, `cleanupChromeProcesses()`
- `startupCleanup()`, `fullCleanup()`

**Help System (`lib/message-parser.js`):**
- `getHelpText(command?)` - Categorized or detailed help
- `isHelpCommand()`, `parseHelpCommand()`
- Categories: tasks, sessions, scheduling, skills, help

---

## Phase 0: Command Factory (Prerequisite)

> **Note:** This phase MUST be completed before all other phases. It establishes the reusable command pattern that all commands will use.

### Task 0.1: Command Definition Schema

**Files:**
- Create: `lib/command-schema.js`
- Test: `tests/command-schema.test.js`

**Step 1: Write the failing test**

```javascript
// tests/command-schema.test.js
import { describe, it, expect } from 'vitest';
import { validateCommand, HANDLER_TYPES, PRIORITIES, SOURCES } from '../lib/command-schema.js';

describe('command schema', () => {
  it('exports valid handler types', () => {
    expect(HANDLER_TYPES).toEqual(['claude', 'skill', 'internal']);
  });

  it('exports valid priorities', () => {
    expect(PRIORITIES.CRITICAL).toBe(100);
    expect(PRIORITIES.HIGH).toBe(75);
    expect(PRIORITIES.NORMAL).toBe(50);
    expect(PRIORITIES.LOW).toBe(25);
  });

  it('exports valid sources', () => {
    expect(SOURCES).toEqual(['whatsapp', 'webhook', 'both']);
  });

  it('validates a minimal valid command', () => {
    const result = validateCommand({
      name: 'test',
      description: 'A test command',
      handler: { type: 'internal', function: 'handleTest' }
    });
    expect(result.valid).toBe(true);
  });

  it('validates a full claude command', () => {
    const result = validateCommand({
      name: 'research',
      description: 'Research a topic',
      aliases: ['r', 'search'],
      priority: 'CRITICAL',
      source: 'both',
      arguments: {
        required: ['topic'],
        optional: ['depth'],
        hint: '<topic> [depth]'
      },
      handler: {
        type: 'claude',
        prompt: 'Research $0 with depth $1'
      },
      session: {
        create: true,
        codeLength: 2
      }
    });
    expect(result.valid).toBe(true);
  });

  it('rejects command without name', () => {
    const result = validateCommand({
      description: 'No name',
      handler: { type: 'internal', function: 'test' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('rejects command with invalid name format', () => {
    const result = validateCommand({
      name: 'Invalid Name!',
      description: 'Bad name',
      handler: { type: 'internal', function: 'test' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/name must be lowercase/);
  });

  it('rejects claude handler without prompt', () => {
    const result = validateCommand({
      name: 'test',
      description: 'Missing prompt',
      handler: { type: 'claude' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('claude handler requires prompt');
  });

  it('rejects skill handler without skill name', () => {
    const result = validateCommand({
      name: 'test',
      description: 'Missing skill',
      handler: { type: 'skill' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('skill handler requires skill name');
  });

  it('rejects internal handler without function', () => {
    const result = validateCommand({
      name: 'test',
      description: 'Missing function',
      handler: { type: 'internal' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('internal handler requires function name');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/command-schema.test.js`
Expected: FAIL with "Cannot find module '../lib/command-schema.js'"

**Step 3: Write minimal implementation**

```javascript
// lib/command-schema.js

export const HANDLER_TYPES = ['claude', 'skill', 'internal'];

export const PRIORITIES = {
  CRITICAL: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25
};

export const SOURCES = ['whatsapp', 'webhook', 'both'];

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function validateCommand(definition) {
  const errors = [];

  // Required: name
  if (!definition.name) {
    errors.push('name is required');
  } else if (!NAME_PATTERN.test(definition.name)) {
    errors.push('name must be lowercase letters, numbers, and hyphens only, starting with a letter');
  }

  // Required: description
  if (!definition.description) {
    errors.push('description is required');
  }

  // Required: handler
  if (!definition.handler) {
    errors.push('handler is required');
  } else {
    if (!HANDLER_TYPES.includes(definition.handler.type)) {
      errors.push(`handler.type must be one of: ${HANDLER_TYPES.join(', ')}`);
    } else {
      // Type-specific validation
      switch (definition.handler.type) {
        case 'claude':
          if (!definition.handler.prompt) {
            errors.push('claude handler requires prompt');
          }
          break;
        case 'skill':
          if (!definition.handler.skill) {
            errors.push('skill handler requires skill name');
          }
          break;
        case 'internal':
          if (!definition.handler.function) {
            errors.push('internal handler requires function name');
          }
          break;
      }
    }
  }

  // Optional: priority
  if (definition.priority && !Object.keys(PRIORITIES).includes(definition.priority)) {
    errors.push(`priority must be one of: ${Object.keys(PRIORITIES).join(', ')}`);
  }

  // Optional: source
  if (definition.source && !SOURCES.includes(definition.source)) {
    errors.push(`source must be one of: ${SOURCES.join(', ')}`);
  }

  // Optional: aliases (must be array of strings)
  if (definition.aliases) {
    if (!Array.isArray(definition.aliases)) {
      errors.push('aliases must be an array');
    } else if (!definition.aliases.every(a => typeof a === 'string')) {
      errors.push('aliases must all be strings');
    }
  }

  // Optional: arguments
  if (definition.arguments) {
    if (definition.arguments.required && !Array.isArray(definition.arguments.required)) {
      errors.push('arguments.required must be an array');
    }
    if (definition.arguments.optional && !Array.isArray(definition.arguments.optional)) {
      errors.push('arguments.optional must be an array');
    }
  }

  // Optional: session
  if (definition.session) {
    if (definition.session.codeLength && ![2, 3].includes(definition.session.codeLength)) {
      errors.push('session.codeLength must be 2 or 3');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function applyDefaults(definition) {
  return {
    priority: 'NORMAL',
    source: 'both',
    aliases: [],
    arguments: {
      required: [],
      optional: [],
      hint: ''
    },
    session: {
      create: definition.handler?.type === 'claude',
      codeLength: 2
    },
    ...definition
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/command-schema.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/command-schema.js tests/command-schema.test.js
git commit -m "feat: add command definition schema with validation"
```

---

### Task 0.2: Command Factory

**Files:**
- Create: `lib/command-factory.js`
- Test: `tests/command-factory.test.js`

**Step 1: Write the failing test**

```javascript
// tests/command-factory.test.js
import { describe, it, expect } from 'vitest';
import { CommandFactory } from '../lib/command-factory.js';

describe('CommandFactory', () => {
  describe('claude()', () => {
    it('creates a claude-type command', () => {
      const cmd = CommandFactory.claude({
        name: 'research',
        description: 'Research a topic',
        prompt: 'Research $ARGUMENTS'
      });

      expect(cmd.name).toBe('research');
      expect(cmd.handler.type).toBe('claude');
      expect(cmd.handler.prompt).toBe('Research $ARGUMENTS');
      expect(cmd.session.create).toBe(true);
    });

    it('applies default priority CRITICAL', () => {
      const cmd = CommandFactory.claude({
        name: 'test',
        description: 'Test',
        prompt: 'Test'
      });
      expect(cmd.priority).toBe('CRITICAL');
    });

    it('allows custom priority', () => {
      const cmd = CommandFactory.claude({
        name: 'test',
        description: 'Test',
        prompt: 'Test',
        priority: 'NORMAL'
      });
      expect(cmd.priority).toBe('NORMAL');
    });
  });

  describe('skill()', () => {
    it('creates a skill-type command', () => {
      const cmd = CommandFactory.skill({
        name: 'x',
        description: 'Twitter actions',
        skill: 'x'
      });

      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('x');
    });
  });

  describe('internal()', () => {
    it('creates an internal-type command', () => {
      const cmd = CommandFactory.internal({
        name: 'help',
        description: 'Show help',
        function: 'handleHelp'
      });

      expect(cmd.handler.type).toBe('internal');
      expect(cmd.handler.function).toBe('handleHelp');
      expect(cmd.session.create).toBe(false);
    });
  });

  describe('fromJSON()', () => {
    it('creates command from JSON definition', () => {
      const json = {
        name: 'custom',
        description: 'Custom command',
        handler: { type: 'claude', prompt: 'Do $0' }
      };

      const cmd = CommandFactory.fromJSON(json);
      expect(cmd.name).toBe('custom');
      expect(cmd.handler.type).toBe('claude');
    });

    it('throws on invalid JSON', () => {
      expect(() => CommandFactory.fromJSON({ name: 'bad' }))
        .toThrow(/validation failed/i);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/command-factory.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/command-factory.js
import { validateCommand, applyDefaults } from './command-schema.js';

export const CommandFactory = {
  /**
   * Create a Claude-powered command
   * Sends prompt to Claude for processing
   */
  claude({ name, description, prompt, aliases, priority, arguments: args, source }) {
    const definition = {
      name,
      description,
      aliases: aliases || [],
      priority: priority || 'CRITICAL',
      source: source || 'both',
      arguments: args || { required: [], optional: [], hint: '' },
      handler: {
        type: 'claude',
        prompt
      },
      session: {
        create: true,
        codeLength: 2
      }
    };

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Create a skill-invoking command
   * Invokes an existing Claude Code skill
   */
  skill({ name, description, skill, aliases, priority, arguments: args, source }) {
    const definition = {
      name,
      description,
      aliases: aliases || [],
      priority: priority || 'CRITICAL',
      source: source || 'both',
      arguments: args || { required: [], optional: [], hint: '' },
      handler: {
        type: 'skill',
        skill
      },
      session: {
        create: true,
        codeLength: 2
      }
    };

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Create an internal handler command
   * Calls a built-in function (no Claude invocation)
   */
  internal({ name, description, function: fn, aliases }) {
    const definition = {
      name,
      description,
      aliases: aliases || [],
      priority: 'CRITICAL', // Internal commands are instant
      source: 'both',
      handler: {
        type: 'internal',
        function: fn
      },
      session: {
        create: false
      }
    };

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Create command from raw JSON definition
   * Used for loading from .brokkr/commands/ files
   */
  fromJSON(json) {
    const definition = applyDefaults(json);

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  }
};
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/command-factory.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/command-factory.js tests/command-factory.test.js
git commit -m "feat: add command factory with claude/skill/internal builders"
```

---

### Task 0.3: Command Registry

**Files:**
- Create: `lib/command-registry.js`
- Test: `tests/command-registry.test.js`

**Step 1: Write the failing test**

```javascript
// tests/command-registry.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { CommandRegistry } from '../lib/command-registry.js';
import { CommandFactory } from '../lib/command-factory.js';

describe('CommandRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('register()', () => {
    it('registers a command', () => {
      const cmd = CommandFactory.internal({
        name: 'test',
        description: 'Test command',
        function: 'handleTest'
      });

      registry.register(cmd);
      expect(registry.get('test')).toEqual(cmd);
    });

    it('registers aliases', () => {
      const cmd = CommandFactory.internal({
        name: 'help',
        description: 'Show help',
        function: 'handleHelp',
        aliases: ['h', '?']
      });

      registry.register(cmd);
      expect(registry.get('h')).toEqual(cmd);
      expect(registry.get('?')).toEqual(cmd);
    });

    it('throws on duplicate name', () => {
      const cmd1 = CommandFactory.internal({
        name: 'test',
        description: 'Test 1',
        function: 'handle1'
      });
      const cmd2 = CommandFactory.internal({
        name: 'test',
        description: 'Test 2',
        function: 'handle2'
      });

      registry.register(cmd1);
      expect(() => registry.register(cmd2)).toThrow(/already registered/i);
    });
  });

  describe('get()', () => {
    it('returns null for unknown command', () => {
      expect(registry.get('unknown')).toBeNull();
    });

    it('is case-insensitive', () => {
      const cmd = CommandFactory.internal({
        name: 'help',
        description: 'Help',
        function: 'handleHelp'
      });

      registry.register(cmd);
      expect(registry.get('HELP')).toEqual(cmd);
      expect(registry.get('Help')).toEqual(cmd);
    });
  });

  describe('list()', () => {
    it('lists all commands', () => {
      registry.register(CommandFactory.internal({
        name: 'help',
        description: 'Help',
        function: 'handleHelp'
      }));
      registry.register(CommandFactory.internal({
        name: 'status',
        description: 'Status',
        function: 'handleStatus'
      }));

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map(c => c.name)).toContain('help');
      expect(list.map(c => c.name)).toContain('status');
    });

    it('filters by source', () => {
      registry.register(CommandFactory.internal({
        name: 'whatsapp-only',
        description: 'WA only',
        function: 'handle',
        source: 'whatsapp'
      }));
      registry.register(CommandFactory.internal({
        name: 'both',
        description: 'Both',
        function: 'handle',
        source: 'both'
      }));

      const waCommands = registry.list('whatsapp');
      expect(waCommands.map(c => c.name)).toContain('whatsapp-only');
      expect(waCommands.map(c => c.name)).toContain('both');
    });
  });

  describe('has()', () => {
    it('returns true for registered command', () => {
      registry.register(CommandFactory.internal({
        name: 'test',
        description: 'Test',
        function: 'handle'
      }));

      expect(registry.has('test')).toBe(true);
      expect(registry.has('unknown')).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/command-registry.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/command-registry.js
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CommandFactory } from './command-factory.js';

export class CommandRegistry {
  constructor() {
    this.commands = new Map();  // name -> command
    this.aliases = new Map();   // alias -> name
  }

  /**
   * Register a command definition
   */
  register(definition) {
    const name = definition.name.toLowerCase();

    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }

    // Check alias conflicts
    for (const alias of (definition.aliases || [])) {
      const lowerAlias = alias.toLowerCase();
      if (this.aliases.has(lowerAlias) || this.commands.has(lowerAlias)) {
        throw new Error(`Alias "${alias}" conflicts with existing command or alias`);
      }
    }

    // Register command
    this.commands.set(name, definition);

    // Register aliases
    for (const alias of (definition.aliases || [])) {
      this.aliases.set(alias.toLowerCase(), name);
    }

    return this;
  }

  /**
   * Get command by name or alias (case-insensitive)
   */
  get(nameOrAlias) {
    const lower = nameOrAlias.toLowerCase();

    // Direct name match
    if (this.commands.has(lower)) {
      return this.commands.get(lower);
    }

    // Alias match
    if (this.aliases.has(lower)) {
      const name = this.aliases.get(lower);
      return this.commands.get(name);
    }

    return null;
  }

  /**
   * Check if command exists
   */
  has(nameOrAlias) {
    return this.get(nameOrAlias) !== null;
  }

  /**
   * List all commands, optionally filtered by source
   */
  list(source = null) {
    const commands = Array.from(this.commands.values());

    if (!source) {
      return commands;
    }

    return commands.filter(cmd => {
      return cmd.source === source || cmd.source === 'both';
    });
  }

  /**
   * Discover and load commands from .brokkr/commands/ directory
   */
  discover(basePath = process.cwd()) {
    const commandsDir = join(basePath, '.brokkr', 'commands');

    if (!existsSync(commandsDir)) {
      return this;
    }

    const dirs = readdirSync(commandsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const commandFile = join(commandsDir, dir, 'command.json');

      if (existsSync(commandFile)) {
        try {
          const json = JSON.parse(readFileSync(commandFile, 'utf-8'));
          const definition = CommandFactory.fromJSON(json);
          this.register(definition);
        } catch (err) {
          console.error(`Failed to load command from ${commandFile}:`, err.message);
        }
      }
    }

    return this;
  }

  /**
   * Get help text for all commands
   */
  getHelpText() {
    const commands = this.list().sort((a, b) => a.name.localeCompare(b.name));

    let text = 'Available Commands:\n\n';

    for (const cmd of commands) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
      const hint = cmd.arguments?.hint ? ` ${cmd.arguments.hint}` : '';

      text += `/${cmd.name}${hint}${aliases}\n`;
      text += `  ${cmd.description}\n\n`;
    }

    return text.trim();
  }
}

// Singleton instance
let defaultRegistry = null;

export function getDefaultRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = new CommandRegistry();
  }
  return defaultRegistry;
}

export function setDefaultRegistry(registry) {
  defaultRegistry = registry;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/command-registry.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/command-registry.js tests/command-registry.test.js
git commit -m "feat: add command registry with discovery and aliases"
```

---

### Task 0.4: Argument Parser

**Files:**
- Create: `lib/argument-parser.js`
- Test: `tests/argument-parser.test.js`

**Step 1: Write the failing test**

```javascript
// tests/argument-parser.test.js
import { describe, it, expect } from 'vitest';
import { parseArguments, substituteArguments } from '../lib/argument-parser.js';

describe('parseArguments', () => {
  it('parses simple arguments', () => {
    const result = parseArguments('hello world');
    expect(result).toEqual(['hello', 'world']);
  });

  it('handles quoted strings', () => {
    const result = parseArguments('hello "world tour" test');
    expect(result).toEqual(['hello', 'world tour', 'test']);
  });

  it('handles single quotes', () => {
    const result = parseArguments("hello 'world tour' test");
    expect(result).toEqual(['hello', 'world tour', 'test']);
  });

  it('handles empty input', () => {
    expect(parseArguments('')).toEqual([]);
    expect(parseArguments('   ')).toEqual([]);
  });

  it('handles URLs', () => {
    const result = parseArguments('summarize https://example.com/page?q=1');
    expect(result).toEqual(['summarize', 'https://example.com/page?q=1']);
  });
});

describe('substituteArguments', () => {
  it('substitutes $ARGUMENTS', () => {
    const result = substituteArguments(
      'Research $ARGUMENTS thoroughly',
      ['AI', 'agents']
    );
    expect(result).toBe('Research AI agents thoroughly');
  });

  it('substitutes positional $0, $1, $2', () => {
    const result = substituteArguments(
      'Compare $0 with $1 and $2',
      ['apples', 'oranges', 'bananas']
    );
    expect(result).toBe('Compare apples with oranges and bananas');
  });

  it('handles missing positional args', () => {
    const result = substituteArguments(
      'Value: $0, Optional: $1',
      ['first']
    );
    expect(result).toBe('Value: first, Optional: ');
  });

  it('substitutes ${SESSION_CODE}', () => {
    const result = substituteArguments(
      'Session: ${SESSION_CODE}',
      [],
      { sessionCode: 'k7' }
    );
    expect(result).toBe('Session: k7');
  });

  it('handles default values ${1:-default}', () => {
    const result = substituteArguments(
      'Depth: ${1:-medium}',
      ['topic']
    );
    expect(result).toBe('Depth: medium');
  });

  it('uses provided value over default', () => {
    const result = substituteArguments(
      'Depth: ${1:-medium}',
      ['topic', 'deep']
    );
    expect(result).toBe('Depth: deep');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/argument-parser.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/argument-parser.js

/**
 * Parse argument string into array, respecting quotes
 */
export function parseArguments(argString) {
  if (!argString || !argString.trim()) {
    return [];
  }

  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of argString) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Substitute argument placeholders in a template string
 *
 * Supports:
 * - $ARGUMENTS - All arguments joined with space
 * - $0, $1, $2 - Positional arguments
 * - ${N:-default} - Positional with default value
 * - ${SESSION_CODE} - Current session code
 */
export function substituteArguments(template, args, context = {}) {
  let result = template;

  // Replace $ARGUMENTS with all args joined
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // Replace ${N:-default} patterns (with defaults)
  result = result.replace(/\$\{(\d+):-([^}]*)\}/g, (match, index, defaultVal) => {
    const idx = parseInt(index, 10);
    return args[idx] !== undefined ? args[idx] : defaultVal;
  });

  // Replace $N and ${N} patterns (positional)
  result = result.replace(/\$\{?(\d+)\}?/g, (match, index) => {
    const idx = parseInt(index, 10);
    return args[idx] !== undefined ? args[idx] : '';
  });

  // Replace ${SESSION_CODE}
  if (context.sessionCode) {
    result = result.replace(/\$\{SESSION_CODE\}/g, context.sessionCode);
  }

  return result;
}

/**
 * Validate arguments against command definition
 */
export function validateArguments(args, definition) {
  const errors = [];
  const argDef = definition.arguments || {};
  const required = argDef.required || [];

  if (args.length < required.length) {
    const missing = required.slice(args.length);
    errors.push(`Missing required argument(s): ${missing.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/argument-parser.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/argument-parser.js tests/argument-parser.test.js
git commit -m "feat: add argument parser with substitution support"
```

---

### Task 0.5: Built-in Commands Registration

**Files:**
- Create: `lib/builtin-commands.js`

**Step 1: Create built-in commands**

```javascript
// lib/builtin-commands.js
import { CommandFactory } from './command-factory.js';
import { getDefaultRegistry } from './command-registry.js';

/**
 * Register all built-in commands
 */
export function registerBuiltinCommands(registry = getDefaultRegistry()) {
  // /claude <task> - Primary command
  registry.register(CommandFactory.claude({
    name: 'claude',
    description: 'Run a new Claude task',
    prompt: '$ARGUMENTS',
    aliases: ['c'],
    arguments: {
      required: ['task'],
      optional: [],
      hint: '<task>'
    }
  }));

  // /help [command] - Show help
  registry.register(CommandFactory.internal({
    name: 'help',
    description: 'Show available commands',
    function: 'handleHelp',
    aliases: ['h', '?']
  }));

  // /status - Bot status
  registry.register(CommandFactory.internal({
    name: 'status',
    description: 'Show bot status and queue',
    function: 'handleStatus',
    aliases: ['s']
  }));

  // /sessions - List active sessions
  registry.register(CommandFactory.internal({
    name: 'sessions',
    description: 'List active sessions',
    function: 'handleSessions'
  }));

  // /schedule - Schedule tasks
  registry.register(CommandFactory.claude({
    name: 'schedule',
    description: 'Schedule a task to run later',
    prompt: 'Schedule the following task: $ARGUMENTS',
    arguments: {
      required: ['time', 'task'],
      optional: [],
      hint: 'at <time> <task>'
    },
    priority: 'NORMAL'
  }));

  // Skill-based commands
  registry.register(CommandFactory.skill({
    name: 'research',
    description: 'Research a topic on the web',
    skill: 'research',
    aliases: ['r'],
    arguments: {
      required: ['topic'],
      optional: [],
      hint: '<topic>'
    }
  }));

  registry.register(CommandFactory.skill({
    name: 'x',
    description: 'Twitter/X actions',
    skill: 'x',
    aliases: ['twitter'],
    arguments: {
      required: ['action'],
      optional: [],
      hint: '<action>'
    }
  }));

  registry.register(CommandFactory.skill({
    name: 'github',
    description: 'GitHub actions',
    skill: 'github',
    aliases: ['gh'],
    arguments: {
      required: ['action'],
      optional: [],
      hint: '<action>'
    }
  }));

  registry.register(CommandFactory.skill({
    name: 'email',
    description: 'Email actions via iCloud',
    skill: 'email',
    arguments: {
      required: ['action'],
      optional: [],
      hint: '<action>'
    }
  }));

  registry.register(CommandFactory.skill({
    name: 'youtube',
    description: 'YouTube search and transcripts',
    skill: 'youtube',
    aliases: ['yt'],
    arguments: {
      required: ['query'],
      optional: [],
      hint: '<query>'
    }
  }));

  return registry;
}
```

**Step 2: Commit**

```bash
git add lib/builtin-commands.js
git commit -m "feat: add built-in command registrations"
```

---

### Task 0.6: Create Command Skill

**Files:**
- Create: `.claude/skills/create-command/SKILL.md`

**Step 1: Create the skill**

```markdown
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
  const def = require('./.brokkr/commands/$0/command.json');
  const { validateCommand } = require('./lib/command-schema.js');
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
  const { CommandRegistry } = require('./lib/command-registry.js');
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
```

**Step 2: Create directory and commit**

```bash
mkdir -p .claude/skills/create-command
# Write SKILL.md content
git add .claude/skills/create-command/
git commit -m "feat: add create-command skill for command creation"
```

---

## Phase 1: Core Infrastructure

### Task 1.1: Session Code Generator

**Files:**
- Create: `lib/session-codes.js`
- Test: `tests/session-codes.test.js`

**Step 1: Write the failing test**

```javascript
// tests/session-codes.test.js
import { describe, it, expect } from 'vitest';
import { generateCode, isValidCode } from '../lib/session-codes.js';

describe('generateCode', () => {
  it('generates 2-char code with no repeating characters', () => {
    const code = generateCode(2);
    expect(code).toHaveLength(2);
    expect(code[0]).not.toBe(code[1]);
    expect(code).toMatch(/^[a-z0-9]{2}$/);
  });

  it('generates 3-char code with no repeating characters', () => {
    const code = generateCode(3);
    expect(code).toHaveLength(3);
    const chars = code.split('');
    expect(new Set(chars).size).toBe(3); // All unique
    expect(code).toMatch(/^[a-z0-9]{3}$/);
  });

  it('generates unique codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode(2));
    }
    expect(codes.size).toBeGreaterThan(90); // Most should be unique
  });
});

describe('isValidCode', () => {
  it('validates correct 2-char codes', () => {
    expect(isValidCode('k7', 2)).toBe(true);
    expect(isValidCode('m3', 2)).toBe(true);
  });

  it('rejects codes with repeating chars', () => {
    expect(isValidCode('aa', 2)).toBe(false);
    expect(isValidCode('111', 3)).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidCode('k7m', 2)).toBe(false);
    expect(isValidCode('k7', 3)).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(isValidCode('K7', 2)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/session-codes.test.js`
Expected: FAIL with "Cannot find module '../lib/session-codes.js'"

**Step 3: Write minimal implementation**

```javascript
// lib/session-codes.js
const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateCode(length) {
  let code = '';
  const available = CHARSET.split('');

  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * available.length);
    code += available[idx];
    available.splice(idx, 1); // Remove used char
  }

  return code;
}

export function isValidCode(code, expectedLength) {
  if (typeof code !== 'string') return false;
  if (code.length !== expectedLength) return false;
  if (!/^[a-z0-9]+$/.test(code)) return false;

  // Check for repeating characters
  const chars = code.split('');
  if (new Set(chars).size !== chars.length) return false;

  return true;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/session-codes.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/session-codes.js tests/session-codes.test.js
git commit -m "feat: add session code generator with unique char constraint"
```

---

### Task 1.2: Session Store

**Files:**
- Create: `lib/sessions.js`
- Create: `data/sessions.json` (auto-generated)
- Test: `tests/sessions.test.js`

**Step 1: Write the failing test**

```javascript
// tests/sessions.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  getSessionByCode,
  listSessions,
  updateSessionActivity,
  expireSessions
} from '../lib/sessions.js';

describe('sessions', () => {
  beforeEach(() => {
    // Clear sessions before each test
  });

  it('creates WhatsApp session with 2-char code', () => {
    const session = createSession({
      type: 'whatsapp',
      task: 'Research AI agents',
      chatId: 'user123'
    });

    expect(session.code).toHaveLength(2);
    expect(session.type).toBe('whatsapp');
    expect(session.task).toBe('Research AI agents');
    expect(session.sessionId).toBeDefined();
  });

  it('creates webhook session with 3-char code', () => {
    const session = createSession({
      type: 'webhook',
      task: 'Process payment',
      source: 'stripe'
    });

    expect(session.code).toHaveLength(3);
    expect(session.type).toBe('webhook');
  });

  it('retrieves session by code', () => {
    const created = createSession({ type: 'whatsapp', task: 'Test' });
    const retrieved = getSessionByCode(created.code);

    expect(retrieved.sessionId).toBe(created.sessionId);
  });

  it('lists active sessions', () => {
    createSession({ type: 'whatsapp', task: 'Task 1' });
    createSession({ type: 'whatsapp', task: 'Task 2' });

    const sessions = listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('expires old sessions', () => {
    const session = createSession({ type: 'whatsapp', task: 'Old task' });
    // Manually set lastActivity to 25 hours ago
    session.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    expireSessions(24 * 60 * 60 * 1000); // 24 hour expiry

    expect(getSessionByCode(session.code)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/sessions.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/sessions.js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateCode, isValidCode } from './session-codes.js';

const DATA_DIR = join(process.cwd(), 'data');
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function generateUniqueCode(length, existingCodes) {
  let code;
  let attempts = 0;
  do {
    code = generateCode(length);
    attempts++;
  } while (existingCodes.has(code) && attempts < 100);
  return code;
}

export function createSession({ type, task, chatId, source, sessionId }) {
  const sessions = loadSessions();
  const existingCodes = new Set(Object.keys(sessions));

  const codeLength = type === 'webhook' ? 3 : 2;
  const code = generateUniqueCode(codeLength, existingCodes);

  const session = {
    code,
    type,
    task,
    chatId: chatId || null,
    source: source || null,
    sessionId: sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    status: 'active'
  };

  sessions[code] = session;
  saveSessions(sessions);

  return session;
}

export function getSession(sessionId) {
  const sessions = loadSessions();
  return Object.values(sessions).find(s => s.sessionId === sessionId) || null;
}

export function getSessionByCode(code) {
  const sessions = loadSessions();
  const session = sessions[code];
  if (!session || session.status !== 'active') return null;
  return session;
}

export function listSessions(type = null) {
  const sessions = loadSessions();
  return Object.values(sessions)
    .filter(s => s.status === 'active')
    .filter(s => !type || s.type === type)
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export function updateSessionActivity(code, updates = {}) {
  const sessions = loadSessions();
  if (sessions[code]) {
    sessions[code].lastActivity = new Date().toISOString();
    Object.assign(sessions[code], updates);
    saveSessions(sessions);
    return sessions[code];
  }
  return null;
}

export function updateSessionClaudeId(code, claudeSessionId) {
  return updateSessionActivity(code, { claudeSessionId });
}

export function expireSessions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const sessions = loadSessions();
  const now = Date.now();
  let expiredCount = 0;

  for (const [code, session] of Object.entries(sessions)) {
    if (session.status === 'active') {
      const age = now - new Date(session.lastActivity).getTime();
      if (age > maxAgeMs) {
        sessions[code].status = 'expired';
        expiredCount++;
      }
    }
  }

  saveSessions(sessions);
  return expiredCount;
}

export function endSession(code) {
  const sessions = loadSessions();
  if (sessions[code]) {
    sessions[code].status = 'ended';
    sessions[code].endedAt = new Date().toISOString();
    saveSessions(sessions);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/sessions.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/sessions.js tests/sessions.test.js
git commit -m "feat: add session store with short code lookup"
```

---

### Task 1.3: Priority Queue

**Files:**
- Modify: `lib/queue.js`
- Test: `tests/queue.test.js`

**Step 1: Write the failing test**

```javascript
// tests/queue.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, getNextJob, getPendingJobs, PRIORITY } from '../lib/queue.js';

describe('priority queue', () => {
  it('defines priority levels', () => {
    expect(PRIORITY.CRITICAL).toBe(100);
    expect(PRIORITY.HIGH).toBe(75);
    expect(PRIORITY.NORMAL).toBe(50);
    expect(PRIORITY.LOW).toBe(25);
  });

  it('enqueues with default NORMAL priority', () => {
    const job = enqueue({ task: 'test', chatId: 'user1' });
    expect(job.priority).toBe(PRIORITY.NORMAL);
  });

  it('enqueues with specified priority', () => {
    const job = enqueue({ task: 'urgent', chatId: 'user1', priority: PRIORITY.CRITICAL });
    expect(job.priority).toBe(PRIORITY.CRITICAL);
  });

  it('getNextJob returns highest priority first', () => {
    enqueue({ task: 'low', priority: PRIORITY.LOW, source: 'cron' });
    enqueue({ task: 'critical', priority: PRIORITY.CRITICAL, source: 'whatsapp' });
    enqueue({ task: 'high', priority: PRIORITY.HIGH, source: 'webhook' });

    const next = getNextJob();
    expect(next.task).toBe('critical');
    expect(next.priority).toBe(PRIORITY.CRITICAL);
  });

  it('returns older job when priorities equal', () => {
    const job1 = enqueue({ task: 'first', priority: PRIORITY.NORMAL });
    const job2 = enqueue({ task: 'second', priority: PRIORITY.NORMAL });

    const next = getNextJob();
    expect(next.id).toBe(job1.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/queue.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/queue.js
import { writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const JOBS_DIR = join(process.cwd(), 'jobs');
const ACTIVE_DIR = join(JOBS_DIR, 'active');
const COMPLETED_DIR = join(JOBS_DIR, 'completed');
const FAILED_DIR = join(JOBS_DIR, 'failed');

// Ensure directories exist
[JOBS_DIR, ACTIVE_DIR, COMPLETED_DIR, FAILED_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

export const PRIORITY = {
  CRITICAL: 100,  // WhatsApp /claude, /<session>
  HIGH: 75,       // Webhooks
  NORMAL: 50,     // Cron jobs
  LOW: 25         // Self-maintenance
};

export function enqueue(job) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobData = {
    id,
    ...job,
    priority: job.priority ?? PRIORITY.NORMAL,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const jobFile = join(JOBS_DIR, `${id}.json`);
  writeFileSync(jobFile, JSON.stringify(jobData, null, 2));

  return jobData;
}

export function getPendingJobs() {
  if (!existsSync(JOBS_DIR)) return [];

  return readdirSync(JOBS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(j => j.status === 'pending')
    .sort((a, b) => {
      // Sort by priority DESC, then createdAt ASC
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function getNextJob() {
  const pending = getPendingJobs();
  return pending[0] || null;
}

export function markActive(id) {
  const src = join(JOBS_DIR, `${id}.json`);
  const dest = join(ACTIVE_DIR, `${id}.json`);

  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'active';
    job.startedAt = new Date().toISOString();
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
    return job;
  }
  return null;
}

export function markCompleted(id, result) {
  const src = join(ACTIVE_DIR, `${id}.json`);
  const dest = join(COMPLETED_DIR, `${id}.json`);

  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = typeof result === 'string' ? result.slice(0, 10000) : result;
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
    return job;
  }
  return null;
}

export function markFailed(id, error) {
  const src = join(ACTIVE_DIR, `${id}.json`);
  const dest = join(FAILED_DIR, `${id}.json`);

  if (existsSync(src)) {
    const job = JSON.parse(readFileSync(src, 'utf-8'));
    job.status = 'failed';
    job.failedAt = new Date().toISOString();
    job.error = typeof error === 'string' ? error.slice(0, 2000) : String(error);
    writeFileSync(dest, JSON.stringify(job, null, 2));
    unlinkSync(src);
    return job;
  }
  return null;
}

export function getActiveJob() {
  if (!existsSync(ACTIVE_DIR)) return null;

  const files = readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;

  return JSON.parse(readFileSync(join(ACTIVE_DIR, files[0]), 'utf-8'));
}

export function getQueueDepth() {
  return getPendingJobs().length;
}

export function expireOldJobs(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  // Clean up completed/failed jobs older than maxAge
  [COMPLETED_DIR, FAILED_DIR].forEach(dir => {
    if (!existsSync(dir)) return;

    readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
      const filepath = join(dir, f);
      try {
        const job = JSON.parse(readFileSync(filepath, 'utf-8'));
        const completedAt = job.completedAt || job.failedAt;
        if (completedAt && Date.now() - new Date(completedAt).getTime() > maxAgeMs) {
          unlinkSync(filepath);
        }
      } catch {
        // Ignore parse errors
      }
    });
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/queue.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/queue.js tests/queue.test.js
git commit -m "feat: add priority-based job queue"
```

---

### Task 1.4: Resource Manager

**Files:**
- Create: `lib/resources.js`
- Test: `tests/resources.test.js`

**Step 1: Write the failing test**

```javascript
// tests/resources.test.js
import { describe, it, expect } from 'vitest';
import {
  shouldCleanup,
  trackProcess,
  untrackProcess,
  getTrackedPids,
  cleanupTrackedProcesses
} from '../lib/resources.js';

describe('resource manager', () => {
  it('should cleanup when switching to different session', () => {
    expect(shouldCleanup({
      currentSessionCode: 'k7',
      incomingSessionCode: 'm3',
      hasActiveProcess: true
    })).toBe(true);
  });

  it('should NOT cleanup when continuing same session', () => {
    expect(shouldCleanup({
      currentSessionCode: 'k7',
      incomingSessionCode: 'k7',
      hasActiveProcess: true
    })).toBe(false);
  });

  it('should cleanup when no current session', () => {
    expect(shouldCleanup({
      currentSessionCode: null,
      incomingSessionCode: 'k7',
      hasActiveProcess: false
    })).toBe(true);
  });

  it('tracks spawned PIDs', () => {
    trackProcess(12345);
    trackProcess(12346);

    const pids = getTrackedPids();
    expect(pids).toContain(12345);
    expect(pids).toContain(12346);
  });

  it('untracks PIDs', () => {
    trackProcess(99999);
    untrackProcess(99999);

    expect(getTrackedPids()).not.toContain(99999);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/resources.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/resources.js
import { execSync } from 'child_process';
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

// Track PIDs of processes we spawn (not subagents)
const trackedPids = new Set();

export function trackProcess(pid) {
  trackedPids.add(pid);
}

export function untrackProcess(pid) {
  trackedPids.delete(pid);
}

export function getTrackedPids() {
  return Array.from(trackedPids);
}

export function shouldCleanup({ currentSessionCode, incomingSessionCode, hasActiveProcess }) {
  // No cleanup needed if continuing same session
  if (currentSessionCode && incomingSessionCode === currentSessionCode && hasActiveProcess) {
    return false;
  }
  // Cleanup needed for all other cases
  return true;
}

export function cleanupTrackedProcesses() {
  for (const pid of trackedPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may already be dead
    }
  }
  trackedPids.clear();
}

export function cleanupChromeProcesses() {
  try {
    // Only kill Chrome for Testing (Puppeteer), not user's Chrome
    execSync('pkill -f "Google Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
}

export function cleanupTempFiles() {
  try {
    // Clean up old Puppeteer temp files
    execSync('find /tmp -name "puppeteer*" -mmin +60 -delete 2>/dev/null || true', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
}

export function cleanupCompletedJobs(maxAgeDays = 7) {
  const dirs = ['jobs/completed', 'jobs/failed'];
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  for (const dir of dirs) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) continue;

    try {
      execSync(`find "${fullPath}" -name "*.json" -mtime +${maxAgeDays} -delete 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {
      // Ignore errors
    }
  }
}

export function cleanupOrphanedActiveJobs() {
  // Move jobs stuck in active back to pending (from crashed processes)
  const activeDir = join(process.cwd(), 'jobs', 'active');
  const jobsDir = join(process.cwd(), 'jobs');

  if (!existsSync(activeDir)) return 0;

  const files = readdirSync(activeDir).filter(f => f.endsWith('.json'));
  let recovered = 0;

  for (const file of files) {
    try {
      const src = join(activeDir, file);
      const dest = join(jobsDir, file);
      // Just move back to pending
      const fs = require('fs');
      const job = JSON.parse(fs.readFileSync(src, 'utf-8'));
      job.status = 'pending';
      job.retryCount = (job.retryCount || 0) + 1;
      fs.writeFileSync(dest, JSON.stringify(job, null, 2));
      fs.unlinkSync(src);
      recovered++;
    } catch {
      // Ignore individual file errors
    }
  }

  return recovered;
}

export function fullCleanup() {
  cleanupTrackedProcesses();
  cleanupChromeProcesses();
  cleanupTempFiles();
}

export function startupCleanup() {
  cleanupChromeProcesses();
  cleanupTempFiles();
  const recovered = cleanupOrphanedActiveJobs();
  return { recovered };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/resources.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/resources.js tests/resources.test.js
git commit -m "feat: add resource manager with smart cleanup"
```

---

### Task 1.5: Help Command Generator

**Files:**
- Create: `lib/help.js`

**Step 1: Create help module**

```javascript
// lib/help.js

const COMMANDS = {
  tasks: {
    '/claude <task>': 'Run a new task',
    '/<xx>': 'Resume session (e.g., /k7)',
    '/<xx> <msg>': 'Continue session with message'
  },
  sessions: {
    '/sessions': 'List active sessions',
    '/status': 'Bot status & queue'
  },
  scheduling: {
    '/schedule at <time> <task>': 'Schedule task',
    '/schedule list': 'Show scheduled tasks',
    '/schedule remove <id>': 'Remove schedule'
  },
  skills: {
    '/research <topic>': 'Web research',
    '/x <action>': 'Twitter/X actions',
    '/github <action>': 'GitHub actions',
    '/email <action>': 'iCloud email',
    '/youtube <query>': 'YouTube search'
  },
  help: {
    '/help': 'Show this message',
    '/help <command>': 'Get details on a command'
  }
};

export function getHelpText(command = null) {
  if (command) {
    return getCommandHelp(command);
  }

  let text = 'Brokkr Commands:\n\n';

  for (const [category, cmds] of Object.entries(COMMANDS)) {
    text += `${category.toUpperCase()}\n`;
    for (const [cmd, desc] of Object.entries(cmds)) {
      text += `${cmd} - ${desc}\n`;
    }
    text += '\n';
  }

  text += 'Type /help <command> for details.';

  return text;
}

function getCommandHelp(command) {
  const cmd = command.toLowerCase().replace(/^\//, '');

  const details = {
    'claude': `
/claude <task>

Run a new Claude Code task. The task will be queued and processed.
You'll receive a session code (e.g., k7) to continue the conversation.

Examples:
  /claude research AI agent frameworks
  /claude fix the login bug in auth.js
  /claude summarize my emails
`,
    'sessions': `
/sessions

List all active sessions with their codes and task summaries.
Use the session code to resume a conversation.

Example output:
  k7 - Research AI agents (2 min ago)
  m3 - Debug login bug (15 min ago)
`,
    'status': `
/status

Show bot status including:
- Current task (if any)
- Queue depth
- Uptime
- Memory usage
`,
    'schedule': `
/schedule at <time> <task>
/schedule list
/schedule remove <id>

Schedule tasks to run automatically.

Time formats:
  at 3pm - Today at 3pm
  at 15:30 - Today at 15:30
  every day at 9am - Daily
  every monday at 10am - Weekly

Examples:
  /schedule at 6pm check my email
  /schedule every day at 9am summarize hacker news
`,
    'help': `
/help [command]

Show available commands or get details on a specific command.

Examples:
  /help - Show all commands
  /help claude - Get details on /claude
  /help schedule - Get details on /schedule
`
  };

  return details[cmd] || `Unknown command: ${command}\n\nType /help for available commands.`;
}

export function isHelpCommand(text) {
  return /^\/help(\s|$)/i.test(text.trim());
}

export function parseHelpCommand(text) {
  const match = text.trim().match(/^\/help\s*(.*)$/i);
  return match ? match[1].trim() || null : null;
}
```

**Step 2: Commit**

```bash
git add lib/help.js
git commit -m "feat: add help command generator"
```

---

## Phase 2: Worker System ✅ COMPLETE

**Completed:** 2026-01-31
**Tests Added:** 43 (20 worker + 23 busy-handler)
**Commits:**
- `aa97ae3` - feat: add serial worker with session continuity
- `f893da8` - feat: add busy state handler

### Task 2.1: Serial Worker with Session Continuity ✅

**Files:**
- Rewrite: `lib/worker.js`
- Test: `tests/worker.test.js`

**Step 1: Write the implementation**

```javascript
// lib/worker.js
import { spawn } from 'child_process';
import { markActive, markCompleted, markFailed, getNextJob, getActiveJob, PRIORITY } from './queue.js';
import { getSessionByCode, updateSessionActivity, updateSessionClaudeId, createSession } from './sessions.js';
import { shouldCleanup, fullCleanup, trackProcess, untrackProcess } from './resources.js';

const WORKSPACE = process.cwd();
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max

let currentSessionCode = null;
let currentProcess = null;
let sendMessageCallback = null;

export function setSendMessageCallback(fn) {
  sendMessageCallback = fn;
}

export function getCurrentSessionCode() {
  return currentSessionCode;
}

export function isProcessing() {
  return currentProcess !== null;
}

export function getCurrentTask() {
  const job = getActiveJob();
  return job ? job.task : null;
}

async function sendMessage(chatId, message) {
  if (sendMessageCallback) {
    try {
      await sendMessageCallback(chatId, message);
    } catch (err) {
      console.error('[Worker] Failed to send message:', err.message);
    }
  }
}

export async function processNextJob() {
  // Already processing
  if (currentProcess) return false;

  const job = getNextJob();
  if (!job) return false;

  // Check if we need cleanup
  const needsCleanup = shouldCleanup({
    currentSessionCode,
    incomingSessionCode: job.sessionCode || null,
    hasActiveProcess: false // Process ended if we're here
  });

  if (needsCleanup) {
    fullCleanup();
  }

  // Mark job as active
  markActive(job.id);

  // Build Claude command args
  const args = ['-p', job.task, '--dangerously-skip-permissions'];

  // Add --resume if continuing session
  if (job.sessionCode) {
    const session = getSessionByCode(job.sessionCode);
    if (session?.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }
  }

  console.log(`[Worker] Starting job ${job.id}: ${job.task.slice(0, 50)}...`);

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: WORKSPACE,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;
    currentSessionCode = job.sessionCode || null;
    trackProcess(child.pid);

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 5000);
    }, TASK_TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();

      // Try to capture Claude session ID from output
      const sessionMatch = stdout.match(/session[_-]?id[:\s]+([a-zA-Z0-9_-]+)/i);
      if (sessionMatch && job.sessionCode) {
        updateSessionClaudeId(job.sessionCode, sessionMatch[1]);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      clearTimeout(timeout);
      untrackProcess(child.pid);
      currentProcess = null;

      const result = (stdout || stderr || 'Done (no output)')
        .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI codes

      if (killed) {
        markFailed(job.id, 'Task timed out after 30 minutes');
        await sendMessage(job.chatId, `Task timed out: ${job.task.slice(0, 50)}...`);
      } else if (code !== 0) {
        markFailed(job.id, `Exit code ${code}: ${result.slice(0, 500)}`);
        await sendMessage(job.chatId, result);
      } else {
        markCompleted(job.id, result);

        // Update session activity
        if (job.sessionCode) {
          updateSessionActivity(job.sessionCode);
        }

        await sendMessage(job.chatId, result);
      }

      console.log(`[Worker] Finished job ${job.id} (code: ${code})`);
      resolve(true);
    });

    child.on('error', async (err) => {
      clearTimeout(timeout);
      untrackProcess(child.pid);
      currentProcess = null;

      markFailed(job.id, err.message);
      await sendMessage(job.chatId, `Error: ${err.message}`);

      resolve(false);
    });
  });
}

export function killCurrentProcess() {
  if (currentProcess) {
    try {
      currentProcess.kill('SIGTERM');
      setTimeout(() => {
        try { currentProcess?.kill('SIGKILL'); } catch {}
      }, 5000);
    } catch {}
    currentProcess = null;
  }
}
```

**Step 2: Commit**

```bash
git add lib/worker.js
git commit -m "feat: add serial worker with session continuity"
```

---

### Task 2.2: Busy State Handler ✅

**Files:**
- Create: `lib/busy-handler.js`

**Step 1: Create busy handler**

```javascript
// lib/busy-handler.js
import { isProcessing, getCurrentTask, getCurrentSessionCode } from './worker.js';
import { getQueueDepth } from './queue.js';

export function getBusyMessage(queuePosition = null) {
  const currentTask = getCurrentTask();
  const taskSummary = currentTask
    ? currentTask.slice(0, 50) + (currentTask.length > 50 ? '...' : '')
    : 'a task';

  let message = `Working on: "${taskSummary}"`;

  if (queuePosition !== null && queuePosition > 0) {
    message += `\nYour message is queued (#${queuePosition}) and will run next.`;
  } else {
    message += `\nYour message will be prioritized once complete.`;
  }

  return message;
}

export function shouldSendBusyMessage() {
  return isProcessing();
}

export function getStatusMessage() {
  const processing = isProcessing();
  const currentTask = getCurrentTask();
  const queueDepth = getQueueDepth();
  const currentSession = getCurrentSessionCode();

  let status = processing ? 'BUSY' : 'IDLE';

  let message = `Bot Status: ${status}\n`;

  if (processing && currentTask) {
    message += `Current: ${currentTask.slice(0, 50)}...\n`;
    if (currentSession) {
      message += `Session: ${currentSession}\n`;
    }
  }

  message += `Queue: ${queueDepth} pending`;

  return message;
}
```

**Step 2: Commit**

```bash
git add lib/busy-handler.js
git commit -m "feat: add busy state handler"
```

---

## Phase 3: WhatsApp Bot Integration ✅ COMPLETE

**Completed:** 2026-01-31
**Commits:**
- `9efc9a7` - feat: rewrite whatsapp bot with queue/worker integration

**Notes:**
- Task 3.1 (Command Parser) was already implemented in Phase 0/1 with a more sophisticated system:
  - `lib/message-parser.js` - Message parsing with session resume, help text
  - `lib/command-registry.js` - Extensible command registration
  - `lib/builtin-commands.js` - Built-in commands (claude, help, status, etc.)
  - `lib/argument-parser.js` - Argument parsing
- Task 3.2 (WhatsApp Bot) was rewritten to integrate queue/worker/sessions

### Task 3.1: Command Parser (Already complete from Phase 0/1)

**Files:**
- Create: `lib/commands.js`
- Test: `tests/commands.test.js`

**Step 1: Write the failing test**

```javascript
// tests/commands.test.js
import { describe, it, expect } from 'vitest';
import { parseCommand, COMMAND_TYPE } from '../lib/commands.js';

describe('parseCommand', () => {
  it('parses /claude command', () => {
    const result = parseCommand('/claude research AI agents');
    expect(result.type).toBe(COMMAND_TYPE.CLAUDE);
    expect(result.task).toBe('research AI agents');
  });

  it('parses /help command', () => {
    const result = parseCommand('/help');
    expect(result.type).toBe(COMMAND_TYPE.HELP);
    expect(result.args).toBe(null);
  });

  it('parses /help with argument', () => {
    const result = parseCommand('/help schedule');
    expect(result.type).toBe(COMMAND_TYPE.HELP);
    expect(result.args).toBe('schedule');
  });

  it('parses /sessions command', () => {
    const result = parseCommand('/sessions');
    expect(result.type).toBe(COMMAND_TYPE.SESSIONS);
  });

  it('parses /status command', () => {
    const result = parseCommand('/status');
    expect(result.type).toBe(COMMAND_TYPE.STATUS);
  });

  it('parses 2-char session code', () => {
    const result = parseCommand('/k7');
    expect(result.type).toBe(COMMAND_TYPE.SESSION_RESUME);
    expect(result.sessionCode).toBe('k7');
    expect(result.message).toBe(null);
  });

  it('parses 2-char session code with message', () => {
    const result = parseCommand('/k7 what about agents?');
    expect(result.type).toBe(COMMAND_TYPE.SESSION_RESUME);
    expect(result.sessionCode).toBe('k7');
    expect(result.message).toBe('what about agents?');
  });

  it('parses 3-char webhook session code', () => {
    const result = parseCommand('/k7m continue please');
    expect(result.type).toBe(COMMAND_TYPE.SESSION_RESUME);
    expect(result.sessionCode).toBe('k7m');
    expect(result.message).toBe('continue please');
  });

  it('returns unknown for non-commands', () => {
    const result = parseCommand('hello there');
    expect(result.type).toBe(COMMAND_TYPE.UNKNOWN);
  });

  it('returns unknown for empty message', () => {
    const result = parseCommand('');
    expect(result.type).toBe(COMMAND_TYPE.UNKNOWN);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```javascript
// lib/commands.js
import { isValidCode } from './session-codes.js';

export const COMMAND_TYPE = {
  CLAUDE: 'claude',
  HELP: 'help',
  SESSIONS: 'sessions',
  STATUS: 'status',
  SESSION_RESUME: 'session_resume',
  SCHEDULE: 'schedule',
  UNKNOWN: 'unknown'
};

export function parseCommand(text) {
  if (!text || typeof text !== 'string') {
    return { type: COMMAND_TYPE.UNKNOWN };
  }

  const trimmed = text.trim();

  // Not a command
  if (!trimmed.startsWith('/')) {
    return { type: COMMAND_TYPE.UNKNOWN };
  }

  const lower = trimmed.toLowerCase();

  // /claude <task>
  if (lower.startsWith('/claude ')) {
    const task = trimmed.slice(8).trim();
    return { type: COMMAND_TYPE.CLAUDE, task };
  }

  // /help [command]
  if (lower === '/help' || lower.startsWith('/help ')) {
    const args = trimmed.slice(5).trim() || null;
    return { type: COMMAND_TYPE.HELP, args };
  }

  // /sessions
  if (lower === '/sessions') {
    return { type: COMMAND_TYPE.SESSIONS };
  }

  // /status
  if (lower === '/status') {
    return { type: COMMAND_TYPE.STATUS };
  }

  // /schedule ...
  if (lower.startsWith('/schedule')) {
    const args = trimmed.slice(9).trim();
    return { type: COMMAND_TYPE.SCHEDULE, args };
  }

  // Session codes: /<code> [message]
  // Try 3-char first (webhook), then 2-char (whatsapp)
  const sessionMatch = trimmed.match(/^\/([a-z0-9]{2,3})(?:\s+(.*))?$/i);
  if (sessionMatch) {
    const code = sessionMatch[1].toLowerCase();
    const message = sessionMatch[2]?.trim() || null;

    // Validate it's a proper session code (no repeating chars)
    if (isValidCode(code, code.length)) {
      return {
        type: COMMAND_TYPE.SESSION_RESUME,
        sessionCode: code,
        message
      };
    }
  }

  return { type: COMMAND_TYPE.UNKNOWN };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/commands.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/commands.js tests/commands.test.js
git commit -m "feat: add command parser with session code support"
```

---

### Task 3.2: Main WhatsApp Bot

**Files:**
- Rewrite: `whatsapp-bot.js`

**Step 1: Write the implementation**

```javascript
// whatsapp-bot.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

import { parseCommand, COMMAND_TYPE } from './lib/commands.js';
import { enqueue, PRIORITY, getQueueDepth } from './lib/queue.js';
import { createSession, getSessionByCode, listSessions, expireSessions } from './lib/sessions.js';
import { processNextJob, setSendMessageCallback, isProcessing, getCurrentTask, getCurrentSessionCode } from './lib/worker.js';
import { startupCleanup } from './lib/resources.js';
import { getHelpText } from './lib/help.js';
import { getBusyMessage, getStatusMessage } from './lib/busy-handler.js';

const WORKSPACE = process.cwd();
const LOCKFILE = join(WORKSPACE, 'bot.lock');
const POLL_INTERVAL_MS = 2000;
const QUEUE_PROCESS_INTERVAL_MS = 1000;

// ============================================================================
// SINGLE INSTANCE LOCK
// ============================================================================
function acquireLock() {
  if (existsSync(LOCKFILE)) {
    const pidStr = readFileSync(LOCKFILE, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);

    try {
      process.kill(pid, 0);
      console.error(`Bot already running (PID ${pid}). Exiting.`);
      process.exit(1);
    } catch {
      console.log(`Removing stale lockfile (PID ${pid} not running)`);
      unlinkSync(LOCKFILE);
    }
  }

  writeFileSync(LOCKFILE, String(process.pid));
  console.log(`Acquired lock (PID ${process.pid})`);
}

function releaseLock() {
  try {
    if (existsSync(LOCKFILE)) {
      const pidStr = readFileSync(LOCKFILE, 'utf-8').trim();
      if (parseInt(pidStr, 10) === process.pid) {
        unlinkSync(LOCKFILE);
        console.log('Released lock');
      }
    }
  } catch {}
}

// ============================================================================
// STARTUP
// ============================================================================
acquireLock();

const cleanupResult = startupCleanup();
if (cleanupResult.recovered > 0) {
  console.log(`Recovered ${cleanupResult.recovered} orphaned jobs`);
}

// ============================================================================
// WHATSAPP CLIENT
// ============================================================================
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032721183-alpha.html'
  },
  puppeteer: {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Safe send with chunking
async function safeSendMessage(chatId, message, retries = 3) {
  const MAX_LENGTH = 4000;
  const chunks = [];

  for (let i = 0; i < message.length; i += MAX_LENGTH) {
    chunks.push(message.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    for (let i = 0; i < retries; i++) {
      try {
        await client.sendMessage(chatId, chunk, { sendSeen: false });
        break;
      } catch (err) {
        console.error(`Send attempt ${i + 1} failed:`, err.message);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
}

setSendMessageCallback(safeSendMessage);

// ============================================================================
// MESSAGE HANDLING
// ============================================================================
let lastMessageId = null;
let isInitialized = false;

async function handleCommand(command, chatId) {
  switch (command.type) {
    case COMMAND_TYPE.CLAUDE: {
      // Create new session
      const session = createSession({
        type: 'whatsapp',
        task: command.task,
        chatId
      });

      // Check if busy
      if (isProcessing()) {
        const queuePos = getQueueDepth() + 1;
        enqueue({
          task: command.task,
          chatId,
          sessionCode: session.code,
          source: 'whatsapp',
          priority: PRIORITY.CRITICAL
        });
        await safeSendMessage(chatId,
          `${getBusyMessage(queuePos)}\nSession: ${session.code}`
        );
      } else {
        enqueue({
          task: command.task,
          chatId,
          sessionCode: session.code,
          source: 'whatsapp',
          priority: PRIORITY.CRITICAL
        });
        await safeSendMessage(chatId, `Starting... Session: ${session.code}`);
      }
      break;
    }

    case COMMAND_TYPE.SESSION_RESUME: {
      const session = getSessionByCode(command.sessionCode);

      if (!session) {
        await safeSendMessage(chatId, `Session ${command.sessionCode} not found or expired.`);
        return;
      }

      const task = command.message || 'continue';

      // Check if continuing current session (no cleanup needed)
      const currentSession = getCurrentSessionCode();
      const isSameSession = currentSession === command.sessionCode;

      if (isProcessing() && !isSameSession) {
        const queuePos = getQueueDepth() + 1;
        enqueue({
          task,
          chatId,
          sessionCode: command.sessionCode,
          source: 'whatsapp',
          priority: PRIORITY.CRITICAL
        });
        await safeSendMessage(chatId, getBusyMessage(queuePos));
      } else {
        enqueue({
          task,
          chatId,
          sessionCode: command.sessionCode,
          source: 'whatsapp',
          priority: PRIORITY.CRITICAL
        });
        if (!isSameSession) {
          await safeSendMessage(chatId, `Resuming session ${command.sessionCode}...`);
        }
      }
      break;
    }

    case COMMAND_TYPE.HELP: {
      const helpText = getHelpText(command.args);
      await safeSendMessage(chatId, helpText);
      break;
    }

    case COMMAND_TYPE.SESSIONS: {
      const sessions = listSessions('whatsapp');

      if (sessions.length === 0) {
        await safeSendMessage(chatId, 'No active sessions.');
        return;
      }

      let text = 'Active Sessions:\n\n';
      for (const s of sessions.slice(0, 10)) {
        const age = getTimeAgo(s.lastActivity);
        text += `${s.code} - ${s.task.slice(0, 40)}... (${age})\n`;
      }

      await safeSendMessage(chatId, text);
      break;
    }

    case COMMAND_TYPE.STATUS: {
      const status = getStatusMessage();
      await safeSendMessage(chatId, status);
      break;
    }

    case COMMAND_TYPE.SCHEDULE: {
      // TODO: Implement scheduling
      await safeSendMessage(chatId, 'Scheduling coming soon. Use /help schedule for info.');
      break;
    }

    default:
      // Ignore unknown commands
      break;
  }
}

function getTimeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day ago`;
}

async function pollForMessages() {
  try {
    const chats = await client.getChats();
    const selfChat = chats.find(c => c.id._serialized.endsWith('@lid'));
    const myId = client.info?.wid?._serialized;

    if (!selfChat || !myId) return;

    const messages = await selfChat.fetchMessages({ limit: 5 });

    // Skip existing messages on first poll
    if (!isInitialized && messages.length > 0) {
      lastMessageId = messages[0]?.id._serialized;
      isInitialized = true;
      console.log('Skipped existing messages on startup');
      return;
    }

    for (const msg of messages.reverse()) {
      if (msg.id._serialized === lastMessageId) continue;
      if (!msg.fromMe) continue;

      lastMessageId = msg.id._serialized;

      const command = parseCommand(msg.body.trim());
      if (command.type !== COMMAND_TYPE.UNKNOWN) {
        await handleCommand(command, myId);
      }
    }
  } catch (err) {
    // Ignore polling errors
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================
client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log(`Loading: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
  console.log('Authenticated!');
});

client.on('auth_failure', msg => {
  console.error('Auth failure:', msg);
  releaseLock();
  process.exit(1);
});

client.on('disconnected', (reason) => {
  console.error('Disconnected:', reason);
  releaseLock();
  process.exit(1);
});

client.on('ready', async () => {
  console.log('\nWhatsApp READY!');
  console.log('Workspace:', WORKSPACE);
  console.log('\nCommands: /claude, /help, /sessions, /status');
  console.log('Send /help for full command list\n');

  // Start polling
  setInterval(pollForMessages, POLL_INTERVAL_MS);

  // Process queue
  setInterval(async () => {
    if (!isProcessing()) {
      await processNextJob();
    }
  }, QUEUE_PROCESS_INTERVAL_MS);

  // Expire old sessions hourly
  setInterval(() => expireSessions(), 60 * 60 * 1000);

  // Send startup message
  try {
    const myId = client.info?.wid?._serialized;
    if (myId) {
      await safeSendMessage(myId, 'Bot online! Send /help for commands.');
    }
  } catch {}
});

// ============================================================================
// SHUTDOWN HANDLERS
// ============================================================================
process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  releaseLock();
  client.destroy().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Received SIGINT');
  releaseLock();
  client.destroy().then(() => process.exit(0));
});

process.on('exit', releaseLock);

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  releaseLock();
  process.exit(1);
});

// ============================================================================
// START
// ============================================================================
console.log('Starting Brokkr WhatsApp Bot...\n');
client.initialize();
```

**Step 2: Commit**

```bash
git add whatsapp-bot.js
git commit -m "feat: rewrite whatsapp bot with priority queue and sessions"
```

---

## Phase 4: Webhook Server

### Task 4.1: Express Webhook Server

**Files:**
- Create: `lib/webhook-server.js`
- Modify: `package.json` (add express dependency)

**Step 1: Add express dependency**

Run: `npm install express`

**Step 2: Create webhook server**

```javascript
// lib/webhook-server.js
import express from 'express';
import { enqueue, PRIORITY, getQueueDepth } from './queue.js';
import { createSession, getSessionByCode, updateSessionActivity } from './sessions.js';
import { isProcessing, getCurrentTask } from './worker.js';

const app = express();
app.use(express.json());

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', processing: isProcessing(), queueDepth: getQueueDepth() });
});

// New webhook task
app.post('/webhook', (req, res) => {
  const { task, source, metadata } = req.body;

  if (!task) {
    return res.status(400).json({ error: 'task is required' });
  }

  // Create 3-char webhook session
  const session = createSession({
    type: 'webhook',
    task,
    source: source || 'external'
  });

  // Enqueue with HIGH priority
  const job = enqueue({
    task,
    sessionCode: session.code,
    source: 'webhook',
    priority: PRIORITY.HIGH,
    metadata
  });

  res.json({
    success: true,
    jobId: job.id,
    sessionCode: session.code,
    queuePosition: getQueueDepth()
  });
});

// Continue webhook session
app.post('/webhook/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;
  const { message } = req.body;

  const session = getSessionByCode(sessionCode);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  if (session.type !== 'webhook') {
    return res.status(400).json({ error: 'Not a webhook session' });
  }

  const task = message || 'continue';

  const job = enqueue({
    task,
    sessionCode,
    source: 'webhook',
    priority: PRIORITY.HIGH
  });

  updateSessionActivity(sessionCode);

  res.json({
    success: true,
    jobId: job.id,
    sessionCode,
    queuePosition: getQueueDepth()
  });
});

// Get session status
app.get('/webhook/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;
  const session = getSessionByCode(sessionCode);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  res.json({
    sessionCode: session.code,
    type: session.type,
    task: session.task,
    status: session.status,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  });
});

export function startWebhookServer() {
  return new Promise((resolve) => {
    app.listen(WEBHOOK_PORT, () => {
      console.log(`Webhook server listening on port ${WEBHOOK_PORT}`);
      resolve();
    });
  });
}

export { app };
```

**Step 3: Commit**

```bash
git add lib/webhook-server.js package.json package-lock.json
git commit -m "feat: add webhook server for external integrations"
```

---

## Phase 5: Testing & Documentation

### Task 5.1: Setup Vitest

**Step 1: Install vitest**

Run: `npm install -D vitest`

**Step 2: Add test script to package.json**

Add to scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for testing"
```

---

### Task 5.2: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md with new architecture**

```markdown
# Brokkr Agent System Prompt

## Agent Identity

You are **Brokkr**, an autonomous AI agent running 24/7 on a dedicated MacBook Pro. You are controlled via WhatsApp messages and webhooks.

## Credentials

- **Email**: brokkrassist@icloud.com
- **Password**: TommyismyMaster1!
- **GitHub Username**: brokkr-agent

## Architecture

**Serial Execution:** One task at a time to conserve RAM.

**Priority Queue:**
| Priority | Source | Value |
|----------|--------|-------|
| CRITICAL | WhatsApp | 100 |
| HIGH | Webhooks | 75 |
| NORMAL | Cron | 50 |
| LOW | Maintenance | 25 |

**Session Codes:**
- WhatsApp: 2-char (e.g., `k7`)
- Webhook: 3-char (e.g., `k7m`)

**Resource Management:**
- Cleanup only on context switch
- Same session = keep process alive
- Chrome killed between different tasks

## WhatsApp Commands

| Command | Description |
|---------|-------------|
| `/claude <task>` | New task |
| `/<xx>` | Resume session |
| `/<xx> <msg>` | Continue session |
| `/sessions` | List sessions |
| `/status` | Bot status |
| `/help` | Show commands |

## Webhook API

- `POST /webhook` - New task (returns 3-char session code)
- `POST /webhook/<xxx>` - Continue session
- `GET /webhook/<xxx>` - Session status
- `GET /health` - Health check

## Files

- `whatsapp-bot.js` - Main entry point
- `lib/queue.js` - Priority job queue
- `lib/sessions.js` - Session management
- `lib/worker.js` - Task execution
- `lib/resources.js` - Cleanup management
- `lib/webhook-server.js` - HTTP API
- `lib/commands.js` - Command parser
- `lib/help.js` - Help text
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with v2 architecture"
```

---

## Final Verification Checklist

Before marking implementation complete, verify:

**Phase 0: Command Factory**
- [ ] Command schema validates correct definitions
- [ ] Command schema rejects invalid definitions
- [ ] Command factory creates handlers from JSON definitions
- [ ] Argument parser substitutes $0, $1, ${N:-default} correctly
- [ ] Command registry loads and resolves commands by name/alias
- [ ] Built-in commands register correctly
- [ ] All Phase 0 tests pass: `npm test -- tests/command-*.test.js tests/argument-parser.test.js tests/builtin-commands.test.js`

**Phase 1-5: Core System**
- [ ] Bot starts without errors: `node whatsapp-bot.js`
- [ ] Lock file prevents duplicate instances
- [ ] `/claude` creates session with 2-char code
- [ ] `/k7` resumes session correctly
- [ ] `/k7 message` continues session without cleanup
- [ ] `/help` shows all commands (dynamically from registry)
- [ ] `/sessions` lists active sessions
- [ ] `/status` shows current state
- [ ] Busy message shown when task running
- [ ] Queue respects priorities
- [ ] Webhook server responds on /health
- [ ] POST /webhook creates 3-char session
- [ ] All tests pass: `npm test`

---

## Directory Structure

```
/Users/brokkrbot/brokkr-agent/
├── .claude/
│   └── skills/
│       └── create-command/
│           └── SKILL.md
├── lib/
│   ├── argument-parser.js      # Phase 0: Argument substitution
│   ├── builtin-commands.js     # Phase 0: Built-in command registration
│   ├── busy-handler.js
│   ├── command-factory.js      # Phase 0: Create handlers from JSON
│   ├── command-registry.js     # Phase 0: Command storage/lookup
│   ├── command-schema.js       # Phase 0: JSON schema validation
│   ├── commands.js             # Phase 1: WhatsApp command parser
│   ├── help.js                 # Phase 2: Dynamic help from registry
│   ├── queue.js
│   ├── resources.js
│   ├── session-codes.js
│   ├── sessions.js
│   ├── webhook-server.js
│   └── worker.js
├── tests/
│   ├── argument-parser.test.js
│   ├── builtin-commands.test.js
│   ├── command-factory.test.js
│   ├── command-registry.test.js
│   ├── command-schema.test.js
│   ├── commands.test.js
│   ├── queue.test.js
│   ├── resources.test.js
│   ├── session-codes.test.js
│   └── sessions.test.js
├── data/
│   └── sessions.json
├── jobs/
│   ├── active/
│   ├── completed/
│   └── failed/
├── docs/
│   └── plans/
│       └── 2026-01-31-brokkr-v2-enhanced-agent.md
├── whatsapp-bot.js
├── CLAUDE.md
├── IMPLEMENTATION_PLAN.md (old, preserved)
├── package.json
└── bot.lock (runtime)
```

---

*Document created: 2026-01-31*
*Author: Claude (Opus 4.5) for Brokkr Agent*
