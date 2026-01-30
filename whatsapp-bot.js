import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { spawn } from 'child_process';
import qrcode from 'qrcode-terminal';

const WORKSPACE = process.cwd();

// Step 2: Pin WhatsApp Web version to avoid compatibility issues
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/AaronLuz/whatsapp-versions/main/html/2.3000.1031490220-alpha.html'
  },
  puppeteer: {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Safe send message with retry logic and sendSeen: false
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
  console.log('\n📱 Scan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent + '%', message);
});

client.on('authenticated', () => {
  console.log('✅ Authenticated!');
});

client.on('auth_failure', msg => {
  console.error('❌ Auth failure:', msg);
});

// Polling fallback - check for new messages every 2 seconds
let lastMessageId = null;
let isProcessing = false;

async function pollForMessages() {
  if (isProcessing) return;

  try {
    const chats = await client.getChats();
    // Find "message yourself" chat - try @lid first for reading, but send to @c.us
    const selfChat = chats.find(c => c.id._serialized.endsWith('@lid'));
    const myId = client.info?.wid?._serialized; // @c.us ID for sending

    if (selfChat && myId) {
      const messages = await selfChat.fetchMessages({ limit: 1 });
      const lastMsg = messages[0];

      if (lastMsg && lastMsg.id._serialized !== lastMessageId && lastMsg.fromMe) {
        const text = lastMsg.body.trim();

        // Only process messages starting with /claude
        if (text.toLowerCase().startsWith('/claude ')) {
          lastMessageId = lastMsg.id._serialized;
          const task = text.slice(8).trim(); // Remove "/claude "

          if (task) {
            isProcessing = true;
            console.log(`\n📨 Task: "${task}"`);
            console.log(`📂 Working dir: ${WORKSPACE}\n`);

            try {
              await safeSendMessage(client, myId, '🚀 Starting Claude Code...');
            } catch (e) {
              console.log('⚠️ Could not send start message:', e.message);
            }

            console.log(`⚙️  Running: claude -p "${task}" --dangerously-skip-permissions\n`);

            const child = spawn('claude', ['-p', task, '--dangerously-skip-permissions'], {
              cwd: WORKSPACE,
              env: { ...process.env, FORCE_COLOR: '0' },
              stdio: ['ignore', 'pipe', 'pipe'] // Close stdin, capture stdout/stderr
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
              console.log('📥 Command finished with code:', code);

              let result = stdout || stderr || 'Done (no output)';
              result = result.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

              console.log('📤 Result preview:', result.slice(0, 300));

              try {
                const MAX_LENGTH = 4000;
                if (result.length > MAX_LENGTH) {
                  for (let i = 0; i < result.length; i += MAX_LENGTH) {
                    await safeSendMessage(client, myId, result.slice(i, i + MAX_LENGTH));
                  }
                } else {
                  await safeSendMessage(client, myId, result);
                }
                console.log('✅ Sent response to WhatsApp');
              } catch (sendErr) {
                console.error('❌ Failed to send response:', sendErr.message);
              }

              isProcessing = false;
            });

            child.on('error', (err) => {
              console.error('❌ Spawn error:', err.message);
              isProcessing = false;
            });
          }
        } else if (lastMsg.id._serialized !== lastMessageId) {
          lastMessageId = lastMsg.id._serialized;
        }
      }
    }
  } catch (err) {
    // Ignore errors during polling
  }
}

// Step 4: Track ready state for fallback logic
let readyFired = false;
let botStarted = false;

async function startBot() {
  if (botStarted) return;
  botStarted = true;

  console.log('📡 Starting message polling...');
  console.log('💬 Send /claude <task> to yourself to run Claude Code\n');

  // Start polling immediately - don't block on startup message
  setInterval(pollForMessages, 2000);

  // Try to send startup message in background (non-blocking)
  setTimeout(async () => {
    try {
      const myId = client.info?.wid?._serialized;
      if (myId) {
        await client.sendMessage(myId, '🤖 Bot is online! Send /claude <task> to run Claude Code.', { sendSeen: false });
        console.log('✅ Sent startup message');
      }
    } catch (err) {
      console.log('ℹ️ Startup message skipped (library still initializing)');
    }
  }, 5000);
}

client.on('ready', () => {
  readyFired = true;
  console.log('\n✅ WhatsApp READY!');
  console.log('📍 Workspace:', WORKSPACE);
  console.log('\n💬 Send a message starting with /claude to trigger Claude Code');
  console.log('   Example: /claude list files in this project\n');
  startBot();
});

// Fallback if ready event doesn't fire (wait 45s for full initialization)
client.on('authenticated', () => {
  setTimeout(() => {
    if (!readyFired && client.info) {
      console.log('⚠️ Ready event did not fire, using fallback');
      startBot();
    }
  }, 45000);
});

console.log('🔄 Starting WhatsApp bot...\n');
client.initialize();
