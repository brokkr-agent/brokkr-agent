// tests/lib/group-monitor.test.js
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Import functions to test
import {
  GroupMonitor,
  STATES,
  MESSAGE_WINDOW,
  TIME_WINDOW_MS
} from '../../lib/group-monitor.js';

describe('group-monitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new GroupMonitor();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T12:00:00.000Z'));
  });

  describe('STATES', () => {
    it('should have IDLE state', () => {
      expect(STATES.IDLE).toBe('idle');
    });

    it('should have ACTIVE state', () => {
      expect(STATES.ACTIVE).toBe('active');
    });

    it('should have exactly two states', () => {
      expect(Object.keys(STATES)).toHaveLength(2);
    });
  });

  describe('Constants', () => {
    it('MESSAGE_WINDOW should be 20', () => {
      expect(MESSAGE_WINDOW).toBe(20);
    });

    it('TIME_WINDOW_MS should be 30 minutes in milliseconds', () => {
      expect(TIME_WINDOW_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('getState', () => {
    it('returns IDLE for unknown groups', () => {
      const state = monitor.getState('group-123');
      expect(state).toBe(STATES.IDLE);
    });

    it('returns current state for known groups', () => {
      // First mention Brokkr to activate
      monitor.processMessage({
        groupId: 'group-123',
        text: 'Hey Brokkr, how are you?',
        sender: '+15551234567'
      });

      const state = monitor.getState('group-123');
      expect(state).toBe(STATES.ACTIVE);
    });
  });

  describe('mentionsBrokkr', () => {
    it('returns true when text contains "brokkr" (case insensitive)', () => {
      expect(monitor.mentionsBrokkr('Hey brokkr, help me')).toBe(true);
      expect(monitor.mentionsBrokkr('Hey BROKKR!')).toBe(true);
      expect(monitor.mentionsBrokkr('Brokkr can you help?')).toBe(true);
    });

    it('returns false when text does not contain "brokkr"', () => {
      expect(monitor.mentionsBrokkr('Hello everyone')).toBe(false);
      expect(monitor.mentionsBrokkr('What is the weather?')).toBe(false);
    });

    it('requires word boundary - not part of another word', () => {
      expect(monitor.mentionsBrokkr('brokkrbot is cool')).toBe(false);
      expect(monitor.mentionsBrokkr('mybrokkr test')).toBe(false);
    });

    it('matches with punctuation after', () => {
      expect(monitor.mentionsBrokkr('Brokkr, help')).toBe(true);
      expect(monitor.mentionsBrokkr('Hey Brokkr!')).toBe(true);
      expect(monitor.mentionsBrokkr('What do you think Brokkr?')).toBe(true);
    });
  });

  describe('isDirectlyAddressed', () => {
    it('returns true for patterns starting with "Brokkr,"', () => {
      expect(monitor.isDirectlyAddressed('Brokkr, what do you think?')).toBe(true);
      expect(monitor.isDirectlyAddressed('brokkr, can you help?')).toBe(true);
    });

    it('returns true for patterns like "Hey Brokkr..."', () => {
      expect(monitor.isDirectlyAddressed('Hey Brokkr, how are you?')).toBe(true);
      expect(monitor.isDirectlyAddressed('hey brokkr help me')).toBe(true);
    });

    it('returns true for "@Brokkr" mentions', () => {
      expect(monitor.isDirectlyAddressed('@Brokkr what do you think?')).toBe(true);
      expect(monitor.isDirectlyAddressed('@brokkr help')).toBe(true);
    });

    it('returns false for indirect mentions', () => {
      expect(monitor.isDirectlyAddressed('I think Brokkr is useful')).toBe(false);
      expect(monitor.isDirectlyAddressed('Ask Brokkr later')).toBe(false);
    });

    it('returns false when Brokkr is not mentioned', () => {
      expect(monitor.isDirectlyAddressed('Hello everyone')).toBe(false);
    });
  });

  describe('processMessage', () => {
    describe('IDLE state behavior', () => {
      it('stays IDLE when Brokkr is not mentioned', () => {
        const result = monitor.processMessage({
          groupId: 'group-123',
          text: 'Hello everyone, how are you?',
          sender: '+15551234567'
        });

        expect(result.shouldRespond).toBe(false);
        expect(result.reason).toBe('not_mentioned');
        expect(monitor.getState('group-123')).toBe(STATES.IDLE);
      });

      it('transitions to ACTIVE when Brokkr is mentioned', () => {
        const result = monitor.processMessage({
          groupId: 'group-123',
          text: 'Hey Brokkr, help me with this',
          sender: '+15551234567'
        });

        expect(result.shouldRespond).toBe(true);
        expect(monitor.getState('group-123')).toBe(STATES.ACTIVE);
      });

      it('returns shouldRespond: true when directly addressed', () => {
        const result = monitor.processMessage({
          groupId: 'group-123',
          text: 'Brokkr, what is the weather?',
          sender: '+15551234567'
        });

        expect(result.shouldRespond).toBe(true);
        expect(result.reason).toBe('directly_addressed');
      });
    });

    describe('ACTIVE state behavior', () => {
      beforeEach(() => {
        // Activate the group first
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Hey Brokkr',
          sender: '+15551234567'
        });
      });

      it('evaluates messages for relevance in ACTIVE state', () => {
        const result = monitor.processMessage({
          groupId: 'group-123',
          text: 'What about the project?',
          sender: '+15551234567'
        });

        // In ACTIVE state, messages are evaluated (but may not require response)
        expect(result).toHaveProperty('shouldRespond');
        expect(result).toHaveProperty('reason');
      });

      it('resets message counter when Brokkr mentioned again', () => {
        // Send some messages
        for (let i = 0; i < 10; i++) {
          monitor.processMessage({
            groupId: 'group-123',
            text: 'Regular message ' + i,
            sender: '+15551234567'
          });
        }

        // Mention Brokkr again
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Hey Brokkr',
          sender: '+15551234567'
        });

        // Send 20 more messages without mention
        for (let i = 0; i < 20; i++) {
          monitor.processMessage({
            groupId: 'group-123',
            text: 'Another message ' + i,
            sender: '+15551234567'
          });
        }

        // Should still be ACTIVE because counter was reset at message 10
        expect(monitor.getState('group-123')).toBe(STATES.ACTIVE);
      });
    });

    describe('Message window transition', () => {
      beforeEach(() => {
        // Activate the group
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Hey Brokkr',
          sender: '+15551234567'
        });
      });

      it('transitions to IDLE after 21 messages without Brokkr mention', () => {
        // Send 21 messages without mentioning Brokkr (MESSAGE_WINDOW + 1)
        for (let i = 0; i < 21; i++) {
          monitor.processMessage({
            groupId: 'group-123',
            text: 'Regular message number ' + i,
            sender: '+15551234567'
          });
        }

        expect(monitor.getState('group-123')).toBe(STATES.IDLE);
      });

      it('stays ACTIVE with exactly 20 messages without Brokkr mention', () => {
        // Send exactly 20 messages (MESSAGE_WINDOW)
        for (let i = 0; i < 20; i++) {
          monitor.processMessage({
            groupId: 'group-123',
            text: 'Regular message ' + i,
            sender: '+15551234567'
          });
        }

        expect(monitor.getState('group-123')).toBe(STATES.ACTIVE);
      });
    });

    describe('Time window transition', () => {
      beforeEach(() => {
        // Activate the group
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Hey Brokkr',
          sender: '+15551234567'
        });
      });

      it('transitions to IDLE after 30 minutes without Brokkr response', () => {
        // Advance time by 31 minutes
        jest.advanceTimersByTime(31 * 60 * 1000);

        // Send a message to trigger state check
        const result = monitor.processMessage({
          groupId: 'group-123',
          text: 'Anyone there?',
          sender: '+15551234567'
        });

        expect(monitor.getState('group-123')).toBe(STATES.IDLE);
        expect(result.shouldRespond).toBe(false);
      });

      it('stays ACTIVE before 30 minutes has elapsed', () => {
        // Advance time by 29 minutes
        jest.advanceTimersByTime(29 * 60 * 1000);

        monitor.processMessage({
          groupId: 'group-123',
          text: 'Still there?',
          sender: '+15551234567'
        });

        expect(monitor.getState('group-123')).toBe(STATES.ACTIVE);
      });

      it('resets time window when Brokkr mentioned', () => {
        // Advance time by 29 minutes
        jest.advanceTimersByTime(29 * 60 * 1000);

        // Mention Brokkr again
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Brokkr, are you there?',
          sender: '+15551234567'
        });

        // Advance time by another 29 minutes
        jest.advanceTimersByTime(29 * 60 * 1000);

        // Should still be ACTIVE because timer was reset
        monitor.processMessage({
          groupId: 'group-123',
          text: 'Still here?',
          sender: '+15551234567'
        });

        expect(monitor.getState('group-123')).toBe(STATES.ACTIVE);
      });
    });

    describe('Multiple groups', () => {
      it('tracks state independently for different groups', () => {
        // Activate group-1
        monitor.processMessage({
          groupId: 'group-1',
          text: 'Hey Brokkr',
          sender: '+15551234567'
        });

        // group-2 should still be IDLE
        expect(monitor.getState('group-1')).toBe(STATES.ACTIVE);
        expect(monitor.getState('group-2')).toBe(STATES.IDLE);

        // Send messages to group-1 only
        for (let i = 0; i < 25; i++) {
          monitor.processMessage({
            groupId: 'group-1',
            text: 'Message ' + i,
            sender: '+15551234567'
          });
        }

        // group-1 should be IDLE now, group-2 still IDLE
        expect(monitor.getState('group-1')).toBe(STATES.IDLE);
        expect(monitor.getState('group-2')).toBe(STATES.IDLE);
      });
    });
  });
});
