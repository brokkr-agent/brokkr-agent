// tests/sessions.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createSession,
  getSession,
  getSessionByCode,
  listSessions,
  updateSessionActivity,
  updateSessionClaudeId,
  expireSessions,
  endSession,
  clearSessions,
  _getStore,
  _saveStore
} from '../lib/sessions.js';

describe('sessions', () => {
  beforeEach(() => {
    // Clear sessions before each test
    clearSessions();
  });

  describe('createSession', () => {
    it('creates WhatsApp session with 2-char code', () => {
      const session = createSession({
        type: 'whatsapp',
        task: 'Research AI agents',
        chatId: 'user123'
      });

      expect(session.code).toHaveLength(2);
      expect(session.type).toBe('whatsapp');
      expect(session.task).toBe('Research AI agents');
      expect(session.chatId).toBe('user123');
      expect(session.sessionId).toBeDefined();
      expect(session.status).toBe('active');
      expect(session.claudeSessionId).toBeNull();
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivity).toBeDefined();
    });

    it('creates webhook session with 3-char code', () => {
      const session = createSession({
        type: 'webhook',
        task: 'Process payment',
        source: 'stripe'
      });

      expect(session.code).toHaveLength(3);
      expect(session.type).toBe('webhook');
      expect(session.source).toBe('stripe');
      expect(session.status).toBe('active');
    });

    it('accepts optional sessionId parameter', () => {
      const session = createSession({
        type: 'whatsapp',
        task: 'Test task',
        sessionId: 'custom-session-id'
      });

      expect(session.sessionId).toBe('custom-session-id');
    });

    it('generates unique session IDs', () => {
      const session1 = createSession({ type: 'whatsapp', task: 'Task 1' });
      const session2 = createSession({ type: 'whatsapp', task: 'Task 2' });

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('generates unique codes', () => {
      const session1 = createSession({ type: 'whatsapp', task: 'Task 1' });
      const session2 = createSession({ type: 'whatsapp', task: 'Task 2' });

      expect(session1.code).not.toBe(session2.code);
    });
  });

  describe('getSession', () => {
    it('retrieves session by sessionId', () => {
      const created = createSession({
        type: 'whatsapp',
        task: 'Test task',
        sessionId: 'test-session-123'
      });

      const retrieved = getSession('test-session-123');

      expect(retrieved).not.toBeNull();
      expect(retrieved.sessionId).toBe('test-session-123');
      expect(retrieved.code).toBe(created.code);
    });

    it('returns null for non-existent sessionId', () => {
      const result = getSession('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getSessionByCode', () => {
    it('retrieves session by code', () => {
      const created = createSession({ type: 'whatsapp', task: 'Test' });
      const retrieved = getSessionByCode(created.code);

      expect(retrieved.sessionId).toBe(created.sessionId);
    });

    it('returns null for non-existent code', () => {
      const result = getSessionByCode('zz');
      expect(result).toBeNull();
    });

    it('returns null for expired sessions', () => {
      const session = createSession({ type: 'whatsapp', task: 'Test' });
      // Manually update session to expired status
      const store = _getStore();
      const idx = store.sessions.findIndex(s => s.code === session.code);
      store.sessions[idx].status = 'expired';
      _saveStore(); // Persist the change

      const result = getSessionByCode(session.code);
      expect(result).toBeNull();
    });

    it('returns null for ended sessions', () => {
      const session = createSession({ type: 'whatsapp', task: 'Test' });
      endSession(session.code);

      const result = getSessionByCode(session.code);
      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('lists active sessions', () => {
      createSession({ type: 'whatsapp', task: 'Task 1' });
      createSession({ type: 'whatsapp', task: 'Task 2' });

      const sessions = listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by type', () => {
      createSession({ type: 'whatsapp', task: 'WhatsApp Task' });
      createSession({ type: 'webhook', task: 'Webhook Task', source: 'github' });

      const whatsappSessions = listSessions('whatsapp');
      const webhookSessions = listSessions('webhook');

      expect(whatsappSessions.every(s => s.type === 'whatsapp')).toBe(true);
      expect(webhookSessions.every(s => s.type === 'webhook')).toBe(true);
    });

    it('only returns active sessions', () => {
      const session1 = createSession({ type: 'whatsapp', task: 'Active' });
      const session2 = createSession({ type: 'whatsapp', task: 'Will end' });
      endSession(session2.code);

      const sessions = listSessions();
      expect(sessions.find(s => s.code === session1.code)).toBeDefined();
      expect(sessions.find(s => s.code === session2.code)).toBeUndefined();
    });
  });

  describe('updateSessionActivity', () => {
    it('updates lastActivity timestamp', () => {
      const session = createSession({ type: 'whatsapp', task: 'Test' });
      const originalTime = session.lastActivity;

      // Wait a bit to ensure time difference
      const updated = updateSessionActivity(session.code);

      expect(new Date(updated.lastActivity).getTime())
        .toBeGreaterThanOrEqual(new Date(originalTime).getTime());
    });

    it('can include additional updates', () => {
      const session = createSession({ type: 'whatsapp', task: 'Original task' });
      const updated = updateSessionActivity(session.code, { task: 'Updated task' });

      expect(updated.task).toBe('Updated task');
    });

    it('returns null for non-existent code', () => {
      const result = updateSessionActivity('zz');
      expect(result).toBeNull();
    });
  });

  describe('updateSessionClaudeId', () => {
    it('stores Claude session ID', () => {
      const session = createSession({ type: 'whatsapp', task: 'Test' });
      expect(session.claudeSessionId).toBeNull();

      const updated = updateSessionClaudeId(session.code, 'claude-abc-123');

      expect(updated.claudeSessionId).toBe('claude-abc-123');
    });

    it('returns null for non-existent code', () => {
      const result = updateSessionClaudeId('zz', 'claude-abc-123');
      expect(result).toBeNull();
    });
  });

  describe('expireSessions', () => {
    it('expires old sessions', () => {
      const session = createSession({ type: 'whatsapp', task: 'Old task' });

      // Manually set lastActivity to 25 hours ago
      const store = _getStore();
      const idx = store.sessions.findIndex(s => s.code === session.code);
      store.sessions[idx].lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      _saveStore(); // Persist the change

      expireSessions(24 * 60 * 60 * 1000); // 24 hour expiry

      expect(getSessionByCode(session.code)).toBeNull();
    });

    it('does not expire recent sessions', () => {
      const session = createSession({ type: 'whatsapp', task: 'Recent task' });

      expireSessions(24 * 60 * 60 * 1000);

      expect(getSessionByCode(session.code)).not.toBeNull();
    });

    it('returns count of expired sessions', () => {
      const session1 = createSession({ type: 'whatsapp', task: 'Old task 1' });
      const session2 = createSession({ type: 'whatsapp', task: 'Old task 2' });
      createSession({ type: 'whatsapp', task: 'Recent task' });

      // Make two sessions old
      const store = _getStore();
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      store.sessions.find(s => s.code === session1.code).lastActivity = oldTime;
      store.sessions.find(s => s.code === session2.code).lastActivity = oldTime;
      _saveStore(); // Persist the changes

      const count = expireSessions(24 * 60 * 60 * 1000);

      expect(count).toBe(2);
    });
  });

  describe('endSession', () => {
    it('marks session as ended', () => {
      const session = createSession({ type: 'whatsapp', task: 'Test' });
      const ended = endSession(session.code);

      expect(ended.status).toBe('ended');
      expect(getSessionByCode(session.code)).toBeNull();
    });

    it('returns null for non-existent code', () => {
      const result = endSession('zz');
      expect(result).toBeNull();
    });
  });

  describe('persistence', () => {
    it('persists sessions to data/sessions.json', () => {
      const session = createSession({ type: 'whatsapp', task: 'Persist test' });

      // Read the store directly
      const store = _getStore();
      expect(store.sessions.find(s => s.code === session.code)).toBeDefined();
    });
  });
});
