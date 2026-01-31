/**
 * Command Definition Schema for Brokkr V2
 *
 * Provides validation and defaults for command definitions
 * used by the Command Factory pattern.
 */

// Valid handler types
export const HANDLER_TYPES = ['claude', 'skill', 'internal'];

// Priority levels with numeric values
export const PRIORITIES = {
  CRITICAL: 100,
  HIGH: 75,
  NORMAL: 50,
  LOW: 25
};

// Valid command sources
export const SOURCES = ['whatsapp', 'webhook', 'both'];

// Name pattern: starts with lowercase letter, followed by lowercase letters, numbers, or hyphens
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Validates a command definition
 * @param {Object} definition - The command definition to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCommand(definition) {
  const errors = [];

  // Validate name
  if (!definition.name) {
    errors.push('name is required');
  } else if (!NAME_PATTERN.test(definition.name)) {
    errors.push(`name must match ${NAME_PATTERN}`);
  }

  // Validate description
  if (!definition.description) {
    errors.push('description is required');
  }

  // Validate handler
  if (!definition.handler) {
    errors.push('handler is required');
  } else {
    if (!definition.handler.type) {
      errors.push('handler.type is required');
    } else if (!HANDLER_TYPES.includes(definition.handler.type)) {
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
            errors.push('skill handler requires skill');
          }
          break;
        case 'internal':
          if (!definition.handler.function) {
            errors.push('internal handler requires function');
          }
          break;
      }
    }
  }

  // Validate priority (optional)
  if (definition.priority !== undefined) {
    if (!Object.keys(PRIORITIES).includes(definition.priority)) {
      errors.push(`priority must be one of: ${Object.keys(PRIORITIES).join(', ')}`);
    }
  }

  // Validate source (optional)
  if (definition.source !== undefined) {
    if (!SOURCES.includes(definition.source)) {
      errors.push(`source must be one of: ${SOURCES.join(', ')}`);
    }
  }

  // Validate session (optional)
  if (definition.session !== undefined) {
    if (definition.session.codeLength !== undefined) {
      if (definition.session.codeLength !== 2 && definition.session.codeLength !== 3) {
        errors.push('session.codeLength must be 2 or 3');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Applies default values to a command definition
 * @param {Object} definition - The command definition
 * @returns {Object} - The definition with defaults applied
 */
export function applyDefaults(definition) {
  // Create a deep copy to avoid mutation
  const result = JSON.parse(JSON.stringify(definition));

  // Apply priority default
  if (result.priority === undefined) {
    result.priority = 'NORMAL';
  }

  // Apply source default
  if (result.source === undefined) {
    result.source = 'both';
  }

  // Apply aliases default
  if (result.aliases === undefined) {
    result.aliases = [];
  }

  // Apply arguments defaults
  if (result.arguments === undefined) {
    result.arguments = {
      required: [],
      optional: [],
      hint: ''
    };
  } else {
    // Ensure all argument properties exist
    if (result.arguments.required === undefined) {
      result.arguments.required = [];
    }
    if (result.arguments.optional === undefined) {
      result.arguments.optional = [];
    }
    if (result.arguments.hint === undefined) {
      result.arguments.hint = '';
    }
  }

  // Apply session defaults
  if (result.session === undefined) {
    result.session = {
      create: definition.handler?.type === 'claude',
      codeLength: 2
    };
  } else {
    // Ensure all session properties exist
    if (result.session.create === undefined) {
      result.session.create = definition.handler?.type === 'claude';
    }
    if (result.session.codeLength === undefined) {
      result.session.codeLength = 2;
    }
  }

  return result;
}
