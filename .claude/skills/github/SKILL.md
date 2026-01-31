---
name: github
description: "Interact with GitHub - repos, PRs, issues, code review"
version: "1.0.0"
invoke: auto
---

# GitHub Skill

## Purpose
Work with GitHub repositories using Chrome and gh CLI.

## Prerequisites
- Chrome enabled for web UI tasks
- Git configured as "Brokkr Assist" <brokkrassist@icloud.com>

## Credentials (from CLAUDE.md)
- **GitHub Username**: brokkr-agent
- **Email**: brokkrassist@icloud.com
- **Password**: TommyismyMaster1! (for web login via Chrome)
- **Git push**: Requires Personal Access Token (PAT) - create via GitHub Settings if needed

## Instructions

### Reviewing a PR
1. Use `gh pr view <number> --repo <owner/repo>` for details
2. Use `gh pr diff <number> --repo <owner/repo>` for changes
3. Navigate to PR URL in Chrome for visual review
4. Add comments via `gh pr comment` or Chrome

### Creating an Issue
1. Use `gh issue create --repo <owner/repo> --title "..." --body "..."`
2. Or navigate to repo/issues/new in Chrome

### Checking CI Status
1. Use `gh pr checks <number> --repo <owner/repo>`
2. Or view Actions tab in Chrome

### Browsing Code
1. Navigate to file URL in Chrome
2. Or use `gh api repos/<owner>/<repo>/contents/<path>`

## Error Handling
- If not authenticated: Run `gh auth login`
- If repo not found: Verify owner/repo spelling
- If rate limited: Wait and retry

## Examples
- "Review PR #123 on anthropics/claude-code"
- "Create an issue for the login bug"
- "Check if CI passed on my latest PR"
