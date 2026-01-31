#!/usr/bin/env node
// dry-run-test.js
import { runDryRunTests, dryRunMessage, formatDryRunResult } from './lib/dry-run.js';
import { getHelpText } from './lib/message-parser.js';
import * as readline from 'readline';

const testMessages = [
  '/claude list all files in this project',
  '/c quick test',
  '/help',
  '/h',
  '/status',
  '/research AI agents',
  '/r machine learning',
  '/github list my repos',
  '/gh pr list',
  '/x post hello world',
  '/twitter search AI',
  '/youtube how to code',
  '/yt javascript tutorial',
  '/email check inbox',
  '/schedule at 3pm remind me to call mom',
  '/sessions',
  '/k7',
  '/k7 continue the task',
  '/abc',
  '/unknown-command test',
  'not a command',
  '/claude',
];

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Brokkr Dry-Run Test Tool

Usage:
  node dry-run-test.js              Run all test cases
  node dry-run-test.js --interactive  Interactive mode
  node dry-run-test.js --help-text    Show help text
  node dry-run-test.js "<message>"    Test a specific message

Examples:
  node dry-run-test.js "/claude hello"
  node dry-run-test.js --interactive
`);
    return;
  }

  if (args.includes('--help-text')) {
    console.log('\nAVAILABLE COMMANDS:\n');
    console.log(getHelpText());
    return;
  }

  if (args.includes('--interactive') || args.includes('-i')) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\nINTERACTIVE DRY-RUN MODE');
    console.log('Type messages to test, or "quit" to exit\n');

    const prompt = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }

        if (input.trim()) {
          const result = await dryRunMessage(input);
          console.log(formatDryRunResult(result));
        }

        prompt();
      });
    };

    prompt();
    return;
  }

  // Single message test
  if (args.length > 0 && !args[0].startsWith('--')) {
    const message = args.join(' ');
    const result = await dryRunMessage(message);
    console.log(formatDryRunResult(result));
    return;
  }

  // Run all test cases
  await runDryRunTests(testMessages);
}

main().catch(console.error);
