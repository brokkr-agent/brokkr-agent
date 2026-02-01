// lib/command-permissions.js
// Command permission checking module for iMessage Advanced Assistant
// Implements three-state access control for non-Tommy contacts

/**
 * Normalize a command to always have a leading slash and be lowercase
 * @param {string} command - Command string (e.g., 'status' or '/status')
 * @returns {string} Normalized command (e.g., '/status')
 */
function normalizeCommand(command) {
  if (!command) return '/';
  const trimmed = command.trim().toLowerCase();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Check if contact has a specific command permission
 * @param {Object} contact - Contact object with command_permissions array
 * @param {string} command - Command to check (e.g., '/status' or 'status')
 * @returns {boolean} True if contact has permission for this command
 */
export function hasCommandPermission(contact, command) {
  const permissions = contact?.command_permissions;

  // Handle undefined, null, or non-array permissions
  if (!permissions || !Array.isArray(permissions)) {
    return false;
  }

  // Check for wildcard permission
  if (permissions.includes('*')) {
    return true;
  }

  // Normalize the command and check against normalized permissions
  const normalizedCommand = normalizeCommand(command);

  // Check for exact match (case-insensitive)
  return permissions.some(
    perm => normalizeCommand(perm) === normalizedCommand
  );
}

/**
 * Check if contact has at least one command permission
 * @param {Object} contact - Contact object with command_permissions array
 * @returns {boolean} True if contact has any command permissions
 */
export function hasAnyCommandPermission(contact) {
  const permissions = contact?.command_permissions;

  // Handle undefined, null, or non-array permissions
  if (!permissions || !Array.isArray(permissions)) {
    return false;
  }

  return permissions.length > 0;
}

/**
 * Main decision function for command access control
 * Implements the three-state access control logic:
 * - ALLOWED: Contact has permission for this command
 * - NOT_FOUND: Contact has some permissions but not this one (notify Tommy)
 * - IGNORE: Contact has zero permissions (treat as natural message)
 *
 * @param {Object} contact - Contact object with command_permissions array
 * @param {string} command - Command to check
 * @returns {Object} Access decision object
 */
export function checkCommandAccess(contact, command) {
  // Check if contact has any permissions at all
  if (!hasAnyCommandPermission(contact)) {
    // Contact has 0 permissions - don't acknowledge as command
    return {
      access: 'ignore',
      treatAsNatural: true
    };
  }

  // Contact has at least one permission - check for specific command
  if (hasCommandPermission(contact, command)) {
    return {
      access: 'allowed'
    };
  }

  // Contact has permissions but not for this command
  return {
    access: 'not_found',
    notifyTommy: true,
    message: 'Command not found'
  };
}

/**
 * Grant a command permission to a contact
 * @param {Object} contact - Contact object to modify (mutated in place)
 * @param {string} command - Command to grant (e.g., '/status' or 'status')
 * @returns {Object} The updated contact object
 */
export function grantCommandPermission(contact, command) {
  // Initialize command_permissions if undefined or null
  if (!contact.command_permissions || !Array.isArray(contact.command_permissions)) {
    contact.command_permissions = [];
  }

  // Normalize the command
  const normalizedCommand = normalizeCommand(command);

  // Check if permission already exists (case-insensitive)
  const alreadyHas = contact.command_permissions.some(
    perm => normalizeCommand(perm) === normalizedCommand
  );

  // Add only if not already present
  if (!alreadyHas) {
    contact.command_permissions.push(normalizedCommand);
  }

  return contact;
}
