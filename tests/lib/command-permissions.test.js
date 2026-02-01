// tests/lib/command-permissions.test.js
// Command permission checking module tests
import { describe, it, expect } from '@jest/globals';
import {
  hasCommandPermission,
  hasAnyCommandPermission,
  checkCommandAccess,
  grantCommandPermission
} from '../../lib/command-permissions.js';

describe('command-permissions', () => {
  describe('hasCommandPermission', () => {
    it('returns true for wildcard permission', () => {
      const contact = { command_permissions: ['*'] };
      expect(hasCommandPermission(contact, '/claude')).toBe(true);
      expect(hasCommandPermission(contact, '/status')).toBe(true);
    });

    it('returns true for specific permission', () => {
      const contact = { command_permissions: ['/status', '/help'] };
      expect(hasCommandPermission(contact, '/status')).toBe(true);
      expect(hasCommandPermission(contact, '/help')).toBe(true);
    });

    it('returns false for missing permission', () => {
      const contact = { command_permissions: ['/status'] };
      expect(hasCommandPermission(contact, '/claude')).toBe(false);
    });

    it('returns false for empty permissions', () => {
      const contact = { command_permissions: [] };
      expect(hasCommandPermission(contact, '/status')).toBe(false);
    });

    it('normalizes command without leading slash', () => {
      const contact = { command_permissions: ['/status'] };
      expect(hasCommandPermission(contact, 'status')).toBe(true);
    });

    it('handles case-insensitive matching', () => {
      const contact = { command_permissions: ['/Status'] };
      expect(hasCommandPermission(contact, '/status')).toBe(true);
      expect(hasCommandPermission(contact, '/STATUS')).toBe(true);
    });

    it('handles undefined command_permissions', () => {
      const contact = {};
      expect(hasCommandPermission(contact, '/status')).toBe(false);
    });

    it('handles null command_permissions', () => {
      const contact = { command_permissions: null };
      expect(hasCommandPermission(contact, '/status')).toBe(false);
    });
  });

  describe('hasAnyCommandPermission', () => {
    it('returns true if contact has any command permissions', () => {
      const contact = { command_permissions: ['/status'] };
      expect(hasAnyCommandPermission(contact)).toBe(true);
    });

    it('returns true if contact has wildcard permission', () => {
      const contact = { command_permissions: ['*'] };
      expect(hasAnyCommandPermission(contact)).toBe(true);
    });

    it('returns false if contact has no command permissions', () => {
      const contact = { command_permissions: [] };
      expect(hasAnyCommandPermission(contact)).toBe(false);
    });

    it('handles missing command_permissions field', () => {
      const contact = {};
      expect(hasAnyCommandPermission(contact)).toBe(false);
    });

    it('handles null command_permissions field', () => {
      const contact = { command_permissions: null };
      expect(hasAnyCommandPermission(contact)).toBe(false);
    });
  });

  describe('checkCommandAccess', () => {
    it('returns ALLOWED for permitted commands', () => {
      const contact = { command_permissions: ['/status'] };
      const result = checkCommandAccess(contact, '/status');
      expect(result.access).toBe('allowed');
    });

    it('returns ALLOWED for wildcard permission', () => {
      const contact = { command_permissions: ['*'] };
      const result = checkCommandAccess(contact, '/claude');
      expect(result.access).toBe('allowed');
    });

    it('returns NOT_FOUND for non-permitted command when contact has some permissions', () => {
      const contact = { command_permissions: ['/status'] };
      const result = checkCommandAccess(contact, '/claude');
      expect(result.access).toBe('not_found');
      expect(result.notifyTommy).toBe(true);
      expect(result.message).toBe('Command not found');
    });

    it('returns IGNORE for commands when contact has zero permissions', () => {
      const contact = { command_permissions: [] };
      const result = checkCommandAccess(contact, '/status');
      expect(result.access).toBe('ignore');
      expect(result.treatAsNatural).toBe(true);
    });

    it('returns IGNORE when contact has undefined permissions', () => {
      const contact = {};
      const result = checkCommandAccess(contact, '/status');
      expect(result.access).toBe('ignore');
      expect(result.treatAsNatural).toBe(true);
    });

    it('normalizes command for access check', () => {
      const contact = { command_permissions: ['/status'] };
      const result = checkCommandAccess(contact, 'status');
      expect(result.access).toBe('allowed');
    });
  });

  describe('grantCommandPermission', () => {
    it('adds command to permissions', () => {
      const contact = { command_permissions: [] };
      grantCommandPermission(contact, '/status');
      expect(contact.command_permissions).toContain('/status');
    });

    it('normalizes command with leading slash', () => {
      const contact = { command_permissions: [] };
      grantCommandPermission(contact, 'help');
      expect(contact.command_permissions).toContain('/help');
    });

    it('does not add duplicates', () => {
      const contact = { command_permissions: ['/status'] };
      grantCommandPermission(contact, '/status');
      expect(contact.command_permissions).toHaveLength(1);
    });

    it('does not add duplicates with different case', () => {
      const contact = { command_permissions: ['/Status'] };
      grantCommandPermission(contact, '/status');
      expect(contact.command_permissions).toHaveLength(1);
    });

    it('returns updated contact', () => {
      const contact = { command_permissions: [] };
      const result = grantCommandPermission(contact, '/status');
      expect(result).toBe(contact);
      expect(result.command_permissions).toContain('/status');
    });

    it('initializes command_permissions if undefined', () => {
      const contact = {};
      grantCommandPermission(contact, '/status');
      expect(contact.command_permissions).toContain('/status');
    });

    it('initializes command_permissions if null', () => {
      const contact = { command_permissions: null };
      grantCommandPermission(contact, '/status');
      expect(contact.command_permissions).toContain('/status');
    });
  });
});
