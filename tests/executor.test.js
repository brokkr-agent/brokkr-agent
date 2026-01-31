// tests/executor.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import { Executor } from '../lib/executor.js';
import { parseMessage, resetInitialized } from '../lib/message-parser.js';
import { setDefaultRegistry, CommandRegistry } from '../lib/command-registry.js';

describe('Executor', () => {
  beforeEach(() => {
    // Reset registry and initialized state for each test
    // The message-parser will auto-register builtin commands via ensureInitialized()
    resetInitialized();
    const registry = new CommandRegistry();
    setDefaultRegistry(registry);
  });

  describe('dry-run mode', () => {
    it('does not execute in dry-run mode', async () => {
      const executor = new Executor({ dryRun: true });
      const parsed = parseMessage('/claude test');
      const result = await executor.execute(parsed);

      expect(result.dryRun).toBe(true);
      expect(result.actions.some(a => a.type === 'claude')).toBe(true);
    });

    it('includes prompt after substitution', async () => {
      const executor = new Executor({ dryRun: true });
      const parsed = parseMessage('/claude hello world');
      const result = await executor.execute(parsed);

      const claudeAction = result.actions.find(a => a.type === 'claude');
      expect(claudeAction.prompt).toBe('hello world');
    });
  });

  describe('internal handlers', () => {
    it('calls registered internal handler', async () => {
      const executor = new Executor({ dryRun: false });
      let handlerCalled = false;

      executor.registerHandler('handleHelp', () => {
        handlerCalled = true;
        return 'Help text';
      });

      const parsed = parseMessage('/help');
      await executor.execute(parsed);

      expect(handlerCalled).toBe(true);
    });
  });

  describe('hooks', () => {
    it('calls beforeExecute hook', async () => {
      let hookCalled = false;
      const executor = new Executor({
        dryRun: true,
        beforeExecute: () => { hookCalled = true; }
      });

      const parsed = parseMessage('/claude test');
      await executor.execute(parsed);

      expect(hookCalled).toBe(true);
    });

    it('calls afterExecute hook with result', async () => {
      let hookResult = null;
      const executor = new Executor({
        dryRun: true,
        afterExecute: (result) => { hookResult = result; }
      });

      const parsed = parseMessage('/claude test');
      await executor.execute(parsed);

      expect(hookResult).not.toBeNull();
      expect(hookResult.actions.length).toBeGreaterThan(0);
    });
  });
});
