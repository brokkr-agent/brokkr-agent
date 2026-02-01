// tests/message-parser.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  parseMessage,
  getHelpText,
  isHelpCommand,
  parseHelpCommand,
  resetInitialized
} from '../lib/message-parser.js';
import { setDefaultRegistry, CommandRegistry } from '../lib/command-registry.js';

describe('parseMessage', () => {
  beforeEach(() => {
    // Reset registry and initialized state for each test
    // The message-parser will auto-register builtin commands via ensureInitialized()
    resetInitialized();
    const registry = new CommandRegistry();
    setDefaultRegistry(registry);
  });

  describe('command parsing', () => {
    it('parses /claude command', () => {
      const result = parseMessage('/claude list files');
      expect(result.type).toBe('command');
      expect(result.commandName).toBe('claude');
      expect(result.args).toEqual(['list', 'files']);
    });

    it('parses command aliases', () => {
      const result = parseMessage('/c quick test');
      expect(result.type).toBe('command');
      expect(result.commandName).toBe('claude');
      expect(result.args).toEqual(['quick', 'test']);
    });

    it('parses /help command', () => {
      const result = parseMessage('/help');
      expect(result.type).toBe('command');
      expect(result.commandName).toBe('help');
      expect(result.handler.type).toBe('internal');
    });

    it('parses skill commands', () => {
      const result = parseMessage('/research AI agents');
      expect(result.type).toBe('command');
      expect(result.commandName).toBe('research');
      expect(result.handler.type).toBe('skill');
      expect(result.args).toEqual(['AI', 'agents']);
    });

    it('parses command with no arguments', () => {
      const result = parseMessage('/status');
      expect(result.type).toBe('command');
      expect(result.commandName).toBe('status');
      expect(result.args).toEqual([]);
    });
  });

  describe('session codes', () => {
    it('recognizes 2-char session codes', () => {
      const result = parseMessage('/k7');
      expect(result.type).toBe('session_resume');
      expect(result.sessionCode).toBe('k7');
      expect(result.message).toBeNull();
    });

    it('recognizes 3-char session codes', () => {
      const result = parseMessage('/abc');
      expect(result.type).toBe('session_resume');
      expect(result.sessionCode).toBe('abc');
    });

    it('includes message with session code', () => {
      const result = parseMessage('/k7 continue please');
      expect(result.type).toBe('session_resume');
      expect(result.sessionCode).toBe('k7');
      expect(result.message).toBe('continue please');
    });
  });

  describe('non-commands', () => {
    it('recognizes non-commands', () => {
      const result = parseMessage('hello world');
      expect(result.type).toBe('not_command');
    });

    it('recognizes unknown commands', () => {
      const result = parseMessage('/unknown test');
      expect(result.type).toBe('unknown_command');
      expect(result.commandName).toBe('unknown');
    });
  });

  describe('getHelpText', () => {
    it('returns help text with categories when no argument', () => {
      const help = getHelpText();
      expect(help).toContain('/claude');
      expect(help).toContain('/help');
      expect(help).toContain('/status');
      // Should have category headers
      expect(help).toContain('TASKS');
      expect(help).toContain('SESSIONS');
      expect(help).toContain('SKILLS');
    });

    it('returns detailed help for a specific command', () => {
      const help = getHelpText('claude');
      expect(help).toContain('/claude');
      expect(help).toContain('Run a new Claude task');
      // Should show aliases
      expect(help).toContain('c');
      // Should show usage
      expect(help).toContain('<task>');
    });

    it('returns error message for unknown command', () => {
      const help = getHelpText('unknowncommand');
      expect(help).toContain('Unknown command');
      expect(help).toContain('unknowncommand');
    });

    it('handles command aliases in detailed help', () => {
      const help = getHelpText('c');
      expect(help).toContain('/claude');
      expect(help).toContain('Run a new Claude task');
    });
  });

  describe('isHelpCommand', () => {
    it('returns true for /help', () => {
      expect(isHelpCommand('/help')).toBe(true);
    });

    it('returns true for /help claude', () => {
      expect(isHelpCommand('/help claude')).toBe(true);
    });

    it('returns true for /h alias', () => {
      expect(isHelpCommand('/h')).toBe(true);
    });

    it('returns true for /? alias', () => {
      expect(isHelpCommand('/?')).toBe(true);
    });

    it('returns true for case variations', () => {
      expect(isHelpCommand('/HELP')).toBe(true);
      expect(isHelpCommand('/Help')).toBe(true);
    });

    it('returns false for non-help commands', () => {
      expect(isHelpCommand('/claude test')).toBe(false);
      expect(isHelpCommand('/status')).toBe(false);
    });

    it('returns false for non-commands', () => {
      expect(isHelpCommand('help me')).toBe(false);
      expect(isHelpCommand('need help')).toBe(false);
    });
  });

  describe('parseHelpCommand', () => {
    it('returns null for /help with no argument', () => {
      expect(parseHelpCommand('/help')).toBeNull();
    });

    it('extracts command from /help <command>', () => {
      expect(parseHelpCommand('/help claude')).toBe('claude');
      expect(parseHelpCommand('/help status')).toBe('status');
    });

    it('extracts command from aliases', () => {
      expect(parseHelpCommand('/h claude')).toBe('claude');
      expect(parseHelpCommand('/? schedule')).toBe('schedule');
    });

    it('handles extra whitespace', () => {
      expect(parseHelpCommand('/help   claude')).toBe('claude');
      expect(parseHelpCommand('  /help claude  ')).toBe('claude');
    });

    it('returns first word only for multi-word input', () => {
      expect(parseHelpCommand('/help claude task')).toBe('claude');
    });

    it('returns null for non-help commands', () => {
      expect(parseHelpCommand('/claude test')).toBeNull();
      expect(parseHelpCommand('help')).toBeNull();
    });
  });

  describe('parseMessage - natural conversation', () => {
    it('treats non-command messages as natural_message when treatAsNatural is true', () => {
      const result = parseMessage('Hello, how are you?', { treatAsNatural: true });

      expect(result.type).toBe('natural_message');
      expect(result.message).toBe('Hello, how are you?');
    });

    it('still returns not_command when treatAsNatural is false', () => {
      const result = parseMessage('Hello, how are you?', { treatAsNatural: false });

      expect(result.type).toBe('not_command');
    });

    it('handles empty messages', () => {
      const result = parseMessage('', { treatAsNatural: true });

      expect(result.type).toBe('empty_message');
    });

    it('still parses commands normally even with treatAsNatural true', () => {
      const result = parseMessage('/claude hello', { treatAsNatural: true });

      expect(result.type).toBe('command');
      expect(result.command).toBeDefined();
      expect(result.commandName).toBe('claude');
    });
  });
});
