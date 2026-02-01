// lib/imessage-permissions.js
// Contact permissions storage module for iMessage Advanced Assistant
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trust levels constant
export const TRUST_LEVELS = {
  NOT_TRUSTED: 'not_trusted',
  PARTIAL_TRUST: 'partial_trust',
  TRUSTED: 'trusted'
};

// Default contacts.json path in imessage skill
let contactsPath = path.join(__dirname, '..', '.claude', 'skills', 'imessage', 'contacts.json');

/**
 * Set custom contacts.json path (for testing)
 * @param {string} newPath - New path to contacts.json
 */
export function _setContactsPath(newPath) {
  contactsPath = newPath;
}

/**
 * Load contacts data from disk
 * @returns {Object} Contacts data object or empty object
 */
function loadContacts() {
  try {
    if (!fs.existsSync(contactsPath)) {
      return {};
    }
    const data = fs.readFileSync(contactsPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Handle file read errors or malformed JSON
    return {};
  }
}

/**
 * Save contacts data to disk
 * @param {Object} contacts - Contacts data object
 */
function saveContacts(contacts) {
  // Ensure directory exists
  const dir = path.dirname(contactsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
}

/**
 * Get a contact by phone number
 * @param {string} phoneNumber - Phone number (e.g., '+15551234567')
 * @returns {Object|null} Contact object or null if not found
 */
export function getContact(phoneNumber) {
  const contacts = loadContacts();
  return contacts[phoneNumber] || null;
}

/**
 * Create a new contact with default values
 * @param {string} phoneNumber - Phone number (e.g., '+15551234567')
 * @param {string} service - Service type ('iMessage', 'SMS', etc.)
 * @param {string} country - Country code (e.g., 'us', 'ca')
 * @returns {Object} New contact object
 */
export function createContact(phoneNumber, service, country) {
  const now = new Date().toISOString();

  const contact = {
    id: phoneNumber,
    service,
    country,
    display_name: null,
    trust_level: TRUST_LEVELS.NOT_TRUSTED,
    permissions: {},
    command_permissions: [],
    denied_requests: [],
    approved_requests: [],
    response_style: null,
    topics_discussed: [],
    sentiment_history: null,
    spam_score: 0,
    ignore: false,
    first_seen: now,
    last_interaction: now
  };

  // Load existing contacts and add new one
  const contacts = loadContacts();
  contacts[phoneNumber] = contact;
  saveContacts(contacts);

  return contact;
}

/**
 * Update an existing contact
 * @param {string} phoneNumber - Phone number
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated contact object or null if not found
 */
export function updateContact(phoneNumber, updates) {
  const contacts = loadContacts();

  if (!contacts[phoneNumber]) {
    return null;
  }

  // Merge updates and update last_interaction
  contacts[phoneNumber] = {
    ...contacts[phoneNumber],
    ...updates,
    last_interaction: new Date().toISOString()
  };

  saveContacts(contacts);
  return contacts[phoneNumber];
}

/**
 * Get existing contact or create new one if not found
 * @param {string} phoneNumber - Phone number
 * @param {string} service - Service type (used only for creation)
 * @param {string} country - Country code (used only for creation)
 * @returns {Object} Contact object
 */
export function getOrCreateContact(phoneNumber, service, country) {
  const existing = getContact(phoneNumber);
  if (existing) {
    return existing;
  }
  return createContact(phoneNumber, service, country);
}
