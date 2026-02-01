# Concepts Directory

This directory contains brainstorming documents for features not yet formally planned. Concepts explore ideas, research feasibility, and gather documentation before committing to implementation plans.

## Required Skills

### Creating or Editing Concept Documents

**REQUIRED:** Use `superpowers:brainstorming` skill when creating or modifying concept documents.

**REQUIRED:** Use `superpowers:dispatching-parallel-agents` skill for efficient research of multiple topics.

**REQUIRED:** Use the `research` skill to gather official documentation sources.

### Before Brainstorming

1. Research official development documentation for the technology/integration
2. Gather key points, capabilities, and limitations
3. List all documentation sources with URLs
4. Identify patterns from existing codebase

### Document Structure

Every concept document should include:

```markdown
# [Feature Name] Concept

## Overview
Brief description of what this feature would accomplish.

## Research Summary

### Official Documentation Sources
- [Source 1 Name](url) - Brief description
- [Source 2 Name](url) - Brief description

### Key Capabilities Found
- Capability 1
- Capability 2

### Limitations Discovered
- Limitation 1
- Limitation 2

## Proposed Architecture
High-level approach before detailed planning.

## Open Questions
- Question 1
- Question 2

## Next Steps
- [ ] Resolve open questions
- [ ] Create formal implementation plan in docs/plans/
```

## Workflow

```
Concept (brainstorming + research)
    ↓
docs/plans/YYYY-MM-DD-<feature>-plan.md (formal planning)
    ↓
Implementation (executing-plans + TDD)
```

## Parallel Research Pattern

When researching multiple technologies or integrations:

1. Identify independent research topics
2. Use `superpowers:dispatching-parallel-agents` skill
3. Dispatch one agent per topic with clear research goals
4. Collect findings and synthesize
5. Document all sources in concept file

Example:
```
Agent 1 → Research Messages.app AppleScript
Agent 2 → Research Mail.app AppleScript
Agent 3 → Research screencapture CLI
```

## Graduating to Plans

A concept is ready to become a formal plan when:

1. All research is complete with documentation sources
2. Architecture is validated against official docs
3. Open questions are resolved
4. Dependencies are identified

Create the plan using `superpowers:writing-plans` skill in docs/plans/.

## File Naming Convention

```
YYYY-MM-DD-<feature-name>.md
```

Example: `2026-01-31-brokkr-self-improvement-system.md`
