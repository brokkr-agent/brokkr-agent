// tests/session-codes.test.js
import { describe, it, expect } from '@jest/globals';
import { generateCode, isValidCode } from '../lib/session-codes.js';

describe('generateCode', () => {
  it('generates 2-char code with no repeating characters', () => {
    const code = generateCode(2);
    expect(code).toHaveLength(2);
    expect(code[0]).not.toBe(code[1]);
    expect(code).toMatch(/^[a-z0-9]{2}$/);
  });

  it('generates 3-char code with no repeating characters', () => {
    const code = generateCode(3);
    expect(code).toHaveLength(3);
    const chars = code.split('');
    expect(new Set(chars).size).toBe(3); // All unique
    expect(code).toMatch(/^[a-z0-9]{3}$/);
  });

  it('generates unique codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateCode(2));
    }
    expect(codes.size).toBeGreaterThan(90); // Most should be unique
  });
});

describe('isValidCode', () => {
  it('validates correct 2-char codes', () => {
    expect(isValidCode('k7', 2)).toBe(true);
    expect(isValidCode('m3', 2)).toBe(true);
  });

  it('rejects codes with repeating chars', () => {
    expect(isValidCode('aa', 2)).toBe(false);
    expect(isValidCode('111', 3)).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidCode('k7m', 2)).toBe(false);
    expect(isValidCode('k7', 3)).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(isValidCode('K7', 2)).toBe(false);
  });
});
