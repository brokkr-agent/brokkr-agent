#!/bin/bash
# scripts/self-maintain.sh
# Brokkr Self-Maintenance - runs twice daily

cd /Users/brokkrbot/brokkr-agent

LOG_FILE="logs/maintenance-$(date +%Y-%m-%d-%H%M).log"

echo "=== Brokkr Self-Maintenance $(date) ===" | tee -a "$LOG_FILE"

# Step 1: Review recent logs for patterns
echo "Analyzing logs..." | tee -a "$LOG_FILE"
claude -p "Review the logs in logs/ directory. Identify any patterns of failures, retries, or errors. Summarize findings." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 2: Use claude-automation-recommender to evaluate setup
echo "Evaluating Claude Code setup..." | tee -a "$LOG_FILE"
claude -p "/claude-code-setup:claude-automation-recommender - Analyze this codebase and recommend improvements to hooks, skills, and automations." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 3: Use claude-md-management to update CLAUDE.md
echo "Updating CLAUDE.md..." | tee -a "$LOG_FILE"
claude -p "/claude-md-management:revise-claude-md - Update CLAUDE.md with any learnings from recent sessions and logs." \
  --dangerously-skip-permissions >> "$LOG_FILE" 2>&1

# Step 4: Git diff to see what changed
echo "Checking git status..." | tee -a "$LOG_FILE"
git status >> "$LOG_FILE" 2>&1
git diff >> "$LOG_FILE" 2>&1

# Step 5: Commit any improvements
if [ -n "$(git status --porcelain)" ]; then
  echo "Committing improvements..." | tee -a "$LOG_FILE"
  git add -A
  git commit -m "chore: self-maintenance improvements $(date +%Y-%m-%d)" >> "$LOG_FILE" 2>&1
fi

echo "=== Maintenance complete ===" | tee -a "$LOG_FILE"
