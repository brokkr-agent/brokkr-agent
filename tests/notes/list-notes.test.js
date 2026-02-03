import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('Notes - List Notes', () => {
  describe('list-notes', () => {
    const scriptPath = path.join(process.cwd(), 'skills/notes/list-notes.scpt');

    it('should have the script file', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('should return JSON with success and data array for default folder', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('data');
      expect(Array.isArray(parsed.data)).toBe(true);
    });

    it('should return note objects with required properties', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      if (parsed.success && parsed.data.length > 0) {
        const note = parsed.data[0];
        expect(note).toHaveProperty('name');
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('creationDate');
        expect(note).toHaveProperty('modificationDate');
        expect(note).toHaveProperty('folder');
      }
    });

    it('should accept folder name argument', () => {
      const result = execSync(`osascript "${scriptPath}" "Notes"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('data');
    });

    it('should return error for non-existent folder', () => {
      const result = execSync(`osascript "${scriptPath}" "NonExistentFolder12345"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });
  });

  describe('list-recent', () => {
    const scriptPath = path.join(process.cwd(), 'skills/notes/list-recent.scpt');

    it('should have the script file', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });

    it('should return JSON with success and data array', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('data');
      expect(Array.isArray(parsed.data)).toBe(true);
    });

    it('should return note objects with required properties', () => {
      const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      if (parsed.success && parsed.data.length > 0) {
        const note = parsed.data[0];
        expect(note).toHaveProperty('name');
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('creationDate');
        expect(note).toHaveProperty('modificationDate');
        expect(note).toHaveProperty('folder');
      }
    });

    it('should accept limit argument', () => {
      const result = execSync(`osascript "${scriptPath}" "5"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('success');
      expect(parsed.data.length).toBeLessThanOrEqual(5);
    });

    it('should return notes sorted by modification date (most recent first)', () => {
      const result = execSync(`osascript "${scriptPath}" "10"`, { encoding: 'utf8' });
      const parsed = JSON.parse(result);

      if (parsed.success && parsed.data.length > 1) {
        // Verify descending order by modification date
        for (let i = 0; i < parsed.data.length - 1; i++) {
          const date1 = new Date(parsed.data[i].modificationDate);
          const date2 = new Date(parsed.data[i + 1].modificationDate);
          expect(date1.getTime()).toBeGreaterThanOrEqual(date2.getTime());
        }
      }
    });
  });
});
