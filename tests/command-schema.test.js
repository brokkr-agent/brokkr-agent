import {
  HANDLER_TYPES,
  PRIORITIES,
  SOURCES,
  validateCommand,
  applyDefaults
} from '../lib/command-schema.js';

describe('command-schema', () => {
  describe('exports', () => {
    test('exports valid handler types', () => {
      expect(HANDLER_TYPES).toEqual(['claude', 'skill', 'internal']);
    });

    test('exports valid priorities', () => {
      expect(PRIORITIES).toEqual({
        CRITICAL: 100,
        HIGH: 75,
        NORMAL: 50,
        LOW: 25
      });
    });

    test('exports valid sources', () => {
      expect(SOURCES).toEqual(['whatsapp', 'webhook', 'both']);
    });
  });

  describe('validateCommand', () => {
    test('validates a minimal valid command', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('validates a full claude command with all options', () => {
      const command = {
        name: 'full-command',
        description: 'A full command with all options',
        handler: {
          type: 'claude',
          prompt: 'Do something complex'
        },
        priority: 'HIGH',
        source: 'whatsapp',
        aliases: ['fc', 'full'],
        arguments: {
          required: ['target'],
          optional: ['verbose'],
          hint: '<target> [--verbose]'
        },
        session: {
          create: true,
          codeLength: 3
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects command without name', () => {
      const command = {
        description: 'A command without a name',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    test('rejects command with invalid name format', () => {
      const invalidNames = [
        'Invalid',      // starts with uppercase
        '123test',      // starts with number
        'test_command', // contains underscore
        'test command', // contains space
        '-test',        // starts with hyphen
      ];

      for (const name of invalidNames) {
        const command = {
          name,
          description: 'A test command',
          handler: {
            type: 'claude',
            prompt: 'Do something'
          }
        };

        const result = validateCommand(command);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('name must match'))).toBe(true);
      }
    });

    test('rejects claude handler without prompt', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('claude handler requires prompt');
    });

    test('rejects skill handler without skill name', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'skill'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('skill handler requires skill');
    });

    test('rejects internal handler without function', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'internal'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('internal handler requires function');
    });

    test('rejects command without description', () => {
      const command = {
        name: 'test-command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description is required');
    });

    test('rejects command without handler', () => {
      const command = {
        name: 'test-command',
        description: 'A test command'
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('handler is required');
    });

    test('rejects handler without type', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          prompt: 'Do something'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('handler.type is required');
    });

    test('rejects invalid handler type', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'invalid'
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('handler.type must be one of'))).toBe(true);
    });

    test('rejects invalid priority', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        },
        priority: 'INVALID'
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('priority must be one of'))).toBe(true);
    });

    test('rejects invalid source', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        },
        source: 'invalid'
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source must be one of'))).toBe(true);
    });

    test('rejects invalid session codeLength', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        },
        session: {
          create: true,
          codeLength: 5
        }
      };

      const result = validateCommand(command);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('session.codeLength must be 2 or 3');
    });
  });

  describe('applyDefaults', () => {
    test('applies defaults to minimal command', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const result = applyDefaults(command);

      expect(result.priority).toBe('NORMAL');
      expect(result.source).toBe('both');
      expect(result.aliases).toEqual([]);
      expect(result.arguments).toEqual({
        required: [],
        optional: [],
        hint: ''
      });
      expect(result.session).toEqual({
        create: true, // claude handler defaults to true
        codeLength: 2
      });
    });

    test('applies session.create = false for non-claude handlers', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'skill',
          skill: 'some-skill'
        }
      };

      const result = applyDefaults(command);

      expect(result.session.create).toBe(false);
    });

    test('preserves existing values', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        },
        priority: 'HIGH',
        source: 'whatsapp',
        aliases: ['tc'],
        arguments: {
          required: ['target'],
          optional: [],
          hint: '<target>'
        },
        session: {
          create: false,
          codeLength: 3
        }
      };

      const result = applyDefaults(command);

      expect(result.priority).toBe('HIGH');
      expect(result.source).toBe('whatsapp');
      expect(result.aliases).toEqual(['tc']);
      expect(result.arguments).toEqual({
        required: ['target'],
        optional: [],
        hint: '<target>'
      });
      expect(result.session).toEqual({
        create: false,
        codeLength: 3
      });
    });

    test('does not mutate original command', () => {
      const command = {
        name: 'test-command',
        description: 'A test command',
        handler: {
          type: 'claude',
          prompt: 'Do something'
        }
      };

      const result = applyDefaults(command);

      expect(command.priority).toBeUndefined();
      expect(result.priority).toBe('NORMAL');
    });
  });
});
