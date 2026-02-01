---
name: chrome
description: Control Google Chrome - navigate, interact with pages, extract content
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Chrome Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: PLACEHOLDER

This skill is a placeholder scaffold. Implementation pending.

## Planned Capabilities

- Open URLs in Chrome
- Navigate between pages
- Execute JavaScript in page context
- Extract page content and data
- Take screenshots of pages
- Manage tabs and windows
- Handle form filling and submissions
- Wait for page elements to load

## Usage

### Via Command (Manual)
```
/chrome open "https://example.com"
/chrome screenshot
/chrome extract "css-selector"
/chrome execute "document.title"
```

### Via Notification (Automatic)
Triggered when web automation is needed by other skills.

## Technical Approach

Uses AppleScript for basic Chrome control, with optional Chrome DevTools Protocol
for advanced interactions.

## Reference Documentation

See `reference/` directory for detailed docs (to be added).

## Dependencies

- Google Chrome browser
- AppleScript access permissions
- Optional: chrome-remote-interface for CDP

## Next Steps

- [ ] Research Chrome AppleScript dictionary
- [ ] Implement basic navigation (open, close, refresh)
- [ ] Implement JavaScript execution
- [ ] Add screenshot capability
- [ ] Implement element interaction
- [ ] Create test suite
