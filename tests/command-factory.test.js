import { CommandFactory } from '../lib/command-factory.js';

describe('CommandFactory', () => {
  describe('claude()', () => {
    test('creates a claude-type command with correct handler', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude'
      });

      expect(command.handler.type).toBe('claude');
      expect(command.handler.prompt).toBe('Do something with Claude');
    });

    test('applies default priority CRITICAL', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude'
      });

      expect(command.priority).toBe('CRITICAL');
    });

    test('allows custom priority', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude',
        priority: 'LOW'
      });

      expect(command.priority).toBe('LOW');
    });

    test('applies default source "both"', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude'
      });

      expect(command.source).toBe('both');
    });

    test('sets session.create = true and session.codeLength = 2', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude'
      });

      expect(command.session.create).toBe(true);
      expect(command.session.codeLength).toBe(2);
    });

    test('accepts aliases and arguments options', () => {
      const command = CommandFactory.claude({
        name: 'test-claude',
        description: 'A test claude command',
        prompt: 'Do something with Claude',
        aliases: ['tc', 'test'],
        arguments: {
          required: ['target'],
          optional: ['verbose'],
          hint: '<target> [--verbose]'
        }
      });

      expect(command.aliases).toEqual(['tc', 'test']);
      expect(command.arguments.required).toEqual(['target']);
      expect(command.arguments.optional).toEqual(['verbose']);
    });

    test('throws on invalid command definition', () => {
      expect(() => {
        CommandFactory.claude({
          name: 'Invalid-Name',  // invalid: starts with uppercase
          description: 'A test command',
          prompt: 'Do something'
        });
      }).toThrow(/validation failed/i);
    });
  });

  describe('skill()', () => {
    test('creates a skill-type command', () => {
      const command = CommandFactory.skill({
        name: 'test-skill',
        description: 'A test skill command',
        skill: 'some-skill-name'
      });

      expect(command.handler.type).toBe('skill');
      expect(command.handler.skill).toBe('some-skill-name');
    });

    test('applies default priority CRITICAL', () => {
      const command = CommandFactory.skill({
        name: 'test-skill',
        description: 'A test skill command',
        skill: 'some-skill-name'
      });

      expect(command.priority).toBe('CRITICAL');
    });

    test('sets session.create = true and session.codeLength = 2', () => {
      const command = CommandFactory.skill({
        name: 'test-skill',
        description: 'A test skill command',
        skill: 'some-skill-name'
      });

      expect(command.session.create).toBe(true);
      expect(command.session.codeLength).toBe(2);
    });

    test('accepts custom source option', () => {
      const command = CommandFactory.skill({
        name: 'test-skill',
        description: 'A test skill command',
        skill: 'some-skill-name',
        source: 'webhook'
      });

      expect(command.source).toBe('webhook');
    });

    test('throws on invalid command definition', () => {
      expect(() => {
        CommandFactory.skill({
          name: 'test-skill',
          description: 'A test command'
          // missing skill
        });
      }).toThrow(/validation failed/i);
    });
  });

  describe('internal()', () => {
    test('creates an internal-type command with session.create = false', () => {
      const command = CommandFactory.internal({
        name: 'test-internal',
        description: 'A test internal command',
        function: 'handleHelp'
      });

      expect(command.handler.type).toBe('internal');
      expect(command.handler.function).toBe('handleHelp');
      expect(command.session.create).toBe(false);
    });

    test('sets priority to CRITICAL (internal commands are instant)', () => {
      const command = CommandFactory.internal({
        name: 'test-internal',
        description: 'A test internal command',
        function: 'handleHelp'
      });

      expect(command.priority).toBe('CRITICAL');
    });

    test('sets source to "both"', () => {
      const command = CommandFactory.internal({
        name: 'test-internal',
        description: 'A test internal command',
        function: 'handleHelp'
      });

      expect(command.source).toBe('both');
    });

    test('accepts aliases option', () => {
      const command = CommandFactory.internal({
        name: 'help',
        description: 'Show help',
        function: 'handleHelp',
        aliases: ['h', '?']
      });

      expect(command.aliases).toEqual(['h', '?']);
    });

    test('throws on invalid command definition', () => {
      expect(() => {
        CommandFactory.internal({
          name: 'test-internal',
          description: 'A test command'
          // missing function
        });
      }).toThrow(/validation failed/i);
    });
  });

  describe('fromJSON()', () => {
    test('creates command from JSON definition', () => {
      const json = {
        name: 'json-command',
        description: 'A command from JSON',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const command = CommandFactory.fromJSON(json);

      expect(command.name).toBe('json-command');
      expect(command.handler.type).toBe('claude');
      expect(command.handler.prompt).toBe('Do something');
    });

    test('applies defaults using applyDefaults from command-schema', () => {
      const json = {
        name: 'json-command',
        description: 'A command from JSON',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const command = CommandFactory.fromJSON(json);

      // These should be applied by applyDefaults
      expect(command.priority).toBe('NORMAL');  // default from applyDefaults
      expect(command.source).toBe('both');
      expect(command.aliases).toEqual([]);
      expect(command.arguments).toEqual({
        required: [],
        optional: [],
        hint: ''
      });
      expect(command.session).toEqual({
        create: true,
        codeLength: 2
      });
    });

    test('throws on invalid JSON with message matching /validation failed/i', () => {
      const invalidJson = {
        name: 'Invalid-Name',  // invalid: starts with uppercase
        description: 'A command from JSON',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      expect(() => {
        CommandFactory.fromJSON(invalidJson);
      }).toThrow(/validation failed/i);
    });

    test('throws when handler is missing', () => {
      const invalidJson = {
        name: 'json-command',
        description: 'A command from JSON'
        // missing handler
      };

      expect(() => {
        CommandFactory.fromJSON(invalidJson);
      }).toThrow(/validation failed/i);
    });
  });
});
