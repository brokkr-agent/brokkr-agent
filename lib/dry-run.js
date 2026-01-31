// lib/dry-run.js
import { parseMessage, getHelpText } from './message-parser.js';
import { Executor } from './executor.js';

/**
 * Format dry-run output for display
 */
export function formatDryRunResult(result) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push(`DRY RUN: ${result.timestamp}`);
  lines.push('='.repeat(60));

  const { parsed } = result;

  lines.push(`Type: ${parsed.type}`);

  if (parsed.type === 'command') {
    lines.push(`Command: /${parsed.commandName}`);
    lines.push(`Handler: ${parsed.handler.type}`);
    lines.push(`Args: ${JSON.stringify(parsed.args)}`);

    if (parsed.command.aliases?.length) {
      lines.push(`Aliases: ${parsed.command.aliases.join(', ')}`);
    }
  } else if (parsed.type === 'session_resume') {
    lines.push(`Session Code: ${parsed.sessionCode}`);
    lines.push(`Message: ${parsed.message || '(none)'}`);
  } else if (parsed.type === 'unknown_command') {
    lines.push(`Unknown: /${parsed.commandName}`);
  }

  lines.push('');
  lines.push('Actions:');

  for (const action of result.actions) {
    lines.push(`  * ${action.type}:`);

    if (action.type === 'claude') {
      lines.push(`    Prompt: "${action.prompt}"`);
      lines.push(`    Priority: ${action.priority}`);
      lines.push(`    Session: create=${action.session?.create}, codeLength=${action.session?.codeLength}`);
    } else if (action.type === 'skill') {
      lines.push(`    Skill: ${action.skill}`);
      lines.push(`    Args: ${JSON.stringify(action.args)}`);
    } else if (action.type === 'internal') {
      lines.push(`    Function: ${action.function}`);
    } else if (action.type === 'error') {
      lines.push(`    Error: ${action.error}`);
    } else if (action.type === 'note') {
      lines.push(`    Note: ${action.message}`);
    }
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Run a dry-run test on a message
 */
export async function dryRunMessage(message) {
  const parsed = parseMessage(message);
  const executor = new Executor({ dryRun: true });

  // Register help handler for testing
  executor.registerHandler('handleHelp', () => getHelpText());
  executor.registerHandler('handleStatus', () => 'Status: Dry run mode');
  executor.registerHandler('handleSessions', () => 'Sessions: None (dry run)');

  const result = await executor.execute(parsed, { source: 'test' });
  return result;
}

/**
 * Interactive dry-run test
 */
export async function runDryRunTests(messages) {
  console.log('\nDRY RUN TEST MODE\n');

  for (const message of messages) {
    console.log(`Input: "${message}"`);
    const result = await dryRunMessage(message);
    console.log(formatDryRunResult(result));
    console.log('');
  }
}
