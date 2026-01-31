// whatsapp-bot.js
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

import { enqueue, getPendingJobs } from './lib/queue.js';
import { processQueue, setSendMessageCallback } from './lib/worker.js';
import { startHeartbeat, incrementProcessed, incrementFailed } from './lib/heartbeat.js';
import { info, warn, error, success } from './lib/logger.js';
import { getSession, updateSession, endSession } from './lib/sessions.js';

const WORKSPACE = process.cwd();
const POLL_INTERVAL_MS = 2000;
const QUEUE_PROCESS_INTERVAL_MS = 1000;

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032721183-alpha.html'
  },
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  },
});

// Safe send with retry
async function safeSendMessage(chatId, message, retries = 3) {
  const MAX_LENGTH = 4000;
  const chunks = [];

  for (let i = 0; i < message.length; i += MAX_LENGTH) {
    chunks.push(message.slice(i, i + MAX_LENGTH));
  }

  for (const chunk of chunks) {
    for (let i = 0; i < retries; i++) {
      try {
        await client.sendMessage(chatId, chunk, { sendSeen: false });
        return;
      } catch (err) {
        warn('WhatsApp', `Send attempt ${i + 1} failed`, { error: err.message });
        if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
    throw new Error('Failed to send after all retries');
  }
}

// Set up worker callback
setSendMessageCallback(safeSendMessage);

// Message tracking
let lastMessageId = null;

async function pollForMessages() {
  try {
    const chats = await client.getChats();
    const myId = client.info?.wid?._serialized;
    const selfChat = chats.find(c => c.id._serialized === myId);

    if (!selfChat || !myId) return;

    const messages = await selfChat.fetchMessages({ limit: 5 });

    for (const msg of messages.reverse()) {
      if (msg.id._serialized === lastMessageId) continue;
      if (!msg.fromMe) continue;

      const text = msg.body.trim();
      lastMessageId = msg.id._serialized;

      // Handle /claude - one-shot task
      if (text.toLowerCase().startsWith('/claude ')) {
        const task = text.slice(8).trim();
        if (task) {
          const jobId = enqueue({ type: 'oneshot', task, chatId: myId });
          info('Queue', `Enqueued job ${jobId}`, { task: task.slice(0, 50) });
          await safeSendMessage(myId, `Queued: ${task.slice(0, 100)}...`);
        }
      }

      // Handle /chat - session-based conversation
      else if (text.toLowerCase().startsWith('/chat ')) {
        const message = text.slice(6).trim();
        if (message) {
          const session = getSession(myId);
          const jobId = enqueue({
            type: 'chat',
            task: message,
            chatId: myId,
            sessionId: session?.sessionId || null
          });
          info('Queue', `Enqueued chat job ${jobId}`, { hasSession: !!session });
        }
      }

      // Handle /endchat - end session
      else if (text.toLowerCase() === '/endchat') {
        endSession(myId);
        await safeSendMessage(myId, 'Session ended.');
        info('Session', 'Session ended by user');
      }

      // Handle /status - bot status
      else if (text.toLowerCase() === '/status') {
        const pending = getPendingJobs().length;
        await safeSendMessage(myId, `Bot online. ${pending} jobs pending.`);
      }
    }
  } catch (err) {
    // Ignore polling errors - will retry
  }
}

// Event handlers
client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  info('WhatsApp', `Loading: ${percent}%`, { message });
});

client.on('authenticated', () => {
  success('WhatsApp', 'Authenticated');
});

client.on('auth_failure', msg => {
  error('WhatsApp', 'Auth failure', { message: msg });
  process.exit(1);
});

client.on('disconnected', (reason) => {
  error('WhatsApp', 'Disconnected', { reason });
  process.exit(1);
});

client.on('ready', async () => {
  success('WhatsApp', 'Ready');
  info('Bot', `Workspace: ${WORKSPACE}`);

  // Start systems
  startHeartbeat();

  // Poll for messages
  setInterval(pollForMessages, POLL_INTERVAL_MS);

  // Process queue
  setInterval(processQueue, QUEUE_PROCESS_INTERVAL_MS);

  // Startup notification
  try {
    const myId = client.info?.wid?._serialized;
    if (myId) {
      await safeSendMessage(myId, 'Bot online. Send /claude <task> or /chat <message>');
    }
  } catch (err) {
    warn('WhatsApp', 'Could not send startup message');
  }
});

// Error handlers
process.on('uncaughtException', (err) => {
  error('Process', 'Uncaught exception', { error: err.message });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  error('Process', 'Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

process.on('SIGTERM', () => {
  info('Process', 'Received SIGTERM');
  client.destroy().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  info('Process', 'Received SIGINT');
  client.destroy().then(() => process.exit(0));
});

info('Bot', 'Starting WhatsApp bot (24/7 mode)');
client.initialize();
