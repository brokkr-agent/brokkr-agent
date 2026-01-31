// lib/sessions.js
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const SESSIONS_DIR = join(process.cwd(), 'sessions');
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function getSessionFile(chatId) {
  // Sanitize chatId for filename
  const safe = chatId.replace(/[^a-zA-Z0-9]/g, '_');
  return join(SESSIONS_DIR, `${safe}.json`);
}

export function getSession(chatId) {
  const file = getSessionFile(chatId);
  if (!existsSync(file)) return null;

  const session = JSON.parse(readFileSync(file, 'utf-8'));

  // Check if expired
  if (Date.now() - new Date(session.lastActivity).getTime() > SESSION_TIMEOUT_MS) {
    return null;
  }

  return session;
}

export function updateSession(chatId, sessionId) {
  const file = getSessionFile(chatId);
  const session = {
    chatId,
    sessionId,
    createdAt: existsSync(file)
      ? JSON.parse(readFileSync(file, 'utf-8')).createdAt
      : new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  writeFileSync(file, JSON.stringify(session, null, 2));
}

export function endSession(chatId) {
  const file = getSessionFile(chatId);
  if (existsSync(file)) {
    const session = JSON.parse(readFileSync(file, 'utf-8'));
    session.endedAt = new Date().toISOString();
    // Move to archive
    const archiveDir = join(SESSIONS_DIR, 'archive');
    if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
    writeFileSync(join(archiveDir, `${Date.now()}.json`), JSON.stringify(session, null, 2));
    // Remove active session
    unlinkSync(file);
  }
}
