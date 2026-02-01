// lib/imessage-pending.js
// Pending questions queue module for iMessage Advanced Assistant
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateCode } from './session-codes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default pending-questions.json path in imessage skill
let pendingPath = path.join(__dirname, '..', '.claude', 'skills', 'imessage', 'pending-questions.json');

/**
 * Set custom pending-questions.json path (for testing)
 * @param {string} newPath - New path to pending-questions.json
 */
export function _setPendingPath(newPath) {
  pendingPath = newPath;
}

/**
 * Load pending questions from disk
 * @returns {Array} Array of pending questions or empty array
 */
function loadPending() {
  try {
    if (!fs.existsSync(pendingPath)) {
      return [];
    }
    const data = fs.readFileSync(pendingPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Handle file read errors or malformed JSON
    return [];
  }
}

/**
 * Save pending questions to disk
 * @param {Array} pending - Array of pending questions
 */
function savePending(pending) {
  // Ensure directory exists
  const dir = path.dirname(pendingPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
}

/**
 * Generate unique 2-char session code that doesn't collide with existing pending questions
 * @returns {string} Unique 2-character session code
 */
export function generateSessionCode() {
  const existing = loadPending();
  const existingCodes = new Set(existing.map(q => q.sessionCode));

  let code;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    code = generateCode(2);
    attempts++;
    if (attempts >= maxAttempts) {
      // Fallback: extremely unlikely but prevent infinite loop
      throw new Error('Unable to generate unique session code after 100 attempts');
    }
  } while (existingCodes.has(code));

  return code;
}

/**
 * Add a pending question to the queue
 * @param {Object} params - Question parameters
 * @param {string} params.phoneNumber - Phone number of requester
 * @param {string} params.question - The question text
 * @param {string} [params.context] - Optional context about the question
 * @returns {Object} Created pending question entry
 */
export function addPendingQuestion({ phoneNumber, question, context }) {
  const sessionCode = generateSessionCode();
  const now = new Date().toISOString();

  const entry = {
    sessionCode,
    phoneNumber,
    question,
    context,
    status: 'pending',
    createdAt: now,
    resolvedAt: null,
    response: null
  };

  const pending = loadPending();
  pending.push(entry);
  savePending(pending);

  return entry;
}

/**
 * Get pending questions, optionally filtered by status
 * @param {string} [status] - Optional status filter ('pending', 'allowed', 'denied')
 * @returns {Array} Array of pending questions
 */
export function getPendingQuestions(status) {
  const pending = loadPending();

  if (!status) {
    return pending;
  }

  return pending.filter(q => q.status === status);
}

/**
 * Get a single pending question by session code
 * @param {string} sessionCode - The 2-char session code
 * @returns {Object|null} Pending question or null if not found
 */
export function getPendingByCode(sessionCode) {
  const pending = loadPending();
  return pending.find(q => q.sessionCode === sessionCode) || null;
}

/**
 * Resolve a pending question (allow or deny)
 * @param {string} sessionCode - The session code of the question
 * @param {string} resolution - 'allow' or 'deny'
 * @param {string} [response] - Optional response message
 * @returns {Object|null} Updated pending question or null if not found
 */
export function resolvePending(sessionCode, resolution, response = null) {
  const pending = loadPending();
  const index = pending.findIndex(q => q.sessionCode === sessionCode);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const status = resolution === 'allow' ? 'allowed' : 'denied';

  pending[index] = {
    ...pending[index],
    status,
    resolvedAt: now,
    response
  };

  savePending(pending);
  return pending[index];
}
