/**
 * Command Registry for Brokkr V2
 *
 * Stores and retrieves command definitions with support for aliases,
 * source filtering, and command discovery from the filesystem.
 */

import { CommandFactory } from './command-factory.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Registry for command definitions
 */
export class CommandRegistry {
  /**
   * Creates a new CommandRegistry
   */
  constructor() {
    /** @type {Map<string, Object>} Map of command name -> command definition */
    this.commands = new Map();
    /** @type {Map<string, string>} Map of alias -> command name */
    this.aliases = new Map();
  }

  /**
   * Registers a command definition
   * @param {Object} definition - The command definition to register
   * @returns {CommandRegistry} this for chaining
   * @throws {Error} If name or alias already registered
   */
  register(definition) {
    const name = definition.name.toLowerCase();

    // Check if name already exists as a command or alias
    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered`);
    }
    if (this.aliases.has(name)) {
      throw new Error(`"${name}" conflicts with an existing alias`);
    }

    // Check if any aliases conflict
    const aliases = definition.aliases || [];
    for (const alias of aliases) {
      const lowerAlias = alias.toLowerCase();
      if (this.commands.has(lowerAlias)) {
        throw new Error(`Alias "${lowerAlias}" conflicts with an existing command`);
      }
      if (this.aliases.has(lowerAlias)) {
        throw new Error(`Alias "${lowerAlias}" is already registered`);
      }
    }

    // Register the command
    this.commands.set(name, definition);

    // Register all aliases
    for (const alias of aliases) {
      this.aliases.set(alias.toLowerCase(), name);
    }

    return this;
  }

  /**
   * Gets a command by name or alias (case-insensitive)
   * @param {string} nameOrAlias - The command name or alias
   * @returns {Object|null} The command definition or null if not found
   */
  get(nameOrAlias) {
    const lookup = nameOrAlias.toLowerCase();

    // Check direct command lookup
    if (this.commands.has(lookup)) {
      return this.commands.get(lookup);
    }

    // Check alias lookup
    if (this.aliases.has(lookup)) {
      const commandName = this.aliases.get(lookup);
      return this.commands.get(commandName);
    }

    return null;
  }

  /**
   * Checks if a command exists by name or alias
   * @param {string} nameOrAlias - The command name or alias
   * @returns {boolean} True if command exists
   */
  has(nameOrAlias) {
    const lookup = nameOrAlias.toLowerCase();
    return this.commands.has(lookup) || this.aliases.has(lookup);
  }

  /**
   * Lists all commands, optionally filtered by source
   * @param {string|null} source - Filter to commands available for this source
   * @returns {Object[]} Array of command definitions
   */
  list(source = null) {
    const commands = Array.from(this.commands.values());

    if (source === null) {
      return commands;
    }

    return commands.filter(cmd => {
      return cmd.source === source || cmd.source === 'both';
    });
  }

  /**
   * Discovers and loads commands from .brokkr/commands/{name}/command.json
   * @param {string} basePath - The base path to search from (defaults to cwd)
   * @returns {CommandRegistry} this for chaining
   */
  discover(basePath = process.cwd()) {
    const commandsDir = path.join(basePath, '.brokkr', 'commands');

    // Check if commands directory exists
    if (!fs.existsSync(commandsDir)) {
      return this;
    }

    // Read all subdirectories
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const commandJsonPath = path.join(commandsDir, entry.name, 'command.json');

      if (!fs.existsSync(commandJsonPath)) {
        continue;
      }

      try {
        const jsonContent = fs.readFileSync(commandJsonPath, 'utf-8');
        const json = JSON.parse(jsonContent);
        const command = CommandFactory.fromJSON(json);
        this.register(command);
      } catch (error) {
        // Log error but continue with other commands
        console.error(`Failed to load command from ${commandJsonPath}: ${error.message}`);
      }
    }

    return this;
  }

  /**
   * Returns formatted help text for all commands
   * Format: /name hint (aliases)\n  description\n\n
   * @returns {string} Formatted help text
   */
  getHelpText() {
    const lines = [];

    for (const command of this.commands.values()) {
      const name = command.name;
      const hint = command.arguments?.hint || '';
      const aliases = command.aliases || [];
      const description = command.description;

      // Build the first line: /name hint (aliases)
      let firstLine = `/${name}`;
      if (hint) {
        firstLine += ` ${hint}`;
      }
      if (aliases.length > 0) {
        firstLine += ` (${aliases.join(', ')})`;
      }

      lines.push(firstLine);
      lines.push(`  ${description}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Singleton instance
let defaultRegistry = null;

/**
 * Gets the default singleton registry instance
 * @returns {CommandRegistry} The default registry
 */
export function getDefaultRegistry() {
  if (defaultRegistry === null) {
    defaultRegistry = new CommandRegistry();
  }
  return defaultRegistry;
}

/**
 * Sets the default singleton registry instance
 * @param {CommandRegistry} registry - The registry to set as default
 */
export function setDefaultRegistry(registry) {
  defaultRegistry = registry;
}
