// lib/imessage-consultation.js
// Silent consultation handler for iMessage Advanced Assistant
// Holds messages from untrusted contacts and sends to Tommy for approval

import {
  addPendingQuestion,
  getPendingByCode,
  resolvePending
} from './imessage-pending.js';

/**
 * Determine if a message should be held for Tommy's consultation
 * @param {Object} contact - Contact object with trust_level and ignore properties
 * @param {string} message - The message text (for future permission-based logic)
 * @returns {boolean} True if consultation is needed
 */
export function shouldConsultTommy(contact, message) {
  // No contact = can't consult
  if (!contact) {
    return false;
  }

  // Ignored contacts should never trigger consultation
  if (contact.ignore === true) {
    return false;
  }

  // Trusted contacts don't need consultation
  // Note: 'trusted' should ONLY be Tommy - other contacts should use 'family' or 'partial_trust'
  if (contact.trust_level === 'trusted') {
    return false;
  }

  // Family contacts with explicit permissions don't need consultation
  // They have been granted specific access by Tommy
  if (contact.trust_level === 'family') {
    return false;
  }

  // All other contacts (not_trusted, partial_trust, undefined) need consultation
  // partial_trust contacts get some access but still go through consultation for new requests
  return true;
}

/**
 * Send a consultation request to Tommy for approval
 * @param {Object} params - Consultation parameters
 * @param {Object} params.contact - Contact object with id and display_name
 * @param {string} params.message - The message text
 * @param {Function} params.sendMessage - Async function to send iMessage (phone, text)
 * @param {string} params.tommyPhone - Tommy's phone number
 * @returns {Object} The created pending question entry
 */
export async function sendConsultation({ contact, message, sendMessage, tommyPhone }) {
  // Create pending question entry
  const pendingEntry = addPendingQuestion({
    phoneNumber: contact.id,
    question: message,
    context: `From ${contact.display_name || contact.id}`
  });

  // Format consultation message for Tommy
  const contactName = contact.display_name || contact.id;
  const consultationMessage = formatConsultationMessage(contactName, message, pendingEntry.sessionCode);

  // Send to Tommy
  await sendMessage(tommyPhone, consultationMessage);

  return pendingEntry;
}

/**
 * Format the consultation message sent to Tommy
 * @param {string} contactName - Display name or phone number
 * @param {string} message - The original message
 * @param {string} sessionCode - The 2-char session code
 * @returns {string} Formatted message
 */
function formatConsultationMessage(contactName, message, sessionCode) {
  return `Message from ${contactName}:

"${message}"

Session: /${sessionCode}

Reply:
/${sessionCode} allow [optional response]
/${sessionCode} deny`;
}

/**
 * Handle Tommy's response to a consultation (allow or deny)
 * @param {string} sessionCode - The 2-char session code
 * @param {string} action - 'allow' or 'deny'
 * @param {string|null} response - Optional response message
 * @param {Function} sendMessage - Async function to send iMessage (not currently used, for future)
 * @returns {Object|null} The resolved pending entry or null if not found
 */
export async function handleConsultationResponse(sessionCode, action, response, sendMessage) {
  // Get the pending question
  const pending = getPendingByCode(sessionCode);
  if (!pending) {
    return null;
  }

  // Resolve it with the action
  const resolved = resolvePending(sessionCode, action, response);

  return resolved;
}
