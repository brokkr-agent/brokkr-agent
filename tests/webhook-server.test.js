// tests/webhook-server.test.js
import { jest } from '@jest/globals';
import request from 'supertest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { signRequest } from '../lib/hmac.js';

// Set up test directory before importing modules
const TEST_JOBS_DIR = join(process.cwd(), 'test-webhook-jobs');
process.env.JOBS_DIR = TEST_JOBS_DIR;

// Import modules after setting env
const { app, setDryRunMode, setDebugMode, isDryRunMode, isDebugMode } = await import('../lib/webhook-server.js');
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

  describe('Dry-run mode', () => {
    beforeEach(() => {
      // Enable dry-run mode for these tests
      setDryRunMode(true);
      clearQueue();
      clearSessions();
    });

    afterEach(() => {
      // Disable dry-run mode after tests
      setDryRunMode(false);
    });

    test('POST /webhook returns mock session code in dry-run mode', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({ task: 'Test dry-run task' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionCode).toBe('dry');
      expect(response.body.jobId).toBe('dry-run-job');
      expect(response.body.dryRun).toBe(true);
      expect(response.body.queuePosition).toBe(0);
    });

    test('POST /webhook does not create real session in dry-run mode', async () => {
      await request(app)
        .post('/webhook')
        .send({ task: 'Test dry-run task' })
        .expect(200);

      // Verify no real session was created (getSessionByCode returns null for non-existent)
      const session = getSessionByCode('dry');
      expect(session).toBeNull();

      // Verify queue is empty (no job was enqueued)
      expect(getQueueDepth()).toBe(0);
    });

    test('POST /webhook/:sessionCode handles "dry" session', async () => {
      const response = await request(app)
        .post('/webhook/dry')
        .send({ message: 'Follow up in dry-run' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessionCode).toBe('dry');
      expect(response.body.jobId).toBe('dry-run-job');
      expect(response.body.dryRun).toBe(true);
    });

    test('GET /webhook/dry returns mock session data', async () => {
      const response = await request(app)
        .get('/webhook/dry')
        .expect(200);

      expect(response.body.sessionCode).toBe('dry');
      expect(response.body.type).toBe('webhook');
      expect(response.body.task).toBe('dry-run test task');
      expect(response.body.status).toBe('active');
      expect(response.body.dryRun).toBe(true);
    });

    test('GET /health works normally in dry-run mode', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('processing');
      expect(response.body).toHaveProperty('queueDepth');
    });

    test('dry-run mode still validates task input', async () => {
      const response = await request(app)
        .post('/webhook')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('task is required');
    });

    test('can still access real sessions in dry-run mode', async () => {
      // Temporarily disable dry-run to create a real session
      setDryRunMode(false);
      const createResponse = await request(app)
        .post('/webhook')
        .send({ task: 'Real task' })
        .expect(200);

      const realSessionCode = createResponse.body.sessionCode;
      expect(realSessionCode).not.toBe('dry');

      // Re-enable dry-run mode
      setDryRunMode(true);

      // Should still be able to get the real session
      const statusResponse = await request(app)
        .get(`/webhook/${realSessionCode}`)
        .expect(200);

      expect(statusResponse.body.sessionCode).toBe(realSessionCode);
      expect(statusResponse.body.dryRun).toBeUndefined();
    });
  });

  describe('Debug mode', () => {
    let originalConsoleLog;
    let logOutput;

    beforeEach(() => {
      // Capture console.log output
      logOutput = [];
      originalConsoleLog = console.log;
      console.log = (...args) => {
        logOutput.push(args.join(' '));
        originalConsoleLog(...args);
      };
      setDebugMode(true);
      clearQueue();
      clearSessions();
    });

    afterEach(() => {
      console.log = originalConsoleLog;
      setDebugMode(false);
    });

    test('logs incoming requests in debug mode', async () => {
      await request(app)
        .post('/webhook')
        .send({ task: 'Debug test task' })
        .expect(200);

      const requestLog = logOutput.find(line => line.includes('[DEBUG] --> POST /webhook'));
      expect(requestLog).toBeTruthy();
      expect(requestLog).toContain('Debug test task');
    });

    test('logs outgoing responses in debug mode', async () => {
      await request(app)
        .post('/webhook')
        .send({ task: 'Debug test task' })
        .expect(200);

      const responseLog = logOutput.find(line => line.includes('[DEBUG] <-- 200'));
      expect(responseLog).toBeTruthy();
      expect(responseLog).toContain('success');
    });

    test('logs GET requests in debug mode', async () => {
      await request(app)
        .get('/health')
        .expect(200);

      const requestLog = logOutput.find(line => line.includes('[DEBUG] --> GET /health'));
      expect(requestLog).toBeTruthy();
    });
  });

  describe('Mode state functions', () => {
    afterEach(() => {
      setDryRunMode(false);
      setDebugMode(false);
    });

    test('isDryRunMode returns correct state', () => {
      expect(isDryRunMode()).toBe(false);
      setDryRunMode(true);
      expect(isDryRunMode()).toBe(true);
      setDryRunMode(false);
      expect(isDryRunMode()).toBe(false);
    });

    test('isDebugMode returns correct state', () => {
      expect(isDebugMode()).toBe(false);
      setDebugMode(true);
      expect(isDebugMode()).toBe(true);
      setDebugMode(false);
      expect(isDebugMode()).toBe(false);
    });
  });

  describe('BrokkrMVP Protocol', () => {
    const TEST_SECRET = 'test-webhook-secret';
    const TEST_AGENT_ID = 'test-agent-uuid';

    // Helper to create signed request
    function signedRequest(body) {
      const { timestamp, signature } = signRequest(body, TEST_SECRET);
      return {
        headers: {
          'x-agent-id': TEST_AGENT_ID,
          'x-timestamp': timestamp.toString(),
          'x-signature': signature
        },
        body
      };
    }

    describe('POST /webhook with fat payload', () => {
      it('should accept task.created event with valid signature', async () => {
        const payload = {
          event: 'task.created',
          task: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            task_type: 'equipment_research',
            priority: 75,
            input_data: {
              equipment_type: 'laser_cutter',
              user_context: 'Find laser cutters for acrylic'
            },
            messages: [],
            session_code: 'xyz'
          }
        };
        const { headers, body } = signedRequest(payload);

        const res = await request(app)
          .post('/webhook')
          .set(headers)
          .send(body);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('accepted');
        expect(res.body.queue_position).toBeDefined();
      });

      it('should reject request with invalid signature', async () => {
        const payload = { event: 'task.created', task: { id: '123' } };

        const res = await request(app)
          .post('/webhook')
          .set({
            'x-agent-id': TEST_AGENT_ID,
            'x-timestamp': Math.floor(Date.now() / 1000).toString(),
            'x-signature': 'sha256=invalid'
          })
          .send(payload);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid signature');
      });

      it('should reject request with expired timestamp', async () => {
        const payload = { event: 'task.created', task: { id: '123' } };
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
        const { signature } = signRequest(payload, TEST_SECRET, oldTimestamp);

        const res = await request(app)
          .post('/webhook')
          .set({
            'x-agent-id': TEST_AGENT_ID,
            'x-timestamp': oldTimestamp.toString(),
            'x-signature': signature
          })
          .send(payload);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Request timestamp expired');
      });
    });

    describe('task.clarification event', () => {
      it('should update existing job with new messages', async () => {
        // First create a task
        const createPayload = {
          event: 'task.created',
          task: {
            id: 'clarify-task-id',
            task_type: 'equipment_research',
            priority: 75,
            input_data: { query: 'test' },
            messages: [],
            session_code: 'cla'
          }
        };
        let { headers, body } = signedRequest(createPayload);
        await request(app).post('/webhook').set(headers).send(body);

        // Now send clarification
        const clarifyPayload = {
          event: 'task.clarification',
          task: {
            id: 'clarify-task-id',
            task_type: 'equipment_research',
            input_data: { query: 'test' },
            messages: [
              { role: 'agent', content: 'What size?' },
              { role: 'user', content: '3mm' }
            ],
            session_code: 'cla'
          }
        };
        ({ headers, body } = signedRequest(clarifyPayload));

        const res = await request(app)
          .post('/webhook')
          .set(headers)
          .send(body);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('accepted');
      });
    });

    describe('task.cancelled event', () => {
      it('should cancel existing job', async () => {
        // First create a task
        const createPayload = {
          event: 'task.created',
          task: {
            id: 'cancel-task-id',
            task_type: 'equipment_research',
            priority: 75,
            input_data: {},
            messages: [],
            session_code: 'can'
          }
        };
        let { headers, body } = signedRequest(createPayload);
        await request(app).post('/webhook').set(headers).send(body);

        // Now cancel it
        const cancelPayload = {
          event: 'task.cancelled',
          task: {
            id: 'cancel-task-id',
            session_code: 'can'
          }
        };
        ({ headers, body } = signedRequest(cancelPayload));

        const res = await request(app)
          .post('/webhook')
          .set(headers)
          .send(body);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('cancelled');
      });
    });
  });
});
