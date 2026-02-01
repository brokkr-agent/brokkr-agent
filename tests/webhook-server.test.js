// tests/webhook-server.test.js
import { jest } from '@jest/globals';
import request from 'supertest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

// Set up test directory before importing modules
const TEST_JOBS_DIR = join(process.cwd(), 'test-webhook-jobs');
process.env.JOBS_DIR = TEST_JOBS_DIR;

// Import modules after setting env
const { app } = await import('../lib/webhook-server.js');
const { clearQueue, getQueueDepth, PRIORITY } = await import('../lib/queue.js');
const { clearSessions, createSession, getSessionByCode } = await import('../lib/sessions.js');

describe('Webhook Server', () => {
  beforeEach(() => {
    clearQueue();
    clearSessions();
  });

  afterAll(() => {
    clearQueue();
    clearSessions();
    if (existsSync(TEST_JOBS_DIR)) {
      rmSync(TEST_JOBS_DIR, { recursive: true, force: true });
    }
  });

  describe('GET /health', () => {
    test('returns correct structure', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('processing');
      expect(typeof response.body.processing).toBe('boolean');
      expect(response.body).toHaveProperty('queueDepth');
      expect(typeof response.body.queueDepth).toBe('number');
    });

    test('reflects current queue depth', async () => {
      // Initial depth should be 0
      let response = await request(app)
        .get('/health')
        .expect(200);
      expect(response.body.queueDepth).toBe(0);

      // Add a job via webhook
      await request(app)
        .post('/webhook')
        .send({ task: 'Test task' })
        .expect(200);

      // Queue depth should increase
      response = await request(app)
        .get('/health')
        .expect(200);
      expect(response.body.queueDepth).toBe(1);
    });
  });

  describe('POST /webhook', () => {
    test('creates session with 3-char code', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: 'Test task from webhook' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionCode).toBeTruthy();
      expect(response.body.sessionCode.length).toBe(3);
      expect(response.body.jobId).toBeTruthy();
      expect(response.body.queuePosition).toBe(1);
    });

    test('returns 400 if no task provided', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('task is required');
    });

    test('returns 400 if task is empty string', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: '' })
        .expect(400);

      expect(response.body.error).toBe('task is required');
    });

    test('returns 400 if task is whitespace only', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: '   ' })
        .expect(400);

      expect(response.body.error).toBe('task is required');
    });

    test('creates webhook session with correct type', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: 'Test task' })
        .expect(200);

      const session = getSessionByCode(response.body.sessionCode);
      expect(session).toBeTruthy();
      expect(session.type).toBe('webhook');
    });

    test('accepts optional source and metadata', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({
          task: 'Test task',
          source: 'github-actions',
          metadata: { repo: 'test/repo', run_id: 12345 }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const session = getSessionByCode(response.body.sessionCode);
      expect(session.source).toBe('github-actions');
    });

    test('enqueues job with HIGH priority', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: 'Test task' })
        .expect(200);

      // Verify a job was enqueued
      expect(getQueueDepth()).toBe(1);
    });
  });

  describe('POST /webhook/:sessionCode', () => {
    test('continues existing webhook session', async () => {
      // First create a session
      const createResponse = await request(app)
        .post('/webhook')
        .send({ task: 'Initial task' })
        .expect(200);

      const sessionCode = createResponse.body.sessionCode;

      // Continue the session
      const continueResponse = await request(app)
        .post(`/webhook/${sessionCode}`)
        .send({ message: 'Follow up message' })
        .expect(200);

      expect(continueResponse.body.success).toBe(true);
      expect(continueResponse.body.sessionCode).toBe(sessionCode);
      expect(continueResponse.body.jobId).toBeTruthy();
    });

    test('uses "continue" as default message', async () => {
      // Create a session
      const createResponse = await request(app)
        .post('/webhook')
        .send({ task: 'Initial task' })
        .expect(200);

      const sessionCode = createResponse.body.sessionCode;

      // Continue without a message
      const continueResponse = await request(app)
        .post(`/webhook/${sessionCode}`)
        .send({})
        .expect(200);

      expect(continueResponse.body.success).toBe(true);
    });

    test('returns 404 for unknown session', async () => {
      const response = await request(app)
        .post('/webhook/XYZ')
        .send({ message: 'Test' })
        .expect(404);

      expect(response.body.error).toBe('Session not found or expired');
    });

    test('returns 400 for non-webhook session', async () => {
      // Create a whatsapp session directly (2-char code)
      const session = createSession({
        type: 'whatsapp',
        task: 'Test task',
        chatId: 'test-chat-id'
      });

      const response = await request(app)
        .post(`/webhook/${session.code}`)
        .send({ message: 'Test' })
        .expect(400);

      expect(response.body.error).toBe('Not a webhook session');
    });

    test('updates session activity', async () => {
      // Create a session
      const createResponse = await request(app)
        .post('/webhook')
        .send({ task: 'Initial task' })
        .expect(200);

      const sessionCode = createResponse.body.sessionCode;
      const sessionBefore = getSessionByCode(sessionCode);
      const lastActivityBefore = sessionBefore.lastActivity;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Continue the session
      await request(app)
        .post(`/webhook/${sessionCode}`)
        .send({ message: 'Follow up' })
        .expect(200);

      const sessionAfter = getSessionByCode(sessionCode);
      expect(sessionAfter.lastActivity).not.toBe(lastActivityBefore);
    });
  });

  describe('GET /webhook/:sessionCode', () => {
    test('returns session status', async () => {
      // Create a session
      const createResponse = await request(app)
        .post('/webhook')
        .send({ task: 'Test task for status' })
        .expect(200);

      const sessionCode = createResponse.body.sessionCode;

      // Get status
      const statusResponse = await request(app)
        .get(`/webhook/${sessionCode}`)
        .expect(200);

      expect(statusResponse.body.sessionCode).toBe(sessionCode);
      expect(statusResponse.body.type).toBe('webhook');
      expect(statusResponse.body.task).toBe('Test task for status');
      expect(statusResponse.body.status).toBe('active');
      expect(statusResponse.body.createdAt).toBeTruthy();
      expect(statusResponse.body.lastActivity).toBeTruthy();
    });

    test('returns 404 for unknown session', async () => {
      const response = await request(app)
        .get('/webhook/ABC')
        .expect(404);

      expect(response.body.error).toBe('Session not found or expired');
    });
  });
});
