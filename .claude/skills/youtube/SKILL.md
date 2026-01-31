---
name: youtube
description: "Search YouTube, get video info and transcripts"
version: "1.0.0"
invoke: auto
---

# YouTube Skill

## Purpose
Find and analyze YouTube videos. Get transcripts where available.

## Prerequisites
- Chrome enabled (`--chrome` flag)

## Instructions

### Searching for Videos
1. Navigate to https://www.youtube.com/results?search_query=<encoded-query>
2. Wait for results to load
3. Extract video titles, channels, view counts, dates
4. Return top 5-10 relevant results

### Getting Video Info
1. Navigate to video URL
2. Extract title, channel, description, view count, date
3. Note video length

### Getting Transcript
1. Navigate to video URL
2. Click "...more" under description
3. Click "Show transcript" if available
4. Extract transcript text
5. If no transcript: Note limitation

### Summarizing Video Content
1. Get transcript (if available)
2. If no transcript: Watch key sections, note on-screen text
3. Summarize main points

## Error Handling
- If no transcript: Report limitation, offer to describe visible content
- If video unavailable: Report error
- If age-restricted: May need to log in

## Examples
- "Find videos about Python programming"
- "Get the transcript of https://youtube.com/watch?v=..."
- "Summarize the top video about machine learning"
