// tests/notification-handlers.test.js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import {
  handleNotification,
  getAppHandler,
  CONTEXT_FILE
} from '../lib/notification-handlers.js';

describe('notification-handlers', () => {
  // Clean up context file before/after each test
  beforeEach(() => {
    try {
      fs.unlinkSync(CONTEXT_FILE);
    } catch {}
  });

  afterEach(() => {
    try {
      fs.unlinkSync(CONTEXT_FILE);
    } catch {}
  });

  describe('handleNotification', () => {
    const sampleNotification = {
      app: 'imessage',
      bundleId: 'com.apple.MobileSMS',
      delivered: Date.now() / 1000,
      content: {
        title: 'John Doe',
        body: 'Hey, can you check this?'
      }
    };

    it('calls invokeAgent for invoke action', async () => {
      const rule = { name: 'test-rule', action: 'invoke' };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      // Should write context file
      expect(fs.existsSync(CONTEXT_FILE)).toBe(true);
      const context = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
      expect(context.notification).toEqual(sampleNotification);
      expect(context.rule.name).toBe('test-rule');
      expect(context.rule.action).toBe('invoke');
      expect(context.timestamp).toBeDefined();

      // Should log the command
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Handler] Would invoke:')
      );

      consoleSpy.mockRestore();
    });

    it('calls logNotification for log action', async () => {
      const rule = { name: 'log-rule', action: 'log' };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      // Should log notification details
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LOG]')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('imessage')
      );

      consoleSpy.mockRestore();
    });

    it('defaults to log action if not specified', async () => {
      const rule = { name: 'no-action-rule' };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      // Should log notification (default behavior)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LOG]')
      );

      consoleSpy.mockRestore();
    });

    it('handles ignore action by doing nothing', async () => {
      const rule = { name: 'ignore-rule', action: 'ignore' };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      // Should not write context file
      expect(fs.existsSync(CONTEXT_FILE)).toBe(false);

      // Should not log anything with [LOG] or [Handler]
      const relevantCalls = consoleSpy.mock.calls.filter(
        call => call[0]?.includes?.('[LOG]') || call[0]?.includes?.('[Handler]')
      );
      expect(relevantCalls.length).toBe(0);

      consoleSpy.mockRestore();
    });

    it('handles unknown action gracefully', async () => {
      const rule = { name: 'unknown-rule', action: 'unknown-action' };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Handler] Unknown action: unknown-action')
      );

      consoleSpy.mockRestore();
    });

    it('sends webhook for webhook action with valid URL', async () => {
      const rule = {
        name: 'webhook-rule',
        action: 'webhook',
        webhookUrl: 'https://example.com/hook'
      };

      // Mock fetch
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });
      global.fetch = mockFetch;

      await handleNotification(sampleNotification, rule);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String)
        })
      );

      // Verify body contains expected fields
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe('notification');
      expect(body.app).toBe('imessage');
      expect(body.content).toEqual(sampleNotification.content);
      expect(body.rule).toBe('webhook-rule');

      delete global.fetch;
    });

    it('logs error for webhook action without webhookUrl', async () => {
      const rule = { name: 'webhook-no-url', action: 'webhook' };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Handler] Webhook action requires webhookUrl'
      );

      consoleSpy.mockRestore();
    });

    it('uses custom command from rule for invoke action', async () => {
      const rule = {
        name: 'custom-command-rule',
        action: 'invoke',
        command: '/custom-command arg1 arg2'
      };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(sampleNotification, rule);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Handler] Would invoke: /custom-command arg1 arg2'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getAppHandler', () => {
    it('returns handler for imessage', () => {
      const handler = getAppHandler('imessage');

      expect(handler.command).toBe('/imessage');
      expect(handler.priority).toBe(100);
      expect(typeof handler.formatTask).toBe('function');
    });

    it('returns handler for mail', () => {
      const handler = getAppHandler('mail');

      expect(handler.command).toBe('/mail');
      expect(handler.priority).toBe(75);
      expect(typeof handler.formatTask).toBe('function');
    });

    it('returns handler for calendar', () => {
      const handler = getAppHandler('calendar');

      expect(handler.command).toBe('/calendar');
      expect(handler.priority).toBe(50);
      expect(typeof handler.formatTask).toBe('function');
    });

    it('returns default handler for unknown apps', () => {
      const handler = getAppHandler('unknown-app');

      expect(handler.command).toBe('/unknown-app');
      expect(handler.priority).toBe(25);
      expect(typeof handler.formatTask).toBe('function');
    });

    it('formatTask produces correct output for imessage', () => {
      const handler = getAppHandler('imessage');
      const notification = {
        content: {
          title: 'Jane Smith',
          body: 'Please call me back'
        }
      };

      const task = handler.formatTask(notification);
      expect(task).toContain('iMessage from Jane Smith');
      expect(task).toContain('Please call me back');
    });

    it('formatTask produces correct output for mail', () => {
      const handler = getAppHandler('mail');
      const notification = {
        content: {
          title: 'Meeting Tomorrow',
          body: 'Please confirm attendance'
        }
      };

      const task = handler.formatTask(notification);
      expect(task).toContain('Email:');
      expect(task).toContain('Meeting Tomorrow');
    });

    it('formatTask produces correct output for unknown app', () => {
      const handler = getAppHandler('slack');
      const notification = {
        app: 'slack',
        content: {
          title: 'New message',
          body: 'Hello world'
        }
      };

      const task = handler.formatTask(notification);
      expect(task).toContain('slack:');
      expect(task).toContain('New message');
    });
  });

  describe('invokeAgent (via handleNotification)', () => {
    it('writes context file with correct structure', async () => {
      const notification = {
        app: 'calendar',
        bundleId: 'com.apple.iCal',
        delivered: 1706789012,
        content: {
          title: 'Team Meeting',
          body: 'In 15 minutes'
        }
      };
      const rule = { name: 'calendar-invoke', action: 'invoke' };

      // Suppress console output
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await handleNotification(notification, rule);

      expect(fs.existsSync(CONTEXT_FILE)).toBe(true);

      const context = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
      expect(context).toHaveProperty('notification');
      expect(context).toHaveProperty('rule');
      expect(context).toHaveProperty('timestamp');

      expect(context.notification.app).toBe('calendar');
      expect(context.notification.content.title).toBe('Team Meeting');
      expect(context.rule.name).toBe('calendar-invoke');

      // Timestamp should be valid ISO string
      expect(new Date(context.timestamp).toISOString()).toBe(context.timestamp);

      jest.restoreAllMocks();
    });
  });
});
