// tests/lib/imessage-consultation.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the imessage-pending module
import {
  _setPendingPath
} from '../../lib/imessage-pending.js';

// Import functions to test
import {
  shouldConsultTommy,
  sendConsultation,
  handleConsultationResponse
} from '../../lib/imessage-consultation.js';

describe('imessage-consultation', () => {
  let tempDir;
  let testPendingPath;

  beforeEach(() => {
    // Create temp directory for test pending-questions.json
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imessage-consultation-'));
    testPendingPath = path.join(tempDir, 'pending-questions.json');
    _setPendingPath(testPendingPath);
  });

  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('shouldConsultTommy', () => {
    it('returns false for trusted contacts', () => {
      const contact = { trust_level: 'trusted' };
      expect(shouldConsultTommy(contact, 'any message')).toBe(false);
    });

    it('returns true for not_trusted contacts', () => {
      const contact = { trust_level: 'not_trusted' };
      expect(shouldConsultTommy(contact, 'any message')).toBe(true);
    });

    it('returns false for ignored contacts', () => {
      const contact = { trust_level: 'not_trusted', ignore: true };
      expect(shouldConsultTommy(contact, 'any message')).toBe(false);
    });

    it('returns true for undefined trust_level (unknown contact)', () => {
      const contact = { id: '+15551234567' };
      expect(shouldConsultTommy(contact, 'any message')).toBe(true);
    });

    it('returns false for partial_trust contacts (future: will check permissions)', () => {
      const contact = { trust_level: 'partial_trust' };
      // For now, partial_trust also needs consultation
      expect(shouldConsultTommy(contact, 'any message')).toBe(true);
    });

    it('returns false when contact is null', () => {
      expect(shouldConsultTommy(null, 'any message')).toBe(false);
    });

    it('returns false when contact is undefined', () => {
      expect(shouldConsultTommy(undefined, 'any message')).toBe(false);
    });
  });

  describe('sendConsultation', () => {
    it('formats consultation message with session code', async () => {
      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      const result = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'What is Tommy doing today?',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      expect(result.sessionCode).toBeDefined();
      expect(result.sessionCode).toMatch(/^[a-z0-9]{2}$/);
      expect(sentMessages[0].phone).toBe('+12069090025');
      expect(sentMessages[0].msg).toContain('Sarah');
      expect(sentMessages[0].msg).toContain('What is Tommy doing today?');
      expect(sentMessages[0].msg).toContain('allow');
      expect(sentMessages[0].msg).toContain('deny');
    });

    it('uses phone number if no display_name', async () => {
      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      const result = await sendConsultation({
        contact: { id: '+15551234567', display_name: null },
        message: 'Hello',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      expect(sentMessages[0].msg).toContain('+15551234567');
    });

    it('creates pending question entry', async () => {
      const mockSend = async () => {};

      const result = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'What is Tommy doing today?',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      expect(result.phoneNumber).toBe('+15551234567');
      expect(result.question).toBe('What is Tommy doing today?');
      expect(result.status).toBe('pending');
    });

    it('includes session code in message format', async () => {
      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      const result = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test message',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      // Message should contain the session code for reference
      expect(sentMessages[0].msg).toContain(`/${result.sessionCode}`);
    });

    it('persists pending entry to disk', async () => {
      const mockSend = async () => {};

      await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test message',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      expect(savedData).toHaveLength(1);
      expect(savedData[0].phoneNumber).toBe('+15551234567');
    });

    it('uses id when display_name is undefined', async () => {
      const sentMessages = [];
      const mockSend = async (phone, msg) => sentMessages.push({ phone, msg });

      await sendConsultation({
        contact: { id: '+15559998888' },
        message: 'Hello',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      expect(sentMessages[0].msg).toContain('+15559998888');
    });
  });

  describe('handleConsultationResponse', () => {
    it('resolves pending question with allow action', async () => {
      // First create a pending consultation
      const mockSend = async () => {};
      const pending = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test question',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      // Handle the response
      const result = await handleConsultationResponse(
        pending.sessionCode,
        'allow',
        'He is free today',
        mockSend
      );

      expect(result).not.toBeNull();
      expect(result.status).toBe('allowed');
      expect(result.response).toBe('He is free today');
    });

    it('resolves pending question with deny action', async () => {
      const mockSend = async () => {};
      const pending = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test question',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      const result = await handleConsultationResponse(
        pending.sessionCode,
        'deny',
        null,
        mockSend
      );

      expect(result).not.toBeNull();
      expect(result.status).toBe('denied');
    });

    it('returns null for non-existent session code', async () => {
      const mockSend = async () => {};

      const result = await handleConsultationResponse(
        'zz',
        'allow',
        null,
        mockSend
      );

      expect(result).toBeNull();
    });

    it('sets resolvedAt timestamp', async () => {
      const mockSend = async () => {};
      const pending = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test question',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      const before = new Date().toISOString();
      const result = await handleConsultationResponse(
        pending.sessionCode,
        'allow',
        null,
        mockSend
      );
      const after = new Date().toISOString();

      expect(result.resolvedAt).toBeDefined();
      expect(result.resolvedAt >= before).toBe(true);
      expect(result.resolvedAt <= after).toBe(true);
    });

    it('persists resolution to disk', async () => {
      const mockSend = async () => {};
      const pending = await sendConsultation({
        contact: { id: '+15551234567', display_name: 'Sarah' },
        message: 'Test question',
        sendMessage: mockSend,
        tommyPhone: '+12069090025'
      });

      await handleConsultationResponse(
        pending.sessionCode,
        'deny',
        'Not available',
        mockSend
      );

      const savedData = JSON.parse(fs.readFileSync(testPendingPath, 'utf-8'));
      expect(savedData[0].status).toBe('denied');
      expect(savedData[0].response).toBe('Not available');
    });
  });
});
