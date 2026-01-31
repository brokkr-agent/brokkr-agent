import { CommandRegistry, getDefaultRegistry, setDefaultRegistry } from '../lib/command-registry.js';
import { CommandFactory } from '../lib/command-factory.js';
import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('CommandRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('constructor()', () => {
    test('creates commands Map', () => {
      expect(registry.commands).toBeInstanceOf(Map);
    });

    test('creates aliases Map', () => {
      expect(registry.aliases).toBeInstanceOf(Map);
    });
  });

  describe('register()', () => {
    test('registers a command', () => {
      const command = CommandFactory.claude({
        name: 'test-command',
        description: 'A test command',
        prompt: 'Do something'
      });

      registry.register(command);

      expect(registry.commands.has('test-command')).toBe(true);
      expect(registry.commands.get('test-command')).toEqual(command);
    });

    test('registers command name as lowercase', () => {
      const command = {
        name: 'TEST-COMMAND',
        description: 'A test command',
        handler: { type: 'claude', prompt: 'Do something' },
        aliases: []
      };

      registry.register(command);

      expect(registry.commands.has('test-command')).toBe(true);
      expect(registry.commands.has('TEST-COMMAND')).toBe(false);
    });

    test('registers aliases', () => {
      const command = CommandFactory.claude({
        name: 'test-command',
        description: 'A test command',
        prompt: 'Do something',
        aliases: ['tc', 'test']
      });

      registry.register(command);

      expect(registry.aliases.has('tc')).toBe(true);
      expect(registry.aliases.has('test')).toBe(true);
      expect(registry.aliases.get('tc')).toBe('test-command');
      expect(registry.aliases.get('test')).toBe('test-command');
    });

    test('registers aliases as lowercase', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: { type: 'claude', prompt: 'Do something' },
        aliases: ['TC', 'TEST']
      };

      registry.register(command);

      expect(registry.aliases.has('tc')).toBe(true);
      expect(registry.aliases.has('test')).toBe(true);
    });

    test('throws on duplicate name', () => {
      const command1 = CommandFactory.claude({
        name: 'test-command',
        description: 'First command',
        prompt: 'Do something'
      });

      const command2 = CommandFactory.claude({
        name: 'test-command',
        description: 'Second command',
        prompt: 'Do something else'
      });

      registry.register(command1);

      expect(() => registry.register(command2)).toThrow(/already registered/i);
    });

    test('throws when alias conflicts with existing command name', () => {
      const command1 = CommandFactory.claude({
        name: 'help',
        description: 'Show help',
        prompt: 'Show help'
      });

      const command2 = CommandFactory.claude({
        name: 'other-command',
        description: 'Another command',
        prompt: 'Do something',
        aliases: ['help']
      });

      registry.register(command1);

      expect(() => registry.register(command2)).toThrow(/already registered|conflicts/i);
    });

    test('throws when alias conflicts with existing alias', () => {
      const command1 = CommandFactory.claude({
        name: 'command-one',
        description: 'First command',
        prompt: 'Do something',
        aliases: ['c1']
      });

      const command2 = CommandFactory.claude({
        name: 'command-two',
        description: 'Second command',
        prompt: 'Do something else',
        aliases: ['c1']
      });

      registry.register(command1);

      expect(() => registry.register(command2)).toThrow(/already registered|conflicts/i);
    });

    test('returns this for chaining', () => {
      const command = CommandFactory.claude({
        name: 'test-command',
        description: 'A test command',
        prompt: 'Do something'
      });

      const result = registry.register(command);

      expect(result).toBe(registry);
    });
  });

  describe('get()', () => {
    beforeEach(() => {
      const command = CommandFactory.claude({
        name: 'test-command',
        description: 'A test command',
        prompt: 'Do something',
        aliases: ['tc']
      });
      registry.register(command);
    });

    test('returns command by name', () => {
      const result = registry.get('test-command');

      expect(result).not.toBeNull();
      expect(result.name).toBe('test-command');
    });

    test('returns command by alias', () => {
      const result = registry.get('tc');

      expect(result).not.toBeNull();
      expect(result.name).toBe('test-command');
    });

    test('returns null for unknown command', () => {
      const result = registry.get('unknown-command');

      expect(result).toBeNull();
    });

    test('is case-insensitive for name', () => {
      const result = registry.get('TEST-COMMAND');

      expect(result).not.toBeNull();
      expect(result.name).toBe('test-command');
    });

    test('is case-insensitive for alias', () => {
      const result = registry.get('TC');

      expect(result).not.toBeNull();
      expect(result.name).toBe('test-command');
    });
  });

  describe('has()', () => {
    beforeEach(() => {
      const command = CommandFactory.claude({
        name: 'test-command',
        description: 'A test command',
        prompt: 'Do something',
        aliases: ['tc']
      });
      registry.register(command);
    });

    test('returns true for registered command', () => {
      expect(registry.has('test-command')).toBe(true);
    });

    test('returns true for alias', () => {
      expect(registry.has('tc')).toBe(true);
    });

    test('returns false for unknown command', () => {
      expect(registry.has('unknown-command')).toBe(false);
    });

    test('is case-insensitive', () => {
      expect(registry.has('TEST-COMMAND')).toBe(true);
      expect(registry.has('TC')).toBe(true);
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      registry.register(CommandFactory.claude({
        name: 'whatsapp-only',
        description: 'WhatsApp only command',
        prompt: 'Do something',
        source: 'whatsapp'
      }));

      registry.register(CommandFactory.claude({
        name: 'webhook-only',
        description: 'Webhook only command',
        prompt: 'Do something',
        source: 'webhook'
      }));

      registry.register(CommandFactory.claude({
        name: 'both-sources',
        description: 'Both sources command',
        prompt: 'Do something',
        source: 'both'
      }));
    });

    test('lists all commands when no source provided', () => {
      const commands = registry.list();

      expect(commands).toHaveLength(3);
      expect(commands.map(c => c.name)).toContain('whatsapp-only');
      expect(commands.map(c => c.name)).toContain('webhook-only');
      expect(commands.map(c => c.name)).toContain('both-sources');
    });

    test('filters by source whatsapp', () => {
      const commands = registry.list('whatsapp');

      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.name)).toContain('whatsapp-only');
      expect(commands.map(c => c.name)).toContain('both-sources');
      expect(commands.map(c => c.name)).not.toContain('webhook-only');
    });

    test('filters by source webhook', () => {
      const commands = registry.list('webhook');

      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.name)).toContain('webhook-only');
      expect(commands.map(c => c.name)).toContain('both-sources');
      expect(commands.map(c => c.name)).not.toContain('whatsapp-only');
    });

    test('includes "both" commands in any source filter', () => {
      const whatsappCommands = registry.list('whatsapp');
      const webhookCommands = registry.list('webhook');

      expect(whatsappCommands.map(c => c.name)).toContain('both-sources');
      expect(webhookCommands.map(c => c.name)).toContain('both-sources');
    });
  });

  describe('discover()', () => {
    const testBasePath = '/tmp/brokkr-test-discover';

    beforeEach(() => {
      // Create test directory structure
      if (fs.existsSync(testBasePath)) {
        fs.rmSync(testBasePath, { recursive: true });
      }
      fs.mkdirSync(path.join(testBasePath, '.brokkr', 'commands', 'test-cmd'), { recursive: true });
    });

    afterEach(() => {
      // Cleanup
      if (fs.existsSync(testBasePath)) {
        fs.rmSync(testBasePath, { recursive: true });
      }
    });

    test('loads commands from .brokkr/commands/*/command.json', () => {
      const commandJson = {
        name: 'discovered-cmd',
        description: 'A discovered command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      fs.writeFileSync(
        path.join(testBasePath, '.brokkr', 'commands', 'test-cmd', 'command.json'),
        JSON.stringify(commandJson)
      );

      registry.discover(testBasePath);

      expect(registry.has('discovered-cmd')).toBe(true);
      const cmd = registry.get('discovered-cmd');
      expect(cmd.name).toBe('discovered-cmd');
    });

    test('returns this for chaining', () => {
      const result = registry.discover(testBasePath);

      expect(result).toBe(registry);
    });

    test('handles missing .brokkr directory gracefully', () => {
      const emptyPath = '/tmp/brokkr-test-empty';
      if (fs.existsSync(emptyPath)) {
        fs.rmSync(emptyPath, { recursive: true });
      }
      fs.mkdirSync(emptyPath, { recursive: true });

      expect(() => registry.discover(emptyPath)).not.toThrow();

      fs.rmSync(emptyPath, { recursive: true });
    });
  });

  describe('getHelpText()', () => {
    test('returns formatted help text for all commands', () => {
      registry.register(CommandFactory.claude({
        name: 'test-cmd',
        description: 'A test command description',
        prompt: 'Do something',
        aliases: ['tc', 't'],
        arguments: {
          required: [],
          optional: [],
          hint: '<arg>'
        }
      }));

      const helpText = registry.getHelpText();

      expect(helpText).toContain('/test-cmd');
      expect(helpText).toContain('<arg>');
      expect(helpText).toContain('tc');
      expect(helpText).toContain('t');
      expect(helpText).toContain('A test command description');
    });

    test('formats help text with hint and aliases', () => {
      registry.register(CommandFactory.claude({
        name: 'example',
        description: 'Example command',
        prompt: 'Do something',
        aliases: ['ex'],
        arguments: {
          required: [],
          optional: [],
          hint: '<task>'
        }
      }));

      const helpText = registry.getHelpText();

      // Format: /name hint (aliases)\n  description\n\n
      expect(helpText).toMatch(/\/example\s+<task>\s+\(ex\)/);
      expect(helpText).toMatch(/\s{2}Example command/);
    });
  });
});

describe('getDefaultRegistry() and setDefaultRegistry()', () => {
  test('getDefaultRegistry returns singleton instance', () => {
    const registry1 = getDefaultRegistry();
    const registry2 = getDefaultRegistry();

    expect(registry1).toBe(registry2);
    expect(registry1).toBeInstanceOf(CommandRegistry);
  });

  test('setDefaultRegistry sets the singleton instance', () => {
    const originalRegistry = getDefaultRegistry();
    const newRegistry = new CommandRegistry();

    setDefaultRegistry(newRegistry);

    expect(getDefaultRegistry()).toBe(newRegistry);
    expect(getDefaultRegistry()).not.toBe(originalRegistry);

    // Restore original for other tests
    setDefaultRegistry(originalRegistry);
  });
});
