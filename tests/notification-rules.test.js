// tests/notification-rules.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  evaluateRules,
  matchesRule,
  parseRuleCondition,
  loadRules
} from '../lib/notification-rules.js';

describe('Notification Rules Engine', () => {
  describe('evaluateRules', () => {
    it('should return empty array when no rules match', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Hello' }
      };
      const rules = [
        { name: 'mail-rule', app: 'mail', condition: { any: true }, action: 'invoke', priority: 50 }
      ];

      const result = evaluateRules(notification, rules);

      expect(result).toEqual([]);
    });

    it('should return empty array when rules array is empty', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Hello' }
      };

      const result = evaluateRules(notification, []);

      expect(result).toEqual([]);
    });

    it('should return matching rules sorted by priority (highest first)', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Hello' }
      };
      const rules = [
        { name: 'low-priority', app: 'messages', condition: { any: true }, action: 'queue', priority: 10 },
        { name: 'high-priority', app: 'messages', condition: { any: true }, action: 'invoke', priority: 90 },
        { name: 'medium-priority', app: 'messages', condition: { any: true }, action: 'queue', priority: 50 }
      ];

      const result = evaluateRules(notification, rules);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('high-priority');
      expect(result[1].name).toBe('medium-priority');
      expect(result[2].name).toBe('low-priority');
    });

    it('should handle rules without priority (default to 0)', () => {
      const notification = {
        app: 'calendar',
        content: { title: 'Meeting', body: 'In 10 minutes' }
      };
      const rules = [
        { name: 'no-priority', app: 'calendar', condition: { any: true }, action: 'invoke' },
        { name: 'with-priority', app: 'calendar', condition: { any: true }, action: 'invoke', priority: 50 }
      ];

      const result = evaluateRules(notification, rules);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('with-priority');
      expect(result[1].name).toBe('no-priority');
    });
  });

  describe('matchesRule', () => {
    it('should return true when app and condition match', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Hello' }
      };
      const rule = { name: 'test', app: 'messages', condition: { any: true }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should return false when app does not match', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Hello' }
      };
      const rule = { name: 'test', app: 'mail', condition: { any: true }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle titleContains condition - match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Important: Meeting Tomorrow', body: 'Please attend' }
      };
      const rule = { name: 'test', app: 'mail', condition: { titleContains: 'Important' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle titleContains condition - no match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Regular Update', body: 'Nothing urgent' }
      };
      const rule = { name: 'test', app: 'mail', condition: { titleContains: 'Important' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle titleContains case-insensitively', () => {
      const notification = {
        app: 'mail',
        content: { title: 'IMPORTANT: Meeting Tomorrow', body: 'Please attend' }
      };
      const rule = { name: 'test', app: 'mail', condition: { titleContains: 'important' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle bodyContains condition - match', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'Can you call me urgently?' }
      };
      const rule = { name: 'test', app: 'messages', condition: { bodyContains: 'urgently' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle bodyContains condition - no match', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'See you later' }
      };
      const rule = { name: 'test', app: 'messages', condition: { bodyContains: 'urgently' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle bodyContains case-insensitively', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John', body: 'This is URGENT!' }
      };
      const rule = { name: 'test', app: 'messages', condition: { bodyContains: 'urgent' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle senderContains condition - match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Meeting Invite', body: 'Join us', sender: 'boss@company.com' }
      };
      const rule = { name: 'test', app: 'mail', condition: { senderContains: 'boss' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle senderContains condition - no match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Meeting Invite', body: 'Join us', sender: 'newsletter@spam.com' }
      };
      const rule = { name: 'test', app: 'mail', condition: { senderContains: 'boss' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle senderContains case-insensitively', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Meeting Invite', body: 'Join us', sender: 'BOSS@company.com' }
      };
      const rule = { name: 'test', app: 'mail', condition: { senderContains: 'boss' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should fallback to title for senderContains when sender is missing', () => {
      const notification = {
        app: 'messages',
        content: { title: 'John Smith', body: 'Hello' }
      };
      const rule = { name: 'test', app: 'messages', condition: { senderContains: 'John' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle any: true condition - matches any notification from app', () => {
      const notification = {
        app: 'calendar',
        content: { title: 'Random Event', body: 'Some content' }
      };
      const rule = { name: 'test', app: 'calendar', condition: { any: true }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should handle multiple conditions (AND logic)', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Important Update', body: 'Urgent action required', sender: 'boss@company.com' }
      };
      const rule = {
        name: 'test',
        app: 'mail',
        condition: {
          titleContains: 'Important',
          bodyContains: 'Urgent',
          senderContains: 'boss'
        },
        action: 'invoke',
        priority: 50
      };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should fail multiple conditions if one does not match', () => {
      const notification = {
        app: 'mail',
        content: { title: 'Important Update', body: 'Regular message', sender: 'boss@company.com' }
      };
      const rule = {
        name: 'test',
        app: 'mail',
        condition: {
          titleContains: 'Important',
          bodyContains: 'Urgent'
        },
        action: 'invoke',
        priority: 50
      };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle missing content gracefully', () => {
      const notification = {
        app: 'messages',
        content: null
      };
      const rule = { name: 'test', app: 'messages', condition: { bodyContains: 'test' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(false);
    });

    it('should handle missing condition gracefully', () => {
      const notification = {
        app: 'messages',
        content: { title: 'Test', body: 'Hello' }
      };
      const rule = { name: 'test', app: 'messages', action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });

    it('should match when rule has no app specified (matches all apps)', () => {
      const notification = {
        app: 'messages',
        content: { title: 'Test', body: 'Hello urgent message' }
      };
      const rule = { name: 'test', condition: { bodyContains: 'urgent' }, action: 'invoke', priority: 50 };

      const result = matchesRule(notification, rule);

      expect(result).toBe(true);
    });
  });

  describe('parseRuleCondition', () => {
    it('should return empty object for null input', () => {
      const result = parseRuleCondition(null);
      expect(result).toEqual({});
    });

    it('should return empty object for undefined input', () => {
      const result = parseRuleCondition(undefined);
      expect(result).toEqual({});
    });

    it('should pass through valid condition object', () => {
      const condition = { titleContains: 'Important', bodyContains: 'Urgent' };
      const result = parseRuleCondition(condition);
      expect(result).toEqual(condition);
    });

    it('should handle any: true condition', () => {
      const condition = { any: true };
      const result = parseRuleCondition(condition);
      expect(result).toEqual({ any: true });
    });

    it('should normalize string values', () => {
      const condition = { titleContains: '  Important  ', bodyContains: ' Urgent ' };
      const result = parseRuleCondition(condition);
      expect(result.titleContains).toBe('Important');
      expect(result.bodyContains).toBe('Urgent');
    });
  });

  describe('loadRules', () => {
    let tempDir;
    let tempConfigPath;

    beforeEach(() => {
      tempDir = join(tmpdir(), `test-rules-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
      tempConfigPath = join(tempDir, 'rules.json');
    });

    afterEach(() => {
      try { unlinkSync(tempConfigPath); } catch {}
      try { rmdirSync(tempDir); } catch {}
    });

    it('should return empty array for missing config file', () => {
      const result = loadRules('/nonexistent/path/rules.json');
      expect(result).toEqual([]);
    });

    it('should parse JSON rules from file', () => {
      const rulesConfig = {
        rules: [
          { name: 'urgent-mail', app: 'mail', condition: { titleContains: 'Urgent' }, action: 'invoke', priority: 90 },
          { name: 'all-messages', app: 'messages', condition: { any: true }, action: 'queue', priority: 50 }
        ]
      };
      writeFileSync(tempConfigPath, JSON.stringify(rulesConfig, null, 2));

      const result = loadRules(tempConfigPath);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('urgent-mail');
      expect(result[1].name).toBe('all-messages');
    });

    it('should return empty array for invalid JSON', () => {
      writeFileSync(tempConfigPath, 'this is not valid json {{{');

      const result = loadRules(tempConfigPath);

      expect(result).toEqual([]);
    });

    it('should return empty array when rules key is missing', () => {
      const config = { version: '1.0', description: 'No rules here' };
      writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

      const result = loadRules(tempConfigPath);

      expect(result).toEqual([]);
    });

    it('should handle empty rules array', () => {
      const config = { rules: [] };
      writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));

      const result = loadRules(tempConfigPath);

      expect(result).toEqual([]);
    });
  });
});
