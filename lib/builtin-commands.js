/**
 * Built-in Commands Registration for Brokkr V2
 *
 * Registers all built-in commands that come with the system:
 * - Claude commands: /claude, /schedule
 * - Internal commands: /help, /status, /sessions
 * - Skill commands: /research, /x, /github, /email, /youtube
 */

import { CommandFactory } from './command-factory.js';
import { getDefaultRegistry } from './command-registry.js';

/**
 * Registers all built-in commands to the given registry
 * @param {import('./command-registry.js').CommandRegistry} [registry] - The registry to register commands to (defaults to default registry)
 * @returns {import('./command-registry.js').CommandRegistry} The registry for chaining
 */
export function registerBuiltinCommands(registry = getDefaultRegistry()) {
  // ===== Claude Commands =====

  // /claude (alias: c) - Run a new Claude task
  registry.register(
    CommandFactory.claude({
      name: 'claude',
      description: 'Run a new Claude task',
      prompt: '$ARGUMENTS',
      aliases: ['c'],
      arguments: {
        required: ['task'],
        optional: [],
        hint: '<task>'
      }
    })
  );

  // /schedule - Schedule a task to run later
  registry.register(
    CommandFactory.claude({
      name: 'schedule',
      description: 'Schedule a task to run later',
      prompt: 'Schedule the following task: $ARGUMENTS',
      priority: 'NORMAL',
      category: 'scheduling',
      arguments: {
        required: ['time', 'task'],
        optional: [],
        hint: 'at <time> <task>'
      }
    })
  );

  // ===== Internal Commands =====

  // /help (aliases: h, ?) - Show available commands
  registry.register(
    CommandFactory.internal({
      name: 'help',
      description: 'Show available commands',
      function: 'handleHelp',
      aliases: ['h', '?']
    })
  );

  // /status (alias: s) - Show bot status and queue
  registry.register(
    CommandFactory.internal({
      name: 'status',
      description: 'Show bot status and queue',
      function: 'handleStatus',
      aliases: ['s']
    })
  );

  // /sessions - List active sessions
  registry.register(
    CommandFactory.internal({
      name: 'sessions',
      description: 'List active sessions',
      function: 'handleSessions'
    })
  );

  // /questions - View pending approval requests from contacts
  registry.register(
    CommandFactory.internal({
      name: 'questions',
      description: 'View pending approval requests from contacts',
      function: 'handleQuestions',
      category: 'sessions'
    })
  );

  // /digest - View daily digests of pending/resolved questions
  registry.register(
    CommandFactory.internal({
      name: 'digest',
      description: 'View daily digests of pending/resolved questions (last 7 days default)',
      function: 'handleDigest',
      category: 'sessions',
      arguments: { hint: '[days]' }
    })
  );

  // ===== Skill Commands =====

  // /research (alias: r) - Research a topic on the web
  registry.register(
    CommandFactory.skill({
      name: 'research',
      description: 'Research a topic on the web',
      skill: 'research',
      aliases: ['r'],
      arguments: {
        required: ['topic'],
        optional: [],
        hint: '<topic>'
      }
    })
  );

  // /x (alias: twitter) - Twitter/X actions
  registry.register(
    CommandFactory.skill({
      name: 'x',
      description: 'Twitter/X actions',
      skill: 'x',
      aliases: ['twitter'],
      arguments: {
        required: ['action'],
        optional: [],
        hint: '<action>'
      }
    })
  );

  // /github (alias: gh) - GitHub actions
  registry.register(
    CommandFactory.skill({
      name: 'github',
      description: 'GitHub actions',
      skill: 'github',
      aliases: ['gh'],
      arguments: {
        required: ['action'],
        optional: [],
        hint: '<action>'
      }
    })
  );

  // /email - Email actions via iCloud
  registry.register(
    CommandFactory.skill({
      name: 'email',
      description: 'Email actions via iCloud',
      skill: 'email',
      arguments: {
        required: ['action'],
        optional: [],
        hint: '<action>'
      }
    })
  );

  // /youtube (alias: yt) - YouTube search and transcripts
  registry.register(
    CommandFactory.skill({
      name: 'youtube',
      description: 'YouTube search and transcripts',
      skill: 'youtube',
      aliases: ['yt'],
      arguments: {
        required: ['query'],
        optional: [],
        hint: '<query>'
      }
    })
  );

  return registry;
}
