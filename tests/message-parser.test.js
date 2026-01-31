// tests/message-parser.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { parseMessage, getHelpText, resetInitialized } from '../lib/message-parser.js';
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
    it('returns help text', () => {
      const help = getHelpText();
      expect(help).toContain('/claude');
      expect(help).toContain('/help');
      expect(help).toContain('/status');
    });
  });
});
