// tests/lib/imessage-pending.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import functions to test
import {
  addPendingQuestion,
  getPendingQuestions,
  getPendingByCode,
  resolvePending,
  generateSessionCode,
  _setPendingPath
} from '../../lib/imessage-pending.js';

describe('imessage-pending', () => {
  let tempDir;
  let testPendingPath;

  beforeEach(() => {
    // Create temp directory for test pending-questions.json
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imessage-pending-'));
    testPendingPath = path.join(tempDir, 'pending-questions.json');
    _setPendingPath(testPendingPath);
  });

  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateSessionCode', () => {
    it('generates a 2-character code with lowercase letters and digits', () => {
      // Create empty file so no existing codes
      fs.writeFileSync(testPendingPath, '[]');

      const code = generateSessionCode();
      expect(code).toMatch(/^[a-z0-9]{2}$/);
    });

    it('generates unique codes (no collision with existing)', () => {
      // Pre-populate with some existing codes
      const existingQuestions = [
        { sessionCode: 'a1', phoneNumber: '+1555', question: 'Q1', status: 'pending' },
        { sessionCode: 'b2', phoneNumber: '+1555', question: 'Q2', status: 'pending' }
      ];
      fs.writeFileSync(testPendingPath, JSON.stringify(existingQuestions));

      // Generate multiple codes and verify none collide
      const newCodes = new Set();
      for (let i = 0; i < 20; i++) {
        const code = generateSessionCode();
        expect(code).not.toBe('a1');
        expect(code).not.toBe('b2');
        newCodes.add(code);
      }
      // Most should be unique (allowing some randomness)
      expect(newCodes.size).toBeGreaterThan(15);
    });

    it('works when pending file does not exist', () => {
      // Don't create the file
      const code = generateSessionCode();
      expect(code).toMatch(/^[a-z0-9]{2}$/);
    });
  });

  describe('addPendingQuestion', () => {
    it('creates a pending question with session code', () => {
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'What is Tommy doing today?',
        context: 'Asking about schedule'
      });

      expect(pending.sessionCode).toMatch(/^[a-z0-9]{2}$/);
      expect(pending.phoneNumber).toBe('+15551234567');
      expect(pending.question).toBe('What is Tommy doing today?');
      expect(pending.status).toBe('pending');
      expect(pending.createdAt).toBeDefined();
    });

    it('sets context field correctly', () => {
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'What is Tommy doing today?',
        context: 'Asking about schedule'
      });

      expect(pending.context).toBe('Asking about schedule');
    });

    it('sets resolvedAt to null initially', () => {
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      expect(pending.resolvedAt).toBeNull();
    });

    it('sets response to null initially', () => {
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      expect(pending.response).toBeNull();
    });

    it('sets createdAt to ISO timestamp', () => {
      const before = new Date().toISOString();
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });
      const after = new Date().toISOString();

      expect(pending.createdAt >= before).toBe(true);
      expect(pending.createdAt <= after).toBe(true);
    });

    it('persists the pending question to disk', () => {
      addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      expect(savedData).toHaveLength(1);
      expect(savedData[0].phoneNumber).toBe('+15551234567');
    });

    it('appends to existing pending questions', () => {
      addPendingQuestion({
        phoneNumber: '+15551111111',
        question: 'First question'
      });
      addPendingQuestion({
        phoneNumber: '+15552222222',
        question: 'Second question'
      });

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      expect(savedData).toHaveLength(2);
    });

    it('handles missing context gracefully', () => {
      const pending = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
        // No context provided
      });

      expect(pending.context).toBeUndefined();
    });
  });

  describe('getPendingQuestions', () => {
    it('returns all pending questions when no status filter', () => {
      addPendingQuestion({ phoneNumber: '+1555111', question: 'Q1' });
      addPendingQuestion({ phoneNumber: '+1555222', question: 'Q2' });

      const pending = getPendingQuestions();
      expect(pending).toHaveLength(2);
    });

    it('returns empty array when no pending questions exist', () => {
      const pending = getPendingQuestions();
      expect(pending).toEqual([]);
    });

    it('returns empty array when file does not exist', () => {
      // testPendingPath does not exist
      const pending = getPendingQuestions();
      expect(pending).toEqual([]);
    });

    it('filters by pending status', () => {
      addPendingQuestion({ phoneNumber: '+1555111', question: 'Q1' });
      const created = addPendingQuestion({ phoneNumber: '+1555222', question: 'Q2' });
      resolvePending(created.sessionCode, 'allow');

      const pending = getPendingQuestions('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].question).toBe('Q1');
    });

    it('filters by allowed status', () => {
      const created1 = addPendingQuestion({ phoneNumber: '+1555111', question: 'Q1' });
      addPendingQuestion({ phoneNumber: '+1555222', question: 'Q2' });
      resolvePending(created1.sessionCode, 'allow');

      const allowed = getPendingQuestions('allowed');
      expect(allowed).toHaveLength(1);
      expect(allowed[0].question).toBe('Q1');
    });

    it('filters by denied status', () => {
      const created1 = addPendingQuestion({ phoneNumber: '+1555111', question: 'Q1' });
      addPendingQuestion({ phoneNumber: '+1555222', question: 'Q2' });
      resolvePending(created1.sessionCode, 'deny');

      const denied = getPendingQuestions('denied');
      expect(denied).toHaveLength(1);
      expect(denied[0].question).toBe('Q1');
    });

    it('handles malformed JSON gracefully', () => {
      fs.writeFileSync(testPendingPath, 'not valid json');

      const pending = getPendingQuestions();
      expect(pending).toEqual([]);
    });
  });

  describe('getPendingByCode', () => {
    it('returns pending entry by session code', () => {
      const created = addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      const found = getPendingByCode(created.sessionCode);
      expect(found).not.toBeNull();
      expect(found.phoneNumber).toBe('+15551234567');
      expect(found.question).toBe('Test question');
    });

    it('returns null for non-existent session code', () => {
      addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      const found = getPendingByCode('zz');
      expect(found).toBeNull();
    });

    it('returns null when no pending questions exist', () => {
      const found = getPendingByCode('ab');
      expect(found).toBeNull();
    });

    it('returns null when file does not exist', () => {
      // testPendingPath does not exist
      const found = getPendingByCode('ab');
      expect(found).toBeNull();
    });
  });

  describe('resolvePending', () => {
    it('marks question as allowed and returns it', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      const resolved = resolvePending(created.sessionCode, 'allow');

      expect(resolved.status).toBe('allowed');
      expect(resolved.resolvedAt).toBeDefined();
    });

    it('marks question as denied and returns it', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      const resolved = resolvePending(created.sessionCode, 'deny');

      expect(resolved.status).toBe('denied');
    });

    it('sets resolvedAt to ISO timestamp', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });

      const before = new Date().toISOString();
      const resolved = resolvePending(created.sessionCode, 'allow');
      const after = new Date().toISOString();

      expect(resolved.resolvedAt >= before).toBe(true);
      expect(resolved.resolvedAt <= after).toBe(true);
    });

    it('sets optional response message', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      const resolved = resolvePending(created.sessionCode, 'allow', 'He is at a meeting');

      expect(resolved.response).toBe('He is at a meeting');
    });

    it('leaves response as null when not provided', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      const resolved = resolvePending(created.sessionCode, 'allow');

      expect(resolved.response).toBeNull();
    });

    it('persists resolution to disk', () => {
      const created = addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      resolvePending(created.sessionCode, 'allow', 'Response text');

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      expect(savedData[0].status).toBe('allowed');
      expect(savedData[0].response).toBe('Response text');
    });

    it('returns null for non-existent session code', () => {
      addPendingQuestion({ phoneNumber: '+1555', question: 'Q' });
      const resolved = resolvePending('zz', 'allow');

      expect(resolved).toBeNull();
    });

    it('does not modify other pending questions', () => {
      const created1 = addPendingQuestion({ phoneNumber: '+1555111', question: 'Q1' });
      addPendingQuestion({ phoneNumber: '+1555222', question: 'Q2' });

      resolvePending(created1.sessionCode, 'allow');

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      const q2 = savedData.find(q => q.question === 'Q2');
      expect(q2.status).toBe('pending');
    });
  });

  describe('_setPendingPath', () => {
    it('allows changing the pending questions file path', () => {
      const customPath = path.join(tempDir, 'custom-pending.json');
      _setPendingPath(customPath);

      addPendingQuestion({
        phoneNumber: '+15551234567',
        question: 'Test question'
      });

      expect(fs.existsSync(customPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
      expect(data).toHaveLength(1);
    });
  });
});
