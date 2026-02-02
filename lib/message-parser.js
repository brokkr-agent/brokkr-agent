// lib/message-parser.js
import { getDefaultRegistry } from './command-registry.js';
import { registerBuiltinCommands } from './builtin-commands.js';
import { parseArguments } from './argument-parser.js';

// Ensure built-in commands are registered
let initialized = false;
function ensureInitialized() {
  if (!initialized) {
    registerBuiltinCommands();
    initialized = true;
  }
}

/**
 * Reset the initialized state (for testing purposes)
 */
export function resetInitialized() {
  initialized = false;
}

/**
 * Parse a WhatsApp message into a command invocation
 * @param {string} message - Raw message text
 * @param {object} [options] - Parsing options
 * @param {boolean} [options.treatAsNatural=false] - If true, non-command messages return 'natural_message' type
 * @returns {object} Parsed result with command info or error
 */
export function parseMessage(message, options = {}) {
  ensureInitialized();

  const trimmed = message.trim();

  // Must start with /
  if (!trimmed.startsWith('/')) {
    if (options.treatAsNatural) {
      if (trimmed === '') {
        return { type: 'empty_message', message: '' };
      }
      return { type: 'natural_message', message: trimmed };
    }
    return { type: 'not_command', message: trimmed };
  }

  // Extract command name and arguments
  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  let commandName, argString;
  if (spaceIndex === -1) {
    commandName = withoutSlash;
    argString = '';
  } else {
    commandName = withoutSlash.slice(0, spaceIndex);
    argString = withoutSlash.slice(spaceIndex + 1);
  }

  const registry = getDefaultRegistry();
  const command = registry.get(commandName);

  if (!command) {
    // Check if it looks like a session code (2-3 lowercase alphanumeric)
    if (/^[a-z0-9]{2,3}$/.test(commandName)) {
      return {
        type: 'session_resume',
        sessionCode: commandName,
        message: argString || null
      };
    }

    return {
      type: 'unknown_command',
      commandName,
      argString
    };
  }

  const args = parseArguments(argString);

  return {
    type: 'command',
    command,
    commandName: command.name,
    args,
    argString,
    handler: command.handler
  };
}

/**
 * Category display order and titles
 * Commands define their own category; this just controls display order
 */
const CATEGORY_ORDER = ['tasks', 'sessions', 'scheduling', 'skills', 'help'];
const CATEGORY_TITLES = {
  tasks: 'TASKS',
  sessions: 'SESSIONS',
  scheduling: 'SCHEDULING',
  skills: 'SKILLS',
  help: 'HELP'
};

/**
 * Get help text for all commands or a specific command
 * @param {string} [commandName] - Optional command name for detailed help
 * @returns {string} Formatted help text
 */
export function getHelpText(commandName) {
  ensureInitialized();
  const registry = getDefaultRegistry();

  // If a specific command is requested, return detailed help
  if (commandName) {
    const command = registry.get(commandName);
    if (!command) {
      return `Unknown command: "${commandName}". Use /help to see available commands.`;
    }
    return formatDetailedHelp(command);
  }

  // Otherwise, return categorized help for all commands
  return formatCategorizedHelp(registry);
}

/**
 * Format detailed help for a single command
 * @param {Object} command - The command definition
 * @returns {string} Formatted detailed help
 */
function formatDetailedHelp(command) {
  const lines = [];

  // Command name with usage hint
  let title = `/${command.name}`;
  if (command.arguments?.hint) {
    title += ` ${command.arguments.hint}`;
  }
  lines.push(title);
  lines.push('');

  // Description
  lines.push(command.description);
  lines.push('');

  // Aliases
  if (command.aliases && command.aliases.length > 0) {
    lines.push(`Aliases: ${command.aliases.map(a => `/${a}`).join(', ')}`);
  }

  // Usage example
  if (command.arguments?.hint) {
    lines.push(`Usage: /${command.name} ${command.arguments.hint}`);
  }

  // Handler type
  lines.push(`Type: ${command.handler.type}`);

  return lines.join('\n');
}

/**
 * Format categorized help for all commands
 * @param {Object} registry - The command registry
 * @returns {string} Formatted categorized help
 */
function formatCategorizedHelp(registry) {
  const lines = [];
  const commands = registry.list();

  // Group commands by their category property
  const byCategory = {};
  for (const cmd of commands) {
    const cat = cmd.category || 'tasks';
    if (!byCategory[cat]) {
      byCategory[cat] = [];
    }
    byCategory[cat].push(cmd);
  }

  // Display in defined order, then any unknown categories
  const displayOrder = [...CATEGORY_ORDER];
  for (const cat of Object.keys(byCategory)) {
    if (!displayOrder.includes(cat)) {
      displayOrder.push(cat);
    }
  }

  // Process each category in order
  for (const categoryKey of displayOrder) {
    const categoryCommands = byCategory[categoryKey];
    if (!categoryCommands || categoryCommands.length === 0) continue;

    // Filter out hidden commands
    const visibleCommands = categoryCommands.filter(cmd => !cmd.hidden);
    if (visibleCommands.length === 0) continue;

    const title = CATEGORY_TITLES[categoryKey] || categoryKey.toUpperCase();
    lines.push(`--- ${title} ---`);

    for (const cmd of visibleCommands) {
      let line = `/${cmd.name}`;
      if (cmd.arguments?.hint) {
        line += ` ${cmd.arguments.hint}`;
      }
      if (cmd.aliases && cmd.aliases.length > 0) {
        line += ` (${cmd.aliases.join(', ')})`;
      }
      lines.push(line);
      lines.push(`  ${cmd.description}`);
    }
    lines.push('');
  }

  // Add session resume hint
  lines.push('--- SESSION RESUME ---');
  lines.push('/<xx> or /<xx> <message>');
  lines.push('  Resume a session using its 2-3 character code');
  lines.push('');

  lines.push('Use /help <command> for detailed help on a specific command.');

  return lines.join('\n');
}

/**
 * Check if a message is a help command
 * @param {string} text - Message text
 * @returns {boolean} True if the message is a help command
 */
export function isHelpCommand(text) {
  const trimmed = text.trim().toLowerCase();

  // Must start with /
  if (!trimmed.startsWith('/')) {
    return false;
  }

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');
  const commandName = spaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, spaceIndex);

  // Check if it's a help command or alias
  return commandName === 'help' || commandName === 'h' || commandName === '?';
}

/**
 * Parse a help command to extract the command argument
 * @param {string} text - Message text
 * @returns {string|null} The command name being asked about, or null
 */
export function parseHelpCommand(text) {
  if (!isHelpCommand(text)) {
    return null;
  }

  const trimmed = text.trim();
  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  if (spaceIndex === -1) {
    return null;
  }

  // Get everything after the command name and trim
  const argPart = withoutSlash.slice(spaceIndex + 1).trim();

  if (!argPart) {
    return null;
  }

  // Return only the first word (the command name)
  const firstSpaceInArg = argPart.indexOf(' ');
  if (firstSpaceInArg === -1) {
    return argPart;
  }

  return argPart.slice(0, firstSpaceInArg);
}
