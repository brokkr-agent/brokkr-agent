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

  // Edge case tests for input validation
  it('throws RangeError for length=0', () => {
    expect(() => generateCode(0)).toThrow(RangeError);
    expect(() => generateCode(0)).toThrow('length must be greater than 0');
  });

  it('throws RangeError for length>36 (charset size)', () => {
    expect(() => generateCode(37)).toThrow(RangeError);
    expect(() => generateCode(37)).toThrow('length must not exceed 36 (charset size)');
  });

  it('throws RangeError for negative length', () => {
    expect(() => generateCode(-1)).toThrow(RangeError);
    expect(() => generateCode(-1)).toThrow('length must be greater than 0');
  });

  it('throws TypeError for non-integer values', () => {
    expect(() => generateCode(2.5)).toThrow(TypeError);
    expect(() => generateCode(2.5)).toThrow('length must be an integer');
  });

  it('throws TypeError for string input', () => {
    expect(() => generateCode('5')).toThrow(TypeError);
    expect(() => generateCode('5')).toThrow('length must be an integer');
  });

  it('throws TypeError for null input', () => {
    expect(() => generateCode(null)).toThrow(TypeError);
  });

  it('throws TypeError for undefined input', () => {
    expect(() => generateCode(undefined)).toThrow(TypeError);
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
