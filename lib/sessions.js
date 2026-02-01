// lib/sessions.js
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateCode } from './session-codes.js';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const SESSIONS_FILE = join(PROJECT_ROOT, 'data', 'sessions.json');

// In-memory store
let store = {
  sessions: [],
  lastUpdated: null
};

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = dirname(SESSIONS_FILE);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

// Load sessions from file
function loadSessions() {
  ensureDataDir();
  if (existsSync(SESSIONS_FILE)) {
    try {
      const data = readFileSync(SESSIONS_FILE, 'utf-8');
      store = JSON.parse(data);
    } catch (err) {
      console.error('Warning: sessions.json corrupted or unreadable, starting fresh:', err.message);
      store = { sessions: [], lastUpdated: null };
    }
  }
  return store;
}

// Save sessions to file
function saveSessions() {
  ensureDataDir();
  store.lastUpdated = new Date().toISOString();
  // Atomic write: write to temp file, then rename
  const tempFile = SESSIONS_FILE + '.tmp';
  writeFileSync(tempFile, JSON.stringify(store, null, 2));
  renameSync(tempFile, SESSIONS_FILE);
}

// Generate a unique session ID
function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

// Generate a unique code that doesn't exist in active sessions
function generateUniqueCode(length) {
  loadSessions();
  const activeCodes = store.sessions
    .filter(s => s.status === 'active')
    .map(s => s.code);

  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const code = generateCode(length);
    if (!activeCodes.includes(code)) {
      return code;
    }
    attempts++;
  }

  throw new Error('Unable to generate unique code after max attempts');
}

/**
 * Create a new session with auto-generated short code
 * @param {Object} options - Session options
 * @param {string} options.type - 'whatsapp' or 'webhook'
 * @param {string} options.task - Original task description
 * @param {string} [options.chatId] - WhatsApp chat ID (for whatsapp type)
 * @param {string} [options.source] - Webhook source (for webhook type)
 * @param {string} [options.sessionId] - Optional custom session ID
 * @param {string} [customCode] - Optional custom session code (e.g., from BrokkrMVP)
 * @returns {Object} Created session object
 */
export function createSession({ type, task, chatId, source, sessionId }, customCode = null) {
  loadSessions();

  // WhatsApp and iMessage sessions get 2-char codes, webhook sessions get 3-char codes
  const codeLength = (type === 'whatsapp' || type === 'imessage') ? 2 : 3;
  const code = customCode || generateUniqueCode(codeLength);

  const now = new Date().toISOString();

  const session = {
    code,
    type,
    task,
    chatId: chatId || null,
    source: source || null,
    sessionId: sessionId || generateSessionId(),
    claudeSessionId: null,
    createdAt: now,
    lastActivity: now,
    status: 'active'
  };

  store.sessions.push(session);
  saveSessions();

  return session;
}

/**
 * Get session by internal session ID
 * @param {string} sessionId - Internal session ID
 * @returns {Object|null} Session object or null if not found
 */
export function getSession(sessionId) {
  loadSessions();
  const session = store.sessions.find(s => s.sessionId === sessionId);
  return session || null;
}

/**
 * Get session by short code (only active sessions)
 * @param {string} code - Short code
 * @returns {Object|null} Session object or null if not found/inactive
 */
export function getSessionByCode(code) {
  loadSessions();
  const session = store.sessions.find(
    s => s.code === code && s.status === 'active'
  );
  return session || null;
}

/**
 * List active sessions, optionally filtered by type
 * @param {string} [type] - Optional type filter ('whatsapp' or 'webhook')
 * @returns {Array} Array of active session objects
 */
export function listSessions(type) {
  loadSessions();
  let sessions = store.sessions.filter(s => s.status === 'active');

  if (type) {
    sessions = sessions.filter(s => s.type === type);
  }

  return sessions;
}

/**
 * Update session's lastActivity timestamp and optionally merge additional updates
 * @param {string} code - Short code
 * @param {Object} [updates] - Optional additional fields to update
 * @returns {Object|null} Updated session or null if not found
 */
export function updateSessionActivity(code, updates = {}) {
  loadSessions();
  const session = store.sessions.find(
    s => s.code === code && s.status === 'active'
  );

  if (!session) {
    return null;
  }

  session.lastActivity = new Date().toISOString();
  Object.assign(session, updates);
  saveSessions();

  return session;
}

/**
 * Store Claude's actual session ID for --resume functionality
 * @param {string} code - Short code
 * @param {string} claudeSessionId - Claude's session ID
 * @returns {Object|null} Updated session or null if not found
 */
export function updateSessionClaudeId(code, claudeSessionId) {
  loadSessions();
  const session = store.sessions.find(
    s => s.code === code && s.status === 'active'
  );

  if (!session) {
    return null;
  }

  session.claudeSessionId = claudeSessionId;
  session.lastActivity = new Date().toISOString();
  saveSessions();

  return session;
}

/**
 * Mark old sessions as expired based on lastActivity
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {number} Count of expired sessions
 */
export function expireSessions(maxAgeMs) {
  loadSessions();
  const now = Date.now();
  let count = 0;

  for (const session of store.sessions) {
    if (session.status !== 'active') continue;

    const lastActivity = new Date(session.lastActivity).getTime();
    if (now - lastActivity > maxAgeMs) {
      session.status = 'expired';
      count++;
    }
  }

  if (count > 0) {
    saveSessions();
  }

  return count;
}

/**
 * Mark session as ended
 * @param {string} code - Short code
 * @returns {Object|null} Ended session or null if not found
 */
export function endSession(code) {
  loadSessions();
  const session = store.sessions.find(s => s.code === code);

  if (!session) {
    return null;
  }

  session.status = 'ended';
  session.endedAt = new Date().toISOString();
  saveSessions();

  return session;
}

/**
 * Clear all sessions (for testing)
 */
export function clearSessions() {
  store = { sessions: [], lastUpdated: null };
  saveSessions();
}

/**
 * Get direct access to the store (for testing)
 * @returns {Object} The in-memory store object
 */
export function _getStore() {
  loadSessions();
  return store;
}

/**
 * Save the current store to file (for testing after _getStore modifications)
 */
export function _saveStore() {
  saveSessions();
}
