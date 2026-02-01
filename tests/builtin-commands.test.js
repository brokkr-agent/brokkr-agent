import { registerBuiltinCommands } from '../lib/builtin-commands.js';
import { CommandRegistry, getDefaultRegistry, setDefaultRegistry } from '../lib/command-registry.js';

describe('registerBuiltinCommands', () => {
  let registry;

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new CommandRegistry();
  });

  test('registers all 11 built-in commands', () => {
    registerBuiltinCommands(registry);

    const commands = registry.list();
    expect(commands.length).toBe(11);
  });

  test('returns the registry for chaining', () => {
    const result = registerBuiltinCommands(registry);

    expect(result).toBe(registry);
  });

  test('uses default registry when no argument provided', () => {
    // Set up a fresh default registry
    const freshRegistry = new CommandRegistry();
    setDefaultRegistry(freshRegistry);

    const result = registerBuiltinCommands();

    expect(result).toBe(getDefaultRegistry());
    expect(getDefaultRegistry().list().length).toBe(11);
  });

  describe('/claude command', () => {
    test('is registered with correct handler type', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('claude');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('claude');
    });

    test('has prompt set to $ARGUMENTS', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('claude');
      expect(cmd.handler.prompt).toBe('$ARGUMENTS');
    });

    test('has alias "c"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('c');
      expect(cmd).not.toBeNull();
      expect(cmd.name).toBe('claude');
    });

    test('has required argument "task" and hint "<task>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('claude');
      expect(cmd.arguments.required).toContain('task');
      expect(cmd.arguments.hint).toBe('<task>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('claude');
      expect(cmd.description).toBe('Run a new Claude task');
    });
  });

  describe('/schedule command', () => {
    test('is registered with correct handler type', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('schedule');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('claude');
    });

    test('has prompt set to schedule template', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('schedule');
      expect(cmd.handler.prompt).toBe('Schedule the following task: $ARGUMENTS');
    });

    test('has priority NORMAL', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('schedule');
      expect(cmd.priority).toBe('NORMAL');
    });

    test('has required arguments "time" and "task"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('schedule');
      expect(cmd.arguments.required).toContain('time');
      expect(cmd.arguments.required).toContain('task');
    });

    test('has hint "at <time> <task>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('schedule');
      expect(cmd.arguments.hint).toBe('at <time> <task>');
    });
  });

  describe('/help command', () => {
    test('is registered as internal with handleHelp function', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('help');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('internal');
      expect(cmd.handler.function).toBe('handleHelp');
    });

    test('has aliases "h" and "?"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('h').name).toBe('help');
      expect(registry.get('?').name).toBe('help');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('help');
      expect(cmd.description).toBe('Show available commands');
    });
  });

  describe('/status command', () => {
    test('is registered as internal with handleStatus function', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('status');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('internal');
      expect(cmd.handler.function).toBe('handleStatus');
    });

    test('has alias "s"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('s').name).toBe('status');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('status');
      expect(cmd.description).toBe('Show bot status and queue');
    });
  });

  describe('/sessions command', () => {
    test('is registered as internal with handleSessions function', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('sessions');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('internal');
      expect(cmd.handler.function).toBe('handleSessions');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('sessions');
      expect(cmd.description).toBe('List active sessions');
    });
  });

  describe('/research command', () => {
    test('is registered as skill with "research" skill', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('research');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('research');
    });

    test('has alias "r"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('r').name).toBe('research');
    });

    test('has required argument "topic" and hint "<topic>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('research');
      expect(cmd.arguments.required).toContain('topic');
      expect(cmd.arguments.hint).toBe('<topic>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('research');
      expect(cmd.description).toBe('Research a topic on the web');
    });
  });

  describe('/x command', () => {
    test('is registered as skill with "x" skill', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('x');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('x');
    });

    test('has alias "twitter"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('twitter').name).toBe('x');
    });

    test('has required argument "action" and hint "<action>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('x');
      expect(cmd.arguments.required).toContain('action');
      expect(cmd.arguments.hint).toBe('<action>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('x');
      expect(cmd.description).toBe('Twitter/X actions');
    });
  });

  describe('/github command', () => {
    test('is registered as skill with "github" skill', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('github');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('github');
    });

    test('has alias "gh"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('gh').name).toBe('github');
    });

    test('has required argument "action" and hint "<action>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('github');
      expect(cmd.arguments.required).toContain('action');
      expect(cmd.arguments.hint).toBe('<action>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('github');
      expect(cmd.description).toBe('GitHub actions');
    });
  });

  describe('/email command', () => {
    test('is registered as skill with "email" skill', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('email');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('email');
    });

    test('has required argument "action" and hint "<action>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('email');
      expect(cmd.arguments.required).toContain('action');
      expect(cmd.arguments.hint).toBe('<action>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('email');
      expect(cmd.description).toBe('Email actions via iCloud');
    });
  });

  describe('/youtube command', () => {
    test('is registered as skill with "youtube" skill', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('youtube');
      expect(cmd).not.toBeNull();
      expect(cmd.handler.type).toBe('skill');
      expect(cmd.handler.skill).toBe('youtube');
    });

    test('has alias "yt"', () => {
      registerBuiltinCommands(registry);

      expect(registry.get('yt').name).toBe('youtube');
    });

    test('has required argument "query" and hint "<query>"', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('youtube');
      expect(cmd.arguments.required).toContain('query');
      expect(cmd.arguments.hint).toBe('<query>');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('youtube');
      expect(cmd.description).toBe('YouTube search and transcripts');
    });
  });

  describe('/questions command', () => {
    test('is registered with correct handler', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('questions');
      expect(cmd).toBeDefined();
      expect(cmd.handler.type).toBe('internal');
      expect(cmd.handler.function).toBe('handleQuestions');
    });

    test('has correct description', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('questions');
      expect(cmd.description).toBe('View pending approval requests from contacts');
    });

    test('has category set to sessions', () => {
      registerBuiltinCommands(registry);

      const cmd = registry.get('questions');
      expect(cmd.category).toBe('sessions');
    });
  });

  describe('aliases are registered correctly', () => {
    test('all aliases resolve to correct commands', () => {
      registerBuiltinCommands(registry);

      // Claude command alias
      expect(registry.get('c').name).toBe('claude');

      // Internal command aliases
      expect(registry.get('h').name).toBe('help');
      expect(registry.get('?').name).toBe('help');
      expect(registry.get('s').name).toBe('status');

      // Skill command aliases
      expect(registry.get('r').name).toBe('research');
      expect(registry.get('gh').name).toBe('github');
      expect(registry.get('yt').name).toBe('youtube');
      expect(registry.get('twitter').name).toBe('x');
    });
  });
});
