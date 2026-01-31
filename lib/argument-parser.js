/**
 * Argument Parser for Brokkr V2 Agent System
 *
 * Parses command arguments and substitutes placeholders in prompt templates.
 */

/**
 * Parses an argument string into an array of arguments.
 * Respects quoted strings (both single and double quotes).
 * Handles empty input and URLs without breaking on special chars.
 *
 * @param {string} argString - The argument string to parse
 * @returns {string[]} Array of parsed arguments
 */
export function parseArguments(argString) {
  // Handle null, undefined, or empty input
  if (!argString || typeof argString !== 'string') {
    return [];
  }

  const trimmed = argString.trim();
  if (trimmed === '') {
    return [];
  }

  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = null;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (inQuote) {
      // We're inside a quoted string
      if (char === quoteChar) {
        // End of quoted string
        inQuote = false;
        quoteChar = null;
      } else {
        current += char;
      }
    } else {
      // We're outside a quoted string
      if (char === '"' || char === "'") {
        // Start of quoted string
        inQuote = true;
        quoteChar = char;
      } else if (char === ' ' || char === '\t') {
        // Whitespace - end current argument if any
        if (current !== '') {
          args.push(current);
          current = '';
        }
      } else {
        // Regular character
        current += char;
      }
    }
  }

  // Don't forget the last argument
  if (current !== '') {
    args.push(current);
  }

  return args;
}

/**
 * Substitutes placeholders in a template with argument values and context.
 *
 * Supported placeholders:
 * - $ARGUMENTS: All args joined by space
 * - $0, $1, $2, etc.: Positional args (missing becomes empty string)
 * - ${N:-default}: Positional arg N or default if missing
 * - ${SESSION_CODE}: Session code from context
 *
 * @param {string} template - The template string with placeholders
 * @param {string[]} args - Array of arguments for substitution
 * @param {Object} context - Context object with additional values
 * @param {string} [context.sessionCode] - Session code for ${SESSION_CODE}
 * @returns {string} Template with placeholders substituted
 */
export function substituteArguments(template, args = [], context = {}) {
  let result = template;

  // Substitute $ARGUMENTS with all args joined by space
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // Substitute ${N:-default} patterns (must do before simple $N to avoid conflicts)
  result = result.replace(/\$\{(\d+):-([^}]*)\}/g, (match, index, defaultValue) => {
    const idx = parseInt(index, 10);
    return args[idx] !== undefined ? args[idx] : defaultValue;
  });

  // Substitute ${SESSION_CODE} from context
  result = result.replace(/\$\{SESSION_CODE\}/g, context.sessionCode || '');

  // Substitute positional $0, $1, $2, etc.
  // Use a pattern that matches $N where N is one or more digits
  // but NOT followed by more pattern characters (to avoid partial matches)
  result = result.replace(/\$(\d+)/g, (match, index) => {
    const idx = parseInt(index, 10);
    return args[idx] !== undefined ? args[idx] : '';
  });

  return result;
}

/**
 * Validates arguments against a command definition.
 *
 * @param {string[]} args - Array of arguments to validate
 * @param {Object} definition - Command argument definition
 * @param {string[]} [definition.required] - Required argument names
 * @param {string[]} [definition.optional] - Optional argument names
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validateArguments(args = [], definition) {
  const errors = [];

  // If no definition provided, consider it valid
  if (!definition) {
    return { valid: true, errors: [] };
  }

  const required = definition.required || [];

  // Check if we have enough arguments for all required ones
  for (let i = 0; i < required.length; i++) {
    if (args[i] === undefined || args[i] === '') {
      errors.push(`Missing required argument: ${required[i]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
