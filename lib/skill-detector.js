// lib/skill-detector.js
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { info, success, error } from './logger.js';

const SKILLS_DIR = join(process.cwd(), '.claude', 'skills');
const PATTERNS_FILE = join(process.cwd(), 'data', 'task-patterns.json');

// Ensure directories exist
if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
if (!existsSync(join(process.cwd(), 'data'))) mkdirSync(join(process.cwd(), 'data'), { recursive: true });

function getPatterns() {
  if (!existsSync(PATTERNS_FILE)) return { patterns: [] };
  return JSON.parse(readFileSync(PATTERNS_FILE, 'utf-8'));
}

function savePatterns(data) {
  writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

export function recordTaskPattern(task, succeeded) {
  const data = getPatterns();

  // Extract key verbs/nouns for pattern matching
  const normalized = task.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .replace(/\d+/g, '<NUM>')
    .replace(/['"]/g, '');

  // Find or create pattern
  let pattern = data.patterns.find(p =>
    normalized.includes(p.keywords[0]) &&
    p.keywords.every(k => normalized.includes(k))
  );

  if (!pattern) {
    // Extract first 3 significant words as keywords
    const words = normalized.split(/\s+/).filter(w => w.length > 3 && !['the', 'and', 'for', 'with'].includes(w));
    pattern = {
      keywords: words.slice(0, 3),
      count: 0,
      successes: 0,
      examples: [],
      skillCreated: false
    };
    data.patterns.push(pattern);
  }

  pattern.count++;
  if (succeeded) pattern.successes++;
  if (pattern.examples.length < 5) pattern.examples.push(task);

  savePatterns(data);

  // Check if should create skill
  if (pattern.count >= 3 && pattern.successes >= 2 && !pattern.skillCreated) {
    createSkillForPattern(pattern);
    pattern.skillCreated = true;
    savePatterns(data);
  }
}

function createSkillForPattern(pattern) {
  info('SkillDetector', 'Creating skill for pattern', { keywords: pattern.keywords });

  const prompt = `Use the superpowers:writing-skills skill to create a new skill based on this pattern:

Keywords: ${pattern.keywords.join(', ')}
Example tasks:
${pattern.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Create a well-structured SKILL.md that captures this reusable pattern. Save it to .claude/skills/<appropriate-name>/SKILL.md`;

  const child = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.on('close', (code) => {
    if (code === 0) {
      success('SkillDetector', 'Skill created for pattern', { keywords: pattern.keywords });
    } else {
      error('SkillDetector', 'Failed to create skill', { keywords: pattern.keywords, code });
    }
  });
}

export function getExistingSkills() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}
