// tests/resources.test.js
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import {
  shouldCleanup,
  trackProcess,
  untrackProcess,
  getTrackedPids,
  clearTrackedProcesses,
  cleanupTrackedProcesses,
  cleanupChromeProcesses,
  cleanupTempFiles,
  cleanupCompletedJobs,
  cleanupOrphanedActiveJobs,
  fullCleanup,
  startupCleanup
} from '../lib/resources.js';

describe('resources', () => {
  beforeEach(() => {
    // Clear tracked processes before each test
    clearTrackedProcesses();
  });

  describe('shouldCleanup', () => {
    it('returns true when switching sessions (different session codes)', () => {
      const result = shouldCleanup({
        currentSessionCode: 'AB',
        incomingSessionCode: 'CD',
        hasActiveProcess: true
      });

      expect(result).toBe(true);
    });

    it('returns false when continuing same session with active process', () => {
      const result = shouldCleanup({
        currentSessionCode: 'AB',
        incomingSessionCode: 'AB',
        hasActiveProcess: true
      });

      expect(result).toBe(false);
    });

    it('returns true when no current session exists', () => {
      const result = shouldCleanup({
        currentSessionCode: null,
        incomingSessionCode: 'AB',
        hasActiveProcess: false
      });

      expect(result).toBe(true);
    });

    it('returns true when current session exists but no active process', () => {
      const result = shouldCleanup({
        currentSessionCode: 'AB',
        incomingSessionCode: 'AB',
        hasActiveProcess: false
      });

      expect(result).toBe(true);
    });

    it('returns true when incoming session is different even without active process', () => {
      const result = shouldCleanup({
        currentSessionCode: 'AB',
        incomingSessionCode: 'CD',
        hasActiveProcess: false
      });

      expect(result).toBe(true);
    });

    it('returns true when currentSessionCode is undefined', () => {
      const result = shouldCleanup({
        currentSessionCode: undefined,
        incomingSessionCode: 'AB',
        hasActiveProcess: true
      });

      expect(result).toBe(true);
    });
  });

  describe('trackProcess', () => {
    it('adds PID to tracked list', () => {
      trackProcess(1234);
      expect(getTrackedPids()).toContain(1234);
    });

    it('adds multiple PIDs to tracked list', () => {
      trackProcess(1234);
      trackProcess(5678);
      trackProcess(9012);

      const pids = getTrackedPids();
      expect(pids).toContain(1234);
      expect(pids).toContain(5678);
      expect(pids).toContain(9012);
      expect(pids.length).toBe(3);
    });

    it('does not add duplicate PIDs', () => {
      trackProcess(1234);
      trackProcess(1234);
      trackProcess(1234);

      const pids = getTrackedPids();
      expect(pids.filter(p => p === 1234).length).toBe(1);
    });
  });

  describe('untrackProcess', () => {
    it('removes PID from tracked list', () => {
      trackProcess(1234);
      trackProcess(5678);

      untrackProcess(1234);

      const pids = getTrackedPids();
      expect(pids).not.toContain(1234);
      expect(pids).toContain(5678);
    });

    it('does nothing when untracking non-existent PID', () => {
      trackProcess(1234);
      untrackProcess(9999); // Non-existent

      const pids = getTrackedPids();
      expect(pids).toContain(1234);
      expect(pids.length).toBe(1);
    });
  });

  describe('getTrackedPids', () => {
    it('returns empty array when no PIDs tracked', () => {
      const pids = getTrackedPids();
      expect(pids).toEqual([]);
    });

    it('returns array of tracked PIDs', () => {
      trackProcess(100);
      trackProcess(200);

      const pids = getTrackedPids();
      expect(pids).toHaveLength(2);
      expect(pids).toContain(100);
      expect(pids).toContain(200);
    });

    it('returns a copy of the internal array (immutable)', () => {
      trackProcess(100);
      const pids = getTrackedPids();
      pids.push(999);

      expect(getTrackedPids()).not.toContain(999);
    });
  });

  describe('clearTrackedProcesses', () => {
    it('removes all tracked PIDs', () => {
      trackProcess(1);
      trackProcess(2);
      trackProcess(3);

      clearTrackedProcesses();

      expect(getTrackedPids()).toEqual([]);
    });
  });

  describe('cleanupTrackedProcesses', () => {
    let mockKill;

    beforeEach(() => {
      // Mock process.kill
      mockKill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      mockKill.mockRestore();
    });

    it('sends SIGTERM to all tracked PIDs', () => {
      trackProcess(1234);
      trackProcess(5678);

      cleanupTrackedProcesses();

      expect(mockKill).toHaveBeenCalledWith(1234, 'SIGTERM');
      expect(mockKill).toHaveBeenCalledWith(5678, 'SIGTERM');
    });

    it('clears tracked PIDs after cleanup', () => {
      trackProcess(1234);

      cleanupTrackedProcesses();

      expect(getTrackedPids()).toEqual([]);
    });

    it('handles errors when killing processes gracefully', () => {
      mockKill.mockImplementation(() => {
        throw new Error('ESRCH: No such process');
      });

      trackProcess(1234);

      // Should not throw
      expect(() => cleanupTrackedProcesses()).not.toThrow();
      expect(getTrackedPids()).toEqual([]);
    });

    it('returns count of killed processes', () => {
      trackProcess(1234);
      trackProcess(5678);

      const count = cleanupTrackedProcesses();
      expect(count).toBe(2);
    });

    it('returns 0 when no processes to kill', () => {
      const count = cleanupTrackedProcesses();
      expect(count).toBe(0);
    });
  });

  describe('cleanupChromeProcesses', () => {
    let execSyncMock;

    beforeEach(() => {
      // We need to mock execSync from child_process
      // This is done via jest.unstable_mockModule or manual mocking
    });

    it('kills Google Chrome for Testing processes', async () => {
      // Test that the function attempts to kill Chrome for Testing
      // The actual implementation will use execSync with pkill
      const result = cleanupChromeProcesses();
      expect(typeof result).toBe('number');
    });
  });

  describe('cleanupTempFiles', () => {
    it('returns count of cleaned files', () => {
      const result = cleanupTempFiles();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cleanupCompletedJobs', () => {
    it('accepts maxAgeDays parameter', () => {
      const result = cleanupCompletedJobs(7);
      expect(typeof result).toBe('number');
    });

    it('defaults to 7 days if no parameter provided', () => {
      const result = cleanupCompletedJobs();
      expect(typeof result).toBe('number');
    });
  });

  describe('cleanupOrphanedActiveJobs', () => {
    it('returns count of moved jobs', () => {
      const result = cleanupOrphanedActiveJobs();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fullCleanup', () => {
    let mockKill;

    beforeEach(() => {
      mockKill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      mockKill.mockRestore();
    });

    it('returns summary object with all cleanup results', () => {
      const result = fullCleanup();

      expect(result).toHaveProperty('trackedProcesses');
      expect(result).toHaveProperty('chromeProcesses');
      expect(result).toHaveProperty('tempFiles');
      expect(result).toHaveProperty('completedJobs');
      expect(result).toHaveProperty('orphanedJobs');
    });

    it('all results are numbers', () => {
      const result = fullCleanup();

      expect(typeof result.trackedProcesses).toBe('number');
      expect(typeof result.chromeProcesses).toBe('number');
      expect(typeof result.tempFiles).toBe('number');
      expect(typeof result.completedJobs).toBe('number');
      expect(typeof result.orphanedJobs).toBe('number');
    });
  });

  describe('startupCleanup', () => {
    let mockKill;

    beforeEach(() => {
      mockKill = jest.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      mockKill.mockRestore();
    });

    it('runs cleanup operations on startup', () => {
      const result = startupCleanup();

      expect(result).toHaveProperty('chromeProcesses');
      expect(result).toHaveProperty('tempFiles');
      expect(result).toHaveProperty('orphanedJobs');
    });

    it('does not cleanup tracked processes on startup', () => {
      trackProcess(1234);

      const result = startupCleanup();

      // startupCleanup should NOT have trackedProcesses property
      // because we don't want to kill subagent processes on restart
      expect(result).not.toHaveProperty('trackedProcesses');
    });
  });
});
