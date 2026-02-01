// tests/lib/imessage-permissions.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Import functions to test
import {
  getContact,
  updateContact,
  createContact,
  getOrCreateContact,
  TRUST_LEVELS,
  _setContactsPath
} from '../../lib/imessage-permissions.js';

describe('imessage-permissions', () => {
  let tempDir;
  let testContactsPath;

  beforeEach(() => {
    // Create temp directory for test contacts.json
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imessage-test-'));
    testContactsPath = path.join(tempDir, 'contacts.json');
    _setContactsPath(testContactsPath);
  });

  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('TRUST_LEVELS', () => {
    it('should have NOT_TRUSTED level', () => {
      expect(TRUST_LEVELS.NOT_TRUSTED).toBe('not_trusted');
    });

    it('should have PARTIAL_TRUST level', () => {
      expect(TRUST_LEVELS.PARTIAL_TRUST).toBe('partial_trust');
    });

    it('should have TRUSTED level', () => {
      expect(TRUST_LEVELS.TRUSTED).toBe('trusted');
    });

    it('should have exactly three trust levels', () => {
      expect(Object.keys(TRUST_LEVELS)).toHaveLength(3);
    });
  });

  describe('getContact', () => {
    it('returns null for unknown contact when file does not exist', () => {
      const contact = getContact('+15551234567');
      expect(contact).toBeNull();
    });

    it('returns null for unknown contact when file exists but contact not present', () => {
      const testData = {
        '+15559999999': {
          id: '+15559999999',
          trust_level: 'not_trusted'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const contact = getContact('+15551234567');
      expect(contact).toBeNull();
    });

    it('returns contact data for known contact', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          first_seen: '2026-02-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const contact = getContact('+15551234567');
      expect(contact).toEqual(testData['+15551234567']);
    });

    it('handles malformed JSON gracefully', () => {
      fs.writeFileSync(testContactsPath, 'not valid json');

      const contact = getContact('+15551234567');
      expect(contact).toBeNull();
    });
  });

  describe('createContact', () => {
    it('creates a new contact with default not_trusted level', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');

      expect(contact.id).toBe('+15559876543');
      expect(contact.service).toBe('iMessage');
      expect(contact.country).toBe('us');
      expect(contact.trust_level).toBe('not_trusted');
    });

    it('sets permissions to empty object', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.permissions).toEqual({});
    });

    it('sets command_permissions to empty array', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.command_permissions).toEqual([]);
    });

    it('sets denied_requests to empty array', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.denied_requests).toEqual([]);
    });

    it('sets approved_requests to empty array', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.approved_requests).toEqual([]);
    });

    it('sets display_name to null', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.display_name).toBeNull();
    });

    it('sets response_style to null', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.response_style).toBeNull();
    });

    it('sets topics_discussed to empty array', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.topics_discussed).toEqual([]);
    });

    it('sets sentiment_history to null', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.sentiment_history).toBeNull();
    });

    it('sets spam_score to 0', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.spam_score).toBe(0);
    });

    it('sets ignore to false', () => {
      const contact = createContact('+15559876543', 'iMessage', 'us');
      expect(contact.ignore).toBe(false);
    });

    it('sets first_seen to ISO timestamp', () => {
      const before = new Date().toISOString();
      const contact = createContact('+15559876543', 'iMessage', 'us');
      const after = new Date().toISOString();

      expect(contact.first_seen).toBeDefined();
      expect(typeof contact.first_seen).toBe('string');
      // Verify timestamp is within expected range
      expect(contact.first_seen >= before).toBe(true);
      expect(contact.first_seen <= after).toBe(true);
    });

    it('sets last_interaction to ISO timestamp', () => {
      const before = new Date().toISOString();
      const contact = createContact('+15559876543', 'iMessage', 'us');
      const after = new Date().toISOString();

      expect(contact.last_interaction).toBeDefined();
      expect(contact.last_interaction >= before).toBe(true);
      expect(contact.last_interaction <= after).toBe(true);
    });

    it('persists the new contact to disk', () => {
      createContact('+15559876543', 'iMessage', 'us');

      const savedData = JSON.parse(fs.readFileSync(testContactsPath, 'utf-8'));
      expect(savedData['+15559876543']).toBeDefined();
      expect(savedData['+15559876543'].id).toBe('+15559876543');
    });

    it('preserves existing contacts when creating new one', () => {
      const existingData = {
        '+15551111111': {
          id: '+15551111111',
          trust_level: 'trusted'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(existingData));

      createContact('+15559876543', 'iMessage', 'us');

      const savedData = JSON.parse(fs.readFileSync(testContactsPath, 'utf-8'));
      expect(savedData['+15551111111']).toBeDefined();
      expect(savedData['+15559876543']).toBeDefined();
    });
  });

  describe('updateContact', () => {
    it('updates existing contact with new data', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          display_name: null,
          first_seen: '2026-01-01T00:00:00.000Z',
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const updated = updateContact('+15551234567', { display_name: 'John Doe' });

      expect(updated.display_name).toBe('John Doe');
    });

    it('preserves existing fields when updating', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          display_name: null,
          service: 'iMessage',
          first_seen: '2026-01-01T00:00:00.000Z',
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const updated = updateContact('+15551234567', { display_name: 'John Doe' });

      expect(updated.trust_level).toBe('not_trusted');
      expect(updated.service).toBe('iMessage');
      expect(updated.first_seen).toBe('2026-01-01T00:00:00.000Z');
    });

    it('updates last_interaction timestamp automatically', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const before = new Date().toISOString();
      const updated = updateContact('+15551234567', { display_name: 'John Doe' });
      const after = new Date().toISOString();

      expect(updated.last_interaction >= before).toBe(true);
      expect(updated.last_interaction <= after).toBe(true);
    });

    it('persists updates to disk', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          display_name: null,
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      updateContact('+15551234567', { trust_level: 'trusted' });

      const savedData = JSON.parse(fs.readFileSync(testContactsPath, 'utf-8'));
      expect(savedData['+15551234567'].trust_level).toBe('trusted');
    });

    it('returns null if contact does not exist', () => {
      const result = updateContact('+15551234567', { display_name: 'John' });
      expect(result).toBeNull();
    });

    it('can update multiple fields at once', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'not_trusted',
          display_name: null,
          spam_score: 0,
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const updated = updateContact('+15551234567', {
        trust_level: 'partial_trust',
        display_name: 'Jane Doe',
        spam_score: 5
      });

      expect(updated.trust_level).toBe('partial_trust');
      expect(updated.display_name).toBe('Jane Doe');
      expect(updated.spam_score).toBe(5);
    });
  });

  describe('getOrCreateContact', () => {
    it('returns existing contact if found', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'trusted',
          display_name: 'Existing User',
          first_seen: '2026-01-01T00:00:00.000Z',
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      const contact = getOrCreateContact('+15551234567', 'iMessage', 'us');

      expect(contact.display_name).toBe('Existing User');
      expect(contact.trust_level).toBe('trusted');
    });

    it('creates new contact if not found', () => {
      const contact = getOrCreateContact('+15559876543', 'SMS', 'ca');

      expect(contact.id).toBe('+15559876543');
      expect(contact.service).toBe('SMS');
      expect(contact.country).toBe('ca');
      expect(contact.trust_level).toBe('not_trusted');
    });

    it('does not modify existing contact when getting', () => {
      const testData = {
        '+15551234567': {
          id: '+15551234567',
          trust_level: 'trusted',
          service: 'iMessage',
          country: 'us',
          display_name: 'Existing',
          first_seen: '2026-01-01T00:00:00.000Z',
          last_interaction: '2026-01-01T00:00:00.000Z'
        }
      };
      fs.writeFileSync(testContactsPath, JSON.stringify(testData));

      // Try to get with different service/country
      getOrCreateContact('+15551234567', 'SMS', 'mx');

      // Should not have changed
      const savedData = JSON.parse(fs.readFileSync(testContactsPath, 'utf-8'));
      expect(savedData['+15551234567'].service).toBe('iMessage');
      expect(savedData['+15551234567'].country).toBe('us');
    });

    it('persists new contact to disk when created', () => {
      getOrCreateContact('+15559876543', 'iMessage', 'us');

      const savedData = JSON.parse(fs.readFileSync(testContactsPath, 'utf-8'));
      expect(savedData['+15559876543']).toBeDefined();
    });
  });

  describe('_setContactsPath', () => {
    it('allows changing the contacts file path', () => {
      const customPath = path.join(tempDir, 'custom-contacts.json');
      _setContactsPath(customPath);

      createContact('+15551234567', 'iMessage', 'us');

      expect(fs.existsSync(customPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(customPath, 'utf-8'));
      expect(data['+15551234567']).toBeDefined();
    });
  });
});
