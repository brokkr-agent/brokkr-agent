import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

describe('Notes - List Folders', () => {
  const scriptPath = path.join(process.cwd(), 'skills/notes/list-folders.scpt');

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

  it('should return folder objects with required properties', () => {
    const result = execSync(`osascript "${scriptPath}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);

    if (parsed.data.length > 0) {
      const folder = parsed.data[0];
      expect(folder).toHaveProperty('name');
      expect(folder).toHaveProperty('id');
    }
  });
});
