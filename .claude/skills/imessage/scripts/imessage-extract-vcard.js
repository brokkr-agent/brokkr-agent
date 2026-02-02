#!/usr/bin/env node
/**
 * Extract contact information from vCard attachments in iMessage
 *
 * Usage:
 *   node imessage-extract-vcard.js <message_id>     # Extract from specific message
 *   node imessage-extract-vcard.js --recent [n]     # Find recent vCards (default: 10 messages)
 *   node imessage-extract-vcard.js --list           # List all vCard attachments
 *
 * Output: JSON with parsed vCard fields
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const DB_PATH = path.join(homedir(), 'Library/Messages/chat.db');

function queryDb(sql) {
  try {
    const result = execSync(`sqlite3 "${DB_PATH}" "${sql}"`, { encoding: 'utf-8' });
    return result.trim();
  } catch (e) {
    return '';
  }
}

function parseVCard(vcfContent) {
  const contact = {};
  const lines = vcfContent.split(/\r?\n/);

  for (const line of lines) {
    // Full Name
    if (line.startsWith('FN:')) {
      contact.fullName = line.substring(3);
    }
    // Name parts (Last;First;Middle;Prefix;Suffix)
    else if (line.startsWith('N:')) {
      const parts = line.substring(2).split(';');
      contact.lastName = parts[0] || '';
      contact.firstName = parts[1] || '';
    }
    // Phone (handle various formats)
    else if (line.startsWith('TEL')) {
      const phoneMatch = line.match(/:([\+\d\-\(\)\s]+)/);
      if (phoneMatch) {
        // Normalize phone number
        const phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
        if (!contact.phones) contact.phones = [];

        // Detect type
        const type = line.includes('CELL') ? 'mobile' :
                     line.includes('HOME') ? 'home' :
                     line.includes('WORK') ? 'work' : 'other';
        contact.phones.push({ number: phone, type });
      }
    }
    // Email
    else if (line.startsWith('EMAIL')) {
      const emailMatch = line.match(/:(.+@.+)/);
      if (emailMatch) {
        if (!contact.emails) contact.emails = [];
        const type = line.includes('HOME') ? 'home' :
                     line.includes('WORK') ? 'work' : 'other';
        contact.emails.push({ address: emailMatch[1], type });
      }
    }
    // Organization
    else if (line.startsWith('ORG:')) {
      contact.organization = line.substring(4);
    }
    // Title
    else if (line.startsWith('TITLE:')) {
      contact.title = line.substring(6);
    }
    // Social profiles
    else if (line.startsWith('X-SOCIALPROFILE')) {
      if (!contact.socialProfiles) contact.socialProfiles = [];
      const typeMatch = line.match(/type=(\w+)/);
      const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
      if (typeMatch && urlMatch) {
        contact.socialProfiles.push({
          type: typeMatch[1],
          url: urlMatch[1]
        });
      }
    }
  }

  // Set primary phone (first one, preferring mobile)
  if (contact.phones && contact.phones.length > 0) {
    const mobile = contact.phones.find(p => p.type === 'mobile');
    contact.primaryPhone = mobile ? mobile.number : contact.phones[0].number;
  }

  // Set primary email
  if (contact.emails && contact.emails.length > 0) {
    contact.primaryEmail = contact.emails[0].address;
  }

  return contact;
}

function getVCardAttachments(limit = 10) {
  const sql = `
    SELECT
      m.ROWID as message_id,
      m.text,
      a.filename,
      a.transfer_name,
      datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as timestamp,
      CASE WHEN m.is_from_me = 1 THEN 'me' ELSE h.id END as sender
    FROM message m
    LEFT JOIN message_attachment_join maj ON m.ROWID = maj.message_id
    LEFT JOIN attachment a ON maj.attachment_id = a.ROWID
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    WHERE a.mime_type = 'text/vcard'
    ORDER BY m.date DESC
    LIMIT ${limit};
  `;

  const result = queryDb(sql);
  if (!result) return [];

  return result.split('\n').map(row => {
    const [message_id, text, filename, transfer_name, timestamp, sender] = row.split('|');
    return { message_id, text, filename, transfer_name, timestamp, sender };
  });
}

function extractVCardFromMessage(messageId) {
  const sql = `
    SELECT a.filename, a.transfer_name
    FROM message m
    LEFT JOIN message_attachment_join maj ON m.ROWID = maj.message_id
    LEFT JOIN attachment a ON maj.attachment_id = a.ROWID
    WHERE m.ROWID = ${messageId} AND a.mime_type = 'text/vcard';
  `;

  const result = queryDb(sql);
  if (!result) {
    return { error: 'No vCard attachment found for this message' };
  }

  const [filename] = result.split('|');
  const expandedPath = filename.replace('~', homedir());

  if (!existsSync(expandedPath)) {
    return { error: `vCard file not found: ${expandedPath}` };
  }

  const vcfContent = readFileSync(expandedPath, 'utf-8');
  const contact = parseVCard(vcfContent);
  contact.sourceFile = filename;
  contact.messageId = messageId;

  return contact;
}

function findRecentVCards(limit = 10) {
  const attachments = getVCardAttachments(limit);

  return attachments.map(att => {
    const expandedPath = att.filename.replace('~', homedir());
    if (!existsSync(expandedPath)) {
      return { ...att, error: 'File not found' };
    }

    const vcfContent = readFileSync(expandedPath, 'utf-8');
    const contact = parseVCard(vcfContent);

    return {
      ...contact,
      messageId: att.message_id,
      timestamp: att.timestamp,
      sender: att.sender,
      sourceFile: att.filename
    };
  });
}

// CLI handling
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(`
Usage:
  node imessage-extract-vcard.js <message_id>     # Extract from specific message
  node imessage-extract-vcard.js --recent [n]     # Find recent vCards (default: 10)
  node imessage-extract-vcard.js --list           # List all vCard attachments

Output: JSON with parsed vCard fields including:
  - fullName, firstName, lastName
  - phones (array with number and type)
  - emails (array with address and type)
  - primaryPhone, primaryEmail
  - socialProfiles
  - organization, title
`);
  process.exit(0);
}

let output;

if (args[0] === '--recent') {
  const limit = parseInt(args[1]) || 10;
  output = findRecentVCards(limit);
} else if (args[0] === '--list') {
  output = getVCardAttachments(50);
} else {
  const messageId = parseInt(args[0]);
  if (isNaN(messageId)) {
    console.error('Error: Invalid message ID');
    process.exit(1);
  }
  output = extractVCardFromMessage(messageId);
}

console.log(JSON.stringify(output, null, 2));
