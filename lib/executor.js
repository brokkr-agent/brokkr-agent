// lib/executor.js
import { substituteArguments } from './argument-parser.js';

/**
 * Executor handles command execution with dry-run support
 * This will be extended in future phases to support:
 * - Session management (Phase 1)
 * - Job queue (Phase 1)
 * - Resource cleanup (Phase 3)
 */
export class Executor {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.logger = options.logger || console;

    // Hooks for future phases
    this.hooks = {
      beforeExecute: options.beforeExecute || null,
      afterExecute: options.afterExecute || null,
      onSessionCreate: options.onSessionCreate || null,
      onSessionResume: options.onSessionResume || null,
    };

    // Internal handlers for internal commands
    this.internalHandlers = new Map();
  }

  /**
   * Register an internal command handler
   */
  registerHandler(name, handler) {
    this.internalHandlers.set(name, handler);
  }

  /**
   * Execute a parsed command
   * @param {object} parsed - Result from parseMessage()
   * @param {object} context - Execution context (source, chatId, etc.)
   */
  async execute(parsed, context = {}) {
    const result = {
      parsed,
      context,
      dryRun: this.dryRun,
      timestamp: new Date().toISOString(),
      actions: []
    };

    // Call beforeExecute hook if set
    if (this.hooks.beforeExecute) {
      await this.hooks.beforeExecute(parsed, context);
    }

    switch (parsed.type) {
      case 'not_command':
        result.actions.push({ type: 'ignored', reason: 'Not a command' });
        break;

      case 'unknown_command':
        result.actions.push({
          type: 'error',
          error: `Unknown command: /${parsed.commandName}`
        });
        break;

      case 'session_resume':
        result.actions.push({
          type: 'session_resume',
          sessionCode: parsed.sessionCode,
          message: parsed.message,
          // Future: will look up session and resume
          note: 'Session management not yet implemented'
        });
        if (this.hooks.onSessionResume) {
          await this.hooks.onSessionResume(parsed.sessionCode, parsed.message, context);
        }
        break;

      case 'command':
        await this._executeCommand(parsed, context, result);
        break;
    }

    // Call afterExecute hook if set
    if (this.hooks.afterExecute) {
      await this.hooks.afterExecute(result);
    }

    return result;
  }

  async _executeCommand(parsed, context, result) {
    const { command, args, argString } = parsed;
    const handler = command.handler;

    switch (handler.type) {
      case 'claude':
        const prompt = substituteArguments(handler.prompt, args, context);
        result.actions.push({
          type: 'claude',
          command: command.name,
          prompt,
          originalArgs: args,
          session: command.session,
          priority: command.priority
        });

        if (!this.dryRun) {
          // Future: queue job, create session, spawn claude
          result.actions.push({ type: 'note', message: 'Claude execution not yet implemented' });
        }
        break;

      case 'skill':
        result.actions.push({
          type: 'skill',
          command: command.name,
          skill: handler.skill,
          args,
          session: command.session
        });

        if (!this.dryRun) {
          // Future: invoke skill
          result.actions.push({ type: 'note', message: 'Skill execution not yet implemented' });
        }
        break;

      case 'internal':
        result.actions.push({
          type: 'internal',
          command: command.name,
          function: handler.function,
          args
        });

        if (!this.dryRun) {
          const internalHandler = this.internalHandlers.get(handler.function);
          if (internalHandler) {
            const handlerResult = await internalHandler(args, context);
            result.actions.push({ type: 'handler_result', result: handlerResult });
          } else {
            result.actions.push({ type: 'error', error: `No handler for ${handler.function}` });
          }
        }
        break;
    }

    // Session creation hook
    if (command.session?.create && this.hooks.onSessionCreate) {
      await this.hooks.onSessionCreate(command, args, context);
    }
  }
}

// Default executor instance
let defaultExecutor = null;

export function getDefaultExecutor(options = {}) {
  if (!defaultExecutor) {
    defaultExecutor = new Executor(options);
  }
  return defaultExecutor;
}

export function setDefaultExecutor(executor) {
  defaultExecutor = executor;
}
