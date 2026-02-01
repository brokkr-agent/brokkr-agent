/**
 * Tests for contacts.json initial data
 * Task 11: Create Initial Contacts.json Storage File
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTACTS_PATH = join(__dirname, '..', 'contacts.json');

describe('contacts.json', () => {
  let contacts;

  beforeAll(async () => {
    const content = await readFile(CONTACTS_PATH, 'utf-8');
    contacts = JSON.parse(content);
  });

  describe('Tommy contact entry', () => {
    const TOMMY_PHONE = '+12069090025';

    it('contains Tommy\'s phone number as a key', () => {
      expect(contacts).toHaveProperty(TOMMY_PHONE);
    });

    it('has Tommy with trust_level "trusted"', () => {
      expect(contacts[TOMMY_PHONE]).toHaveProperty('trust_level', 'trusted');
    });

    it('has Tommy with command_permissions ["*"] (all permissions)', () => {
      expect(contacts[TOMMY_PHONE]).toHaveProperty('command_permissions');
      expect(contacts[TOMMY_PHONE].command_permissions).toEqual(['*']);
    });

    it('has correct contact structure', () => {
      const tommy = contacts[TOMMY_PHONE];

      // Verify required fields exist
      expect(tommy).toHaveProperty('id', TOMMY_PHONE);
      expect(tommy).toHaveProperty('service', 'iMessage');
      expect(tommy).toHaveProperty('country', 'us');
      expect(tommy).toHaveProperty('display_name', 'Tommy');
      expect(tommy).toHaveProperty('trust_level', 'trusted');
      expect(tommy).toHaveProperty('permissions');
      expect(tommy).toHaveProperty('command_permissions');
      expect(tommy).toHaveProperty('denied_requests');
      expect(tommy).toHaveProperty('approved_requests');
      expect(tommy).toHaveProperty('response_style');
      expect(tommy).toHaveProperty('topics_discussed');
      expect(tommy).toHaveProperty('sentiment_history');
      expect(tommy).toHaveProperty('spam_score', 0);
      expect(tommy).toHaveProperty('ignore', false);
      expect(tommy).toHaveProperty('first_seen');
      expect(tommy).toHaveProperty('last_interaction');
    });

    it('has empty arrays for denied_requests, approved_requests, and topics_discussed', () => {
      const tommy = contacts[TOMMY_PHONE];
      expect(tommy.denied_requests).toEqual([]);
      expect(tommy.approved_requests).toEqual([]);
      expect(tommy.topics_discussed).toEqual([]);
    });

    it('has empty permissions object', () => {
      const tommy = contacts[TOMMY_PHONE];
      expect(tommy.permissions).toEqual({});
    });
  });
});
