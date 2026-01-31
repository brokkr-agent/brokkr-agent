import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { spawn } from 'child_process';
import qrcode from 'qrcode-terminal';
import { parseMessage, getHelpText } from './lib/message-parser.js';
import { Executor } from './lib/executor.js';

const WORKSPACE = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

// Create executor with dry-run setting
const executor = new Executor({ dryRun: DRY_RUN });

// Register internal handlers
executor.registerHandler('handleHelp', () => getHelpText());
executor.registerHandler('handleStatus', () => `Status: ${isProcessing ? 'Processing task' : 'Idle'}\nMode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\nWorkspace: ${WORKSPACE}`);
executor.registerHandler('handleSessions', () => 'Sessions: Not yet implemented');

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032721183-alpha.html'
  },
  puppeteer: {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Safe send message with retry logic
async function safeSendMessage(client, chatId, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.sendMessage(chatId, message, { sendSeen: false });
    } catch (err) {
      console.error(`Send attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Failed to send after all retries');
}

client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent + '%', message);
});

client.on('authenticated', () => {
  console.log('Authenticated!');
});

client.on('auth_failure', msg => {
  console.error('Auth failure:', msg);
});

// Polling fallback - check for new messages every 2 seconds
let lastMessageId = null;
let isProcessing = false;

let pollCount = 0;
async function pollForMessages() {
  if (isProcessing) return;

  pollCount++;
  const DEBUG = process.argv.includes('--debug');

  try {
    const chats = await client.getChats();
    const myId = client.info?.wid?._serialized; // @c.us ID for sending

    // Find "message yourself" chat - try multiple methods
    let selfChat = chats.find(c => c.id._serialized.endsWith('@lid'));

    // Fallback: try to find by matching user's own ID
    if (!selfChat && myId) {
      const myNumber = myId.replace('@c.us', '');
      selfChat = chats.find(c => c.id.user === myNumber || c.id._serialized.includes(myNumber));
    }

    // Fallback: find chat named "You" or similar self-chat indicators
    if (!selfChat) {
      selfChat = chats.find(c => c.isGroup === false && c.name === 'You');
    }

    if (DEBUG && pollCount % 10 === 0) {
      console.log(`[Poll #${pollCount}] selfChat: ${!!selfChat}, myId: ${myId}`);
      if (!selfChat && pollCount === 10) {
        console.log('Available chats:', chats.slice(0, 5).map(c => ({ id: c.id._serialized, name: c.name })));
      }
    }

    if (selfChat && myId) {
      const messages = await selfChat.fetchMessages({ limit: 1 });
      const lastMsg = messages[0];

      if (DEBUG && lastMsg) {
        console.log(`[Poll #${pollCount}] Last msg: "${lastMsg.body?.slice(0, 30)}..." fromMe: ${lastMsg.fromMe}, isNew: ${lastMsg.id._serialized !== lastMessageId}`);
      }

      if (lastMsg && lastMsg.id._serialized !== lastMessageId && lastMsg.fromMe) {
        const text = lastMsg.body.trim();

        // Skip bot responses (they start with these patterns)
        if (text.startsWith('[DRY-RUN]') || text.startsWith('Bot online') || text.startsWith('Starting:') || text.startsWith('Unknown command:')) {
          lastMessageId = lastMsg.id._serialized;
          if (DEBUG) console.log('[Skip] Bot response detected');
          return;
        }

        // Skip help text output (contains multiple /command lines)
        if (text.includes('/claude <task>') && text.includes('/help')) {
          lastMessageId = lastMsg.id._serialized;
          if (DEBUG) console.log('[Skip] Help text detected');
          return;
        }

        // Only process messages starting with /
        if (text.startsWith('/')) {
          lastMessageId = lastMsg.id._serialized;

          // Parse the message using our command system
          const parsed = parseMessage(text);
          console.log(`\n[${new Date().toISOString()}] Received: "${text}"`);
          console.log(`Parsed type: ${parsed.type}`);

          // Execute (or dry-run) the command
          const result = await executor.execute(parsed, { source: 'whatsapp', chatId: myId });

          // Handle based on parsed type
          if (parsed.type === 'not_command') {
            // Shouldn't happen since we check for / above, but just in case
            lastMessageId = lastMsg.id._serialized;
            return;
          }

          if (parsed.type === 'unknown_command') {
            await safeSendMessage(client, myId, `Unknown command: /${parsed.commandName}\n\nUse /help to see available commands.`);
            return;
          }

          if (parsed.type === 'session_resume') {
            if (DRY_RUN) {
              await safeSendMessage(client, myId, `[DRY-RUN] Session resume:\nCode: ${parsed.sessionCode}\nMessage: ${parsed.message || '(none)'}\n\n(Session management not yet implemented)`);
            } else {
              await safeSendMessage(client, myId, `Session /${parsed.sessionCode} - not yet implemented`);
            }
            return;
          }

          // Handle command types
          const handler = parsed.handler;

          if (handler.type === 'internal') {
            // Internal commands run immediately
            const internalHandler = executor.internalHandlers.get(handler.function);
            if (internalHandler) {
              const response = await internalHandler(parsed.args, { source: 'whatsapp' });
              await safeSendMessage(client, myId, response);
            }
            return;
          }

          if (handler.type === 'claude' || handler.type === 'skill') {
            if (DRY_RUN) {
              // In dry-run mode, show what would happen
              const action = result.actions.find(a => a.type === handler.type);
              let response = `[DRY-RUN] Command received:\n`;
              response += `Command: /${parsed.commandName}\n`;
              response += `Type: ${handler.type}\n`;
              response += `Args: ${JSON.stringify(parsed.args)}\n`;
              if (action?.prompt) response += `Prompt: "${action.prompt}"\n`;
              if (action?.skill) response += `Skill: ${action.skill}\n`;
              if (action?.priority) response += `Priority: ${action.priority}\n`;
              if (action?.session) response += `Session: create=${action.session.create}, codeLength=${action.session.codeLength}\n`;
              response += `\n(Would execute Claude in LIVE mode)`;
              await safeSendMessage(client, myId, response);
              console.log('Dry-run response sent');
            } else {
              // LIVE mode - execute Claude
              isProcessing = true;
              const task = handler.type === 'claude' ? parsed.argString : `Use the /${handler.skill} skill: ${parsed.argString}`;

              console.log(`Task: "${task}"`);
              console.log(`Working dir: ${WORKSPACE}\n`);

              try {
                await safeSendMessage(client, myId, `Starting: /${parsed.commandName}...`);
              } catch (e) {
                console.log('Could not send start message:', e.message);
              }

              console.log(`Running: claude -p "${task}" --dangerously-skip-permissions\n`);

              const child = spawn('claude', ['-p', task, '--dangerously-skip-permissions'], {
                cwd: WORKSPACE,
                env: { ...process.env, FORCE_COLOR: '0' },
                stdio: ['ignore', 'pipe', 'pipe']
              });

              let stdout = '';
              let stderr = '';

              child.stdout.on('data', (data) => {
                stdout += data.toString();
              });

              child.stderr.on('data', (data) => {
                stderr += data.toString();
              });

              child.on('close', async (code) => {
                console.log('Command finished with code:', code);

                let output = stdout || stderr || 'Done (no output)';
                output = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

                console.log('Result preview:', output.slice(0, 300));

                try {
                  const MAX_LENGTH = 4000;
                  if (output.length > MAX_LENGTH) {
                    for (let i = 0; i < output.length; i += MAX_LENGTH) {
                      await safeSendMessage(client, myId, output.slice(i, i + MAX_LENGTH));
                    }
                  } else {
                    await safeSendMessage(client, myId, output);
                  }
                  console.log('Sent response to WhatsApp');
                } catch (sendErr) {
                  console.error('Failed to send response:', sendErr.message);
                }

                isProcessing = false;
              });

              child.on('error', (err) => {
                console.error('Spawn error:', err.message);
                isProcessing = false;
              });
            }
          }
        } else if (lastMsg.id._serialized !== lastMessageId) {
          lastMessageId = lastMsg.id._serialized;
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

// Track ready state for fallback logic
let readyFired = false;
let botStarted = false;

async function startBot() {
  if (botStarted) return;
  botStarted = true;

  const mode = DRY_RUN ? 'DRY-RUN' : 'LIVE';
  console.log(`\nMode: ${mode}`);
  console.log('Starting message polling...');
  console.log('Commands: /claude, /help, /status, /research, /github, /x, /youtube, /email, /schedule\n');

  // Start polling immediately
  setInterval(pollForMessages, 2000);

  // Try to send startup message in background (non-blocking)
  setTimeout(async () => {
    try {
      const myId = client.info?.wid?._serialized;
      if (myId) {
        const msg = DRY_RUN
          ? 'Bot online [DRY-RUN MODE]\nCommands will be parsed but not executed.\nUse /help to see available commands.'
          : 'Bot online! Use /help to see available commands.';
        await client.sendMessage(myId, msg, { sendSeen: false });
        console.log('Sent startup message');
      }
    } catch (err) {
      console.log('Startup message skipped (library still initializing)');
    }
  }, 5000);
}

client.on('ready', () => {
  readyFired = true;
  console.log('\nWhatsApp READY!');
  console.log('Workspace:', WORKSPACE);
  if (DRY_RUN) {
    console.log('\n*** DRY-RUN MODE - Commands will be parsed but NOT executed ***');
  }
  console.log('\nSend /help to see available commands');
  console.log('Example: /claude list files in this project\n');
  startBot();
});

// Fallback if ready event doesn't fire (wait 45s for full initialization)
client.on('authenticated', () => {
  setTimeout(() => {
    if (!readyFired && client.info) {
      console.log('Ready event did not fire, using fallback');
      startBot();
    }
  }, 45000);
});

console.log('Starting WhatsApp bot...');
if (DRY_RUN) {
  console.log('*** DRY-RUN MODE ENABLED ***\n');
} else {
  console.log('*** LIVE MODE ***\n');
}
client.initialize();
