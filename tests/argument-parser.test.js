import { describe, it, expect } from '@jest/globals';
import {
  parseArguments,
  substituteArguments,
  validateArguments
} from '../lib/argument-parser.js';

describe('argument-parser', () => {
  describe('parseArguments', () => {
    it('parses simple arguments', () => {
      const result = parseArguments('hello world');
      expect(result).toEqual(['hello', 'world']);
    });

    it('handles quoted strings with double quotes', () => {
      const result = parseArguments('hello "world tour" test');
      expect(result).toEqual(['hello', 'world tour', 'test']);
    });

    it('handles quoted strings with single quotes', () => {
      const result = parseArguments("hello 'world tour' test");
      expect(result).toEqual(['hello', 'world tour', 'test']);
    });

    it('handles empty input (empty string)', () => {
      const result = parseArguments('');
      expect(result).toEqual([]);
    });

    it('handles empty input (whitespace only)', () => {
      const result = parseArguments('   ');
      expect(result).toEqual([]);
    });

    it('handles URLs without breaking on special chars', () => {
      const result = parseArguments('summarize https://example.com/page?q=1&foo=bar');
      expect(result).toEqual(['summarize', 'https://example.com/page?q=1&foo=bar']);
    });

    it('handles undefined input', () => {
      const result = parseArguments(undefined);
      expect(result).toEqual([]);
    });

    it('handles null input', () => {
      const result = parseArguments(null);
      expect(result).toEqual([]);
    });

    it('handles multiple spaces between arguments', () => {
      const result = parseArguments('hello    world');
      expect(result).toEqual(['hello', 'world']);
    });

    it('handles mixed quote types', () => {
      const result = parseArguments('first "second arg" \'third arg\' fourth');
      expect(result).toEqual(['first', 'second arg', 'third arg', 'fourth']);
    });
  });

  describe('substituteArguments', () => {
    it('substitutes $ARGUMENTS with all args joined by space', () => {
      const result = substituteArguments('Research $ARGUMENTS thoroughly', ['AI', 'agents']);
      expect(result).toBe('Research AI agents thoroughly');
    });

    it('substitutes positional $0', () => {
      const result = substituteArguments('Hello $0', ['world']);
      expect(result).toBe('Hello world');
    });

    it('substitutes positional $1, $2', () => {
      const result = substituteArguments('$0 meets $1 and $2', ['Alice', 'Bob', 'Charlie']);
      expect(result).toBe('Alice meets Bob and Charlie');
    });

    it('handles missing positional args (becomes empty string)', () => {
      const result = substituteArguments('Hello $0 and $1', ['world']);
      expect(result).toBe('Hello world and ');
    });

    it('substitutes ${SESSION_CODE} from context', () => {
      const result = substituteArguments('Session: ${SESSION_CODE}', [], { sessionCode: 'ABC123' });
      expect(result).toBe('Session: ABC123');
    });

    it('handles default values when arg missing', () => {
      const result = substituteArguments('Priority: ${1:-medium}', ['topic']);
      expect(result).toBe('Priority: medium');
    });

    it('uses provided value over default when arg present', () => {
      const result = substituteArguments('Priority: ${1:-medium}', ['topic', 'high']);
      expect(result).toBe('Priority: high');
    });

    it('handles $ARGUMENTS with empty args array', () => {
      const result = substituteArguments('Research $ARGUMENTS thoroughly', []);
      expect(result).toBe('Research  thoroughly');
    });

    it('handles multiple occurrences of same placeholder', () => {
      const result = substituteArguments('$0 loves $0', ['Alice']);
      expect(result).toBe('Alice loves Alice');
    });

    it('handles ${SESSION_CODE} when not in context', () => {
      const result = substituteArguments('Session: ${SESSION_CODE}', []);
      expect(result).toBe('Session: ');
    });

    it('handles complex template with multiple substitution types', () => {
      const template = 'Session ${SESSION_CODE}: $0 researching $ARGUMENTS with priority ${2:-normal}';
      const args = ['user1', 'AI', 'agents'];
      const context = { sessionCode: 'XYZ' };
      const result = substituteArguments(template, args, context);
      // $ARGUMENTS = all args joined = 'user1 AI agents'
      // $0 = 'user1'
      // ${2:-normal} = args[2] = 'agents'
      expect(result).toBe('Session XYZ: user1 researching user1 AI agents with priority agents');
    });

    it('handles default value with special characters', () => {
      const result = substituteArguments('URL: ${0:-https://default.com}', []);
      expect(result).toBe('URL: https://default.com');
    });
  });

  describe('validateArguments', () => {
    it('returns valid for args matching required count', () => {
      const definition = {
        required: ['target', 'action'],
        optional: []
      };
      const result = validateArguments(['file.txt', 'delete'], definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid when optional args are missing', () => {
      const definition = {
        required: ['target'],
        optional: ['verbose']
      };
      const result = validateArguments(['file.txt'], definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('returns valid when optional args are provided', () => {
      const definition = {
        required: ['target'],
        optional: ['verbose']
      };
      const result = validateArguments(['file.txt', 'true'], definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports missing required arguments', () => {
      const definition = {
        required: ['target', 'action'],
        optional: []
      };
      const result = validateArguments(['file.txt'], definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required argument: action");
    });

    it('reports multiple missing required arguments', () => {
      const definition = {
        required: ['target', 'action', 'confirm'],
        optional: []
      };
      const result = validateArguments([], definition);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required argument: target");
      expect(result.errors).toContain("Missing required argument: action");
      expect(result.errors).toContain("Missing required argument: confirm");
    });

    it('returns valid for no required args and empty input', () => {
      const definition = {
        required: [],
        optional: ['verbose']
      };
      const result = validateArguments([], definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('handles undefined definition gracefully', () => {
      const result = validateArguments(['arg1'], undefined);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('handles definition with missing required array', () => {
      const definition = {
        optional: ['verbose']
      };
      const result = validateArguments([], definition);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
