# Plans Directory

This directory contains implementation plans for Brokkr agent features. Plans are organized by sprint and follow strict documentation standards.

## Required Skills

### Creating or Editing Plans

**REQUIRED:** Use `superpowers:writing-plans` skill when creating or modifying any plan document.

- Plans must follow the bite-sized task structure (each step 2-5 minutes)
- Include exact file paths, complete code, and expected test output
- DRY, YAGNI, TDD, frequent commits

### Executing Plans

**REQUIRED:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` skill when implementing from a plan.

**REQUIRED:** Use `superpowers:test-driven-development` for all implementation tasks.

- Write failing tests first
- Run tests to verify they fail
- Implement minimal code to pass
- Verify tests pass
- Commit

## Plan Document Structure

Every plan must start with this header:

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Sprint Organization

Plans are organized into sprints in the sprint index files. Each sprint groups related features.

### Current Sprints

- **Apple Integration Sprint** - iMessage, Email, Screen Recording, Notifications
- **BrokkrMVP Integration** - Webhook protocol, callbacks, session management

## File Naming Convention

```
YYYY-MM-DD-<feature-name>.md
```

Example: `2026-02-01-imessage-skill-plan.md`

## Sprint Index Format

Sprint index files (e.g., `sprint-apple-integration.md`) contain:

```markdown
# [Sprint Name] Sprint

## Overview
Brief description of sprint goals.

## Plans

| Plan | Status | Priority | Dependencies |
|------|--------|----------|--------------|
| [Plan Name](./plan-file.md) | Not Started / In Progress / Complete | High/Medium/Low | None / List |

## Completion Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Research Before Execution

Before executing any Apple integration plan, verify against official Apple documentation:

1. **AppleScript References**: developer.apple.com/library/archive/documentation/AppleScript/
2. **Messages.app Scripting**: Search for "Messages.sdef" in Script Editor
3. **Mail.app Scripting**: Search for "Mail.sdef" in Script Editor
4. **System Events**: For notifications, Focus Modes, etc.

## Quality Gates

Before marking a plan as complete:

1. All unit tests pass (`npm test`)
2. Integration tests pass (manual verification)
3. Code reviewed (spec compliance + code quality)
4. Documentation updated (CLAUDE.md, skill.md)
5. Committed with conventional commit messages
