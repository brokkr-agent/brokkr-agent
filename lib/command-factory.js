/**
 * Command Factory for Brokkr V2
 *
 * Provides convenient builder methods for creating validated command definitions.
 * Uses command-schema.js for validation and defaults.
 */

import { validateCommand, applyDefaults } from './command-schema.js';

export const CommandFactory = {
  /**
   * Creates a claude-type command
   * @param {Object} options - Command options
   * @param {string} options.name - Command name (lowercase, letters/numbers/hyphens)
   * @param {string} options.description - Command description
   * @param {string} options.prompt - The prompt to send to Claude
   * @param {string[]} [options.aliases] - Command aliases
   * @param {string} [options.priority='CRITICAL'] - Priority level
   * @param {Object} [options.arguments] - Argument configuration
   * @param {string} [options.source='both'] - Command source
   * @param {string} [options.category='tasks'] - Command category for help
   * @returns {Object} Validated command definition
   * @throws {Error} If validation fails
   */
  claude({ name, description, prompt, aliases, priority, arguments: args, source, category }) {
    const baseDefinition = {
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

    // Apply defaults (including category)
    const definition = applyDefaults(baseDefinition);
    // Override category if explicitly provided
    if (category) {
      definition.category = category;
    }

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Creates a skill-type command
   * @param {Object} options - Command options
   * @param {string} options.name - Command name (lowercase, letters/numbers/hyphens)
   * @param {string} options.description - Command description
   * @param {string} options.skill - The skill to invoke
   * @param {string[]} [options.aliases] - Command aliases
   * @param {string} [options.priority='CRITICAL'] - Priority level
   * @param {Object} [options.arguments] - Argument configuration
   * @param {string} [options.source='both'] - Command source
   * @param {string} [options.category='skills'] - Command category for help
   * @returns {Object} Validated command definition
   * @throws {Error} If validation fails
   */
  skill({ name, description, skill, aliases, priority, arguments: args, source, category }) {
    const baseDefinition = {
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

    // Apply defaults (including category)
    const definition = applyDefaults(baseDefinition);
    // Override category if explicitly provided
    if (category) {
      definition.category = category;
    }

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Creates an internal-type command
   * @param {Object} options - Command options
   * @param {string} options.name - Command name (lowercase, letters/numbers/hyphens)
   * @param {string} options.description - Command description
   * @param {string} options.function - The internal function to call
   * @param {string[]} [options.aliases] - Command aliases
   * @param {string} [options.category] - Command category for help
   * @param {Object} [options.arguments] - Argument configuration
   * @returns {Object} Validated command definition
   * @throws {Error} If validation fails
   */
  internal({ name, description, function: fn, aliases, category, arguments: args }) {
    const baseDefinition = {
      name,
      description,
      aliases: aliases || [],
      priority: 'CRITICAL',
      source: 'both',
      arguments: args || { required: [], optional: [], hint: '' },
      handler: {
        type: 'internal',
        function: fn
      },
      session: {
        create: false
      }
    };

    // Apply defaults (including category)
    const definition = applyDefaults(baseDefinition);
    // Override category if explicitly provided
    if (category) {
      definition.category = category;
    }

    const validation = validateCommand(definition);
    if (!validation.valid) {
      throw new Error(`Command validation failed: ${validation.errors.join(', ')}`);
    }

    return definition;
  },

  /**
   * Creates a command from raw JSON definition
   * @param {Object} json - Raw command definition JSON
   * @returns {Object} Validated command definition with defaults applied
   * @throws {Error} If validation fails
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
