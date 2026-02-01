---
name: video-creation
description: Create polished tutorial videos from recordings using Remotion. Use for producing brokkr.co content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Video Creation Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Overview

Create professional tutorial videos from screen recordings using the Remotion framework. Adds intro/outro sequences, callout annotations, and renders high-quality output for brokkr.co content.

## Capabilities

- Add branded intro/outro sequences
- Apply callout annotations at specific timestamps
- Render high-quality video with Remotion
- Share via iCloud Family Sharing
- Chapter marker generation (via content-analyzer subagent)

## Usage

### Via Command (Manual)
```
/video create "Tutorial Title"    # Full workflow: render + share
/video render recording.mov       # Render recording with Remotion
/video preview                    # Open Remotion Studio
/video share video.mp4            # Share via iCloud
/video list                       # List available videos
```

### Via Notification (Automatic)
Can be triggered when screen recording completes.

## Workflow

1. **Record** - Use `/record` to capture screen activity
2. **Create** - Use `/video create "Title"` to process with Remotion
3. **Share** - Video automatically shared via iCloud Family Sharing

```
Screen Recording (.mov)
        |
        v
+------------------+
| Remotion Project |
| - Intro sequence |
| - Main content   |
| - Callouts       |
| - Outro sequence |
+------------------+
        |
        v
Final Video (.mp4)
        |
        v
iCloud Family Sharing
```

## Configuration

**Config file:** `skills/video-creation/config.json`

```json
{
  "exports_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports",
  "remotion_concurrency": 2,
  "default_resolution": "1080p",
  "intro_duration_frames": 90,
  "outro_duration_frames": 120
}
```

## Templates

### TutorialVideo (Default)
- 3-second animated intro with title
- Full screen recording content
- 4-second outro with CTA
- Branded color scheme (#1a1a2e, #e94560)

### QuickDemo (Planned)
- Shorter format
- Minimal intro
- No outro

## iCloud Storage

Using `lib/icloud-storage.js`:

**Recordings:**
```
~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings/YYYY-MM-DD/
```

**Exports:**
```
~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/YYYY-MM-DD/
```

**Family Sharing:**
```
~/Library/Mobile Documents/com~apple~CloudDocs/Family/Brokkr-Videos/
```

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/render.js` | Render video with Remotion |
| `scripts/preview.sh` | Open Remotion Studio |
| `scripts/share.sh` | Share to iCloud Family Sharing |
| `scripts/create-tutorial.sh` | Full end-to-end workflow |

## Memory Optimization (8GB RAM)

The Mac has limited RAM. Optimize rendering with:

- **Concurrency:** 2 (use `npx remotion benchmark` to confirm)
- **Cache:** Default ~4GB (50% of system RAM)
- **Pre-render:** Kill Chrome, Safari before rendering
- **Resolution:** 1080p for most, 720p for videos >10 minutes

## Quality Presets

| Preset | CRF Value | Use Case |
|--------|-----------|----------|
| high | 18 | Final production |
| medium | 23 | Preview/draft |
| low | 28 | Quick test |

## Remotion Project

Located at: `/Users/brokkrbot/brokkr-agent/remotion-videos/`

Key files:
- `src/compositions/TutorialVideo.tsx` - Main template
- `src/components/Callout.tsx` - Annotation component
- `src/components/Outro.tsx` - Ending sequence

## Content Analyzer Subagent

The `content-analyzer` subagent (`.claude/agents/content-analyzer.md`) can analyze video content to:
- Identify key sections and transitions
- Generate chapter markers with timestamps
- Create brief descriptions for each section
- Suggest callout placements

## Limitations

1. **Memory:** Rendering is memory-intensive on 8GB RAM
2. **Serial:** One render at a time
3. **No ffmpeg:** Using Remotion for all composition
4. **Sync delay:** iCloud sync may take minutes for large files

## Reference Documentation

See `reference/` directory for detailed docs:
- `remotion-patterns.md` - Remotion best practices
