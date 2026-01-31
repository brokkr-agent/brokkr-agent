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
 * @returns {object} Parsed result with command info or error
 */
export function parseMessage(message) {
  ensureInitialized();

  const trimmed = message.trim();

  // Must start with /
  if (!trimmed.startsWith('/')) {
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
 * Get help text for all commands
 */
export function getHelpText() {
  ensureInitialized();
  return getDefaultRegistry().getHelpText();
}
