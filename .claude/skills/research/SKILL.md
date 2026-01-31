---
name: research
description: "Research topics on the web, summarize articles"
version: "1.0.0"
invoke: auto
---

# Web Research Skill

## Purpose
Research topics using web search and browsing. Summarize findings.

## Prerequisites
- Chrome enabled (`--chrome` flag)
- WebSearch and WebFetch tools available

## Instructions

### Researching a Topic
1. Use WebSearch to find relevant sources
2. Open top 3-5 results in Chrome or via WebFetch
3. Extract key information from each source
4. Synthesize findings into a summary
5. Include source URLs for reference

### Summarizing an Article
1. Navigate to URL in Chrome or use WebFetch
2. Extract main content (skip ads, navigation)
3. Identify key points, quotes, data
4. Write concise summary (3-5 bullet points)

### Comparing Sources
1. Gather information from multiple sources
2. Note agreements and disagreements
3. Highlight most credible/recent sources
4. Present balanced summary

## Error Handling
- If page won't load: Try WebFetch instead of Chrome
- If content is paywalled: Note limitation, try alternative source
- If results are outdated: Add current year to search

## Examples
- "Research the latest developments in AI agents"
- "Summarize this article: <url>"
- "Compare coverage of <event> across news sites"
