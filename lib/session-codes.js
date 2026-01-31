// lib/session-codes.js
const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateCode(length) {
  let code = '';
  const available = CHARSET.split('');

  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * available.length);
    code += available[idx];
    available.splice(idx, 1); // Remove used char
  }

  return code;
}

export function isValidCode(code, expectedLength) {
  if (typeof code !== 'string') return false;
  if (code.length !== expectedLength) return false;
  if (!/^[a-z0-9]+$/.test(code)) return false;

  // Check for repeating characters
  const chars = code.split('');
  if (new Set(chars).size !== chars.length) return false;

  return true;
}
