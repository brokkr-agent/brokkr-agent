#!/usr/bin/env node
/**
 * Update a contact's information
 *
 * Usage: node imessage-update-contact.js <phone> <field> <value>
 * Example: node imessage-update-contact.js "+12068186864" display_name "Kris Johnson"
 * Example: node imessage-update-contact.js "+12068186864" trust_level "partial_trust"
 *
 * Fields: display_name, trust_level, response_style, ignore
 */

import { getContact, updateContact, getOrCreateContact } from '../../../../lib/imessage-permissions.js';

const phone = process.argv[2];
const field = process.argv[3];
const value = process.argv[4];

if (!phone || !field || value === undefined) {
  console.error('Usage: node imessage-update-contact.js <phone> <field> <value>');
  console.error('');
  console.error('Fields:');
  console.error('  display_name   - Contact name (e.g., "Kris Johnson")');
  console.error('  trust_level    - not_trusted, partial_trust, trusted, restricted');
  console.error('  response_style - How to respond to this contact');
  console.error('  ignore         - true/false to ignore messages');
  console.error('');
  console.error('Example: node imessage-update-contact.js "+12068186864" display_name "Kris Johnson"');
  process.exit(1);
}

try {
  // Ensure contact exists
  let contact = getContact(phone);
  if (!contact) {
    contact = getOrCreateContact(phone);
    console.log(`Created new contact: ${phone}`);
  }

  // Parse boolean values
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  if (value === 'false') parsedValue = false;

  // Update the field
  const updates = { [field]: parsedValue };
  const updated = updateContact(phone, updates);

  if (updated) {
    console.log(`Updated ${phone}:`);
    console.log(`  ${field}: ${JSON.stringify(parsedValue)}`);
    console.log('');
    console.log('Current contact record:');
    console.log(JSON.stringify(updated, null, 2));
  } else {
    console.error(`Failed to update contact ${phone}`);
    process.exit(1);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
