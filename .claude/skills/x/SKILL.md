---
name: x
description: "Interact with X (Twitter) - post, read, search, engage"
version: "1.0.0"
invoke: auto
---

# X (Twitter) Skill

## Purpose
Interact with X.com using Chrome automation. Post tweets, read timelines, search, engage.

## Prerequisites
- Chrome enabled (`--chrome` flag)

## Credentials (from CLAUDE.md)
- **Email**: brokkrassist@icloud.com
- **Password**: TommyismyMaster1!

## Instructions

### Posting a Tweet
1. Navigate to https://x.com/compose/tweet
2. Wait for compose box to load
3. Type the tweet content
4. Click "Post" button
5. Verify tweet was posted by checking for success indicator

### Reading Timeline
1. Navigate to https://x.com/home
2. Scroll to load tweets
3. Extract text content from visible tweets
4. Summarize key topics/themes

### Searching
1. Navigate to https://x.com/search?q=<encoded-query>
2. Select "Latest" tab for recent content
3. Scroll and collect results
4. Summarize findings

### Engaging (Like/Retweet/Reply)
1. Navigate to specific tweet URL
2. Find engagement buttons
3. Click appropriate action
4. Verify action completed

## Error Handling
- If login prompt appears: Log in using credentials from CLAUDE.md
- If rate limited: Wait 5 minutes, retry
- If element not found: Refresh page, retry with updated selectors

## Examples
- "Post a tweet about the weather"
- "Check what people are saying about AI"
- "Like the latest tweet from @anthropic"
