# Screen Recording & Remotion Tutorial Video System

> **Architecture:** This plan follows [Apple Integration Architecture](../concepts/2026-02-01-apple-integration-architecture.md).

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Enable Brokkr to create polished tutorial videos for brokkr.co by combining macOS screen recording with Remotion post-processing for intros, annotations, and professional output.

**Architecture:** Two-phase workflow: (1) Screen capture skill using native macOS `screencapture -v` for raw recording, (2) Remotion project for post-processing with React-based templates for intros, callouts, and transitions. Recordings stored in iCloud, Remotion project in `remotion-videos/`. **Delivery:** Final videos sent to Tommy via iMessage attachment (primary) with iCloud link as backup for large files.

**Tech Stack:** macOS screencapture CLI, Node.js, Remotion framework (v4.0+), React, @remotion/transitions, iCloud Drive

---

## Standardized Skill Structure

### Screen Capture Skill

```
skills/screen-capture/
├── SKILL.md                    # Main instructions (with frontmatter)
├── config.json                 # Integration-specific config
├── lib/
│   ├── screen-capture.js       # Core functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── screencapture-cli.md
├── scripts/                    # Reusable automation scripts
│   ├── record.sh
│   ├── stop.sh
│   ├── list-windows.sh
│   ├── list-recordings.sh
│   └── list-audio-sources.sh
└── tests/
    └── screen-capture.test.js
```

### Video Creation Skill

```
skills/video-creation/
├── SKILL.md                    # Main instructions (with frontmatter)
├── config.json                 # Integration-specific config
├── lib/
│   ├── video-creation.js       # Core functionality
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── remotion-patterns.md
├── scripts/                    # Reusable automation scripts
│   ├── render.js
│   ├── preview.sh
│   ├── share.sh
│   └── create-tutorial.sh
└── tests/
    └── video-creation.test.js
```

## Command Files

### Screen Capture Command

**Location:** `.claude/commands/record.md`

```yaml
---
name: record
description: Start or stop screen recording using macOS screencapture
argument-hint: [stop|window|region] [--duration <seconds>]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the screen-capture skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

### Video Creation Command

**Location:** `.claude/commands/video.md`

```yaml
---
name: video
description: Create and manage tutorial videos using Remotion
argument-hint: <create|render|preview|share|list> [recording] [--title "Title"]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the video-creation skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## SKILL.md Standard Headers

### Screen Capture SKILL.md

```yaml
---
name: screen-capture
description: Screen recording using macOS native screencapture. Use for capturing tutorials, demos, and screen content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Screen Capture Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Full-screen recording
- Window-specific recording
- Region selection recording
- Timed recordings
- Cursor capture option
- Audio source selection

## Usage

### Via Command (Manual)
```
/record
/record stop
/record window
/record --duration 30
```

## Reference Documentation

See `reference/` directory for detailed docs.
```

### Video Creation SKILL.md

```yaml
---
name: video-creation
description: Create polished tutorial videos from recordings using Remotion. Use for producing brokkr.co content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Video Creation Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Add intro/outro sequences
- Apply callout annotations
- Render with Remotion
- Share via iCloud Family Sharing

## Usage

### Via Command (Manual)
```
/video create "Tutorial Title"
/video render recording.mov --title "Title"
/video preview
/video share video.mp4
```

## Reference Documentation

See `reference/` directory for detailed docs.
```

## iCloud Storage Integration

All recordings and rendered videos stored using `lib/icloud-storage.js`:

```javascript
// Recordings → iCloud
const { getPath } = require('../../lib/icloud-storage.js');
const recordingPath = getPath('recordings', `recording-${timestamp}.mov`);
// → ~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings/YYYY-MM-DD/recording-*.mov

// Exports → iCloud
const exportPath = getPath('exports', `tutorial-${title}.mp4`);
// → ~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/YYYY-MM-DD/tutorial-*.mp4
```

## Custom Subagent: Content Analyzer

**Location:** `.claude/agents/content-analyzer.md`

```yaml
---
name: content-analyzer
description: Analyze video content to generate chapter markers and descriptions
tools: Read, Grep
model: haiku
permissionMode: dontAsk
---

You are a content analyzer for tutorial videos. Analyze the video/recording and:

1. Identify key sections and transitions
2. Generate chapter markers with timestamps
3. Create brief descriptions for each section
4. Suggest callout placements

Video data: $ARGUMENTS

Output JSON:
{
  "chapters": [
    {"timestamp": "0:00", "title": "Introduction", "description": "..."},
    {"timestamp": "0:30", "title": "Setup", "description": "..."}
  ],
  "callouts": [
    {"timestamp": "0:15", "text": "Click here", "x": 50, "y": 30}
  ]
}
```

## Notification Processing Criteria

| Criteria | Queue If | Drop If |
|----------|----------|---------|
| Recording | Recording completed successfully | Recording failed/cancelled |
| Rendering | Render completed | Render in progress |
| Sharing | Upload to iCloud complete | Already shared |

---

## Research Validation (2026-02-01)

### Plan Status: Solid Architecture, Enhancement Opportunities

Research against official documentation confirms the two-phase workflow is correct.

### Enhancements to Add

**Screen Capture:**
1. **Cursor capture** - Add `-C` flag option to record.sh for capturing cursor in tutorials
2. **Audio source discovery** - Create `list-audio-sources.sh` script
3. **Permissions check** - Terminal needs Screen Recording permission
4. **Sound suppression** - Add `-x` flag to disable screenshot sounds
5. **Delay option** - Add `-T <seconds>` for delayed recording start

**Remotion:**
1. **Use @remotion/transitions package** - Built-in transitions instead of custom
2. **Quality presets** - Add CRF-based quality options (high/medium/low)
3. **Concurrency tuning** - Use `npx remotion benchmark` to find optimal value
4. **Progress indicators** - Use `--log=verbose` for rendering progress

### Memory Optimization for 8GB RAM

- Default Remotion cache: ~4GB (50% of system RAM)
- Optimal concurrency: 2 (benchmark to confirm)
- Pre-render cleanup: Kill Chrome, Safari before rendering
- Resolution strategy: 1080p for most, 720p for videos >10 minutes

### Permission Requirements

1. **Screen Recording** (required):
   - System Settings → Privacy & Security → Privacy → Screen Recording
   - Add Terminal.app

2. **Automation** (for window ID retrieval):
   - Allow Terminal to control target applications

### Official Documentation Sources

- [screencapture Man Page - SS64](https://ss64.com/mac/screencapture.html)
- [Remotion Official Documentation](https://www.remotion.dev/docs/)
- [Remotion CLI Render](https://www.remotion.dev/docs/cli/render)
- [Remotion Performance Guide](https://www.remotion.dev/docs/performance)
- [Remotion Transitions](https://www.remotion.dev/docs/transitions/transitionseries)

---

## Design Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| 8GB RAM | Remotion rendering memory-intensive | Serial rendering, close other apps, use lower resolution if needed |
| No ffmpeg | Cannot use advanced video editing | Use screencapture native output (.mov), Remotion handles composition |
| Serial execution | One task at a time | Recording and rendering are separate operations |
| iCloud sync | Delivery may take time | Check sync status, notify Tommy when ready |

---

## Phase 1: Screen Capture Skill

### Task 1.1: Create Screen Capture Skill Directory Structure (Standardized)

**Files:**
- Create: `skills/screen-capture/SKILL.md` (with frontmatter)
- Create: `skills/screen-capture/config.json`
- Create: `skills/screen-capture/lib/` directory
- Create: `skills/screen-capture/reference/` directory
- Create: `skills/screen-capture/scripts/` directory
- Create: `skills/screen-capture/tests/` directory
- Create: `.claude/commands/record.md`

**Step 1: Create directory structure**

```bash
mkdir -p skills/screen-capture/lib
mkdir -p skills/screen-capture/reference
mkdir -p skills/screen-capture/scripts
mkdir -p skills/screen-capture/tests
mkdir -p .claude/commands
```

**Step 2: Create SKILL.md with frontmatter**

```yaml
---
name: screen-capture
description: Screen recording using macOS native screencapture. Use for capturing tutorials, demos, and screen content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Screen Capture Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Full-screen recording
- Window-specific recording
- Region selection recording
- Timed recordings with `-V <seconds>`
- Cursor capture with `-C` flag
- Audio source selection with `-G`

## Usage

### Via Command (Manual)
```
/record                  # Start full-screen recording
/record window           # Record specific window
/record region           # Record screen region
/record stop             # Stop current recording
/record --duration 30    # Record for 30 seconds
/recordings              # List available recordings
```

## Configuration

Edit `skills/screen-capture/config.json`:

```json
{
  "recordings_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings",
  "default_format": "mov",
  "capture_cursor": true,
  "suppress_sounds": true
}
```

## Permission Requirements

1. **Screen Recording** (required):
   - System Settings → Privacy & Security → Privacy → Screen Recording
   - Add Terminal.app

2. **Automation** (for window ID retrieval):
   - Allow Terminal to control target applications

## Reference Documentation

See `reference/` directory for detailed docs:
- `screencapture-cli.md` - CLI options and patterns
```

**Step 3: Create config.json**

```json
{
  "recordings_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings",
  "default_format": "mov",
  "capture_cursor": true,
  "suppress_sounds": true,
  "default_display": 1
}
```

**Step 4: Create command file**

Create `.claude/commands/record.md`:

```yaml
---
name: record
description: Start or stop screen recording using macOS screencapture
argument-hint: [stop|window|region] [--duration <seconds>]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the screen-capture skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

**Step 5: Create reference documentation**

Create `skills/screen-capture/reference/screencapture-cli.md`:

```markdown
# screencapture CLI Reference

## Official Documentation Sources

- [screencapture Man Page - SS64](https://ss64.com/mac/screencapture.html)
- [macOS screencapture Documentation](https://ss64.com/mac/screencapture.html)

## Key Flags

| Flag | Description |
|------|-------------|
| `-v` | Capture video (continuous) |
| `-V <seconds>` | Capture video for duration |
| `-C` | Capture cursor |
| `-x` | Suppress screenshot sounds |
| `-l <windowid>` | Capture specific window |
| `-R <x,y,w,h>` | Capture specific region |
| `-D <display>` | Capture specific display |
| `-G <audioid>` | Include audio source |
| `-T <seconds>` | Delay before capture |

## Audio Source Discovery

```bash
# List audio sources
osascript -e 'tell application "System Events" to get name of every audio source'
```

## Window ID Discovery

```bash
# Get window IDs via AppleScript
osascript -e 'tell application "System Events" to get id of every window of every process'
```
```

**Step 6: Commit**

```bash
git add skills/screen-capture/ .claude/commands/record.md
git commit -m "feat(screen-capture): create standardized skill structure"
```

---

### Task 1.2: Create Window Listing Script

**Files:**
- Create: `skills/screen-capture/list-windows.sh`
- Test: Manual verification

**Step 1: Create the script**

```bash
#!/bin/bash
# list-windows.sh - List all windows with their IDs for screen recording
#
# Usage: ./list-windows.sh [app-name]
# Output: JSON array of windows with id, app, title

APP_FILTER="$1"

osascript -e '
set windowList to {}
tell application "System Events"
    set allProcesses to application processes whose visible is true
    repeat with proc in allProcesses
        set appName to name of proc
        try
            set appWindows to windows of proc
            repeat with w in appWindows
                set windowTitle to name of w
                set windowId to id of w
                set end of windowList to "{\"app\": \"" & appName & "\", \"title\": \"" & windowTitle & "\", \"id\": " & windowId & "}"
            end repeat
        end try
    end repeat
end tell
return "[" & (my joinList(windowList, ",")) & "]"

on joinList(theList, delimiter)
    set oldDelimiters to AppleScript'"'"'s text item delimiters
    set AppleScript'"'"'s text item delimiters to delimiter
    set theString to theList as string
    set AppleScript'"'"'s text item delimiters to oldDelimiters
    return theString
end joinList
'
```

**Step 2: Make executable and test**

```bash
chmod +x skills/screen-capture/list-windows.sh
./skills/screen-capture/list-windows.sh
```

Expected: JSON output listing visible windows with their IDs

**Step 3: Commit**

```bash
git add skills/screen-capture/list-windows.sh
git commit -m "feat(screen-capture): add window listing script"
```

---

### Task 1.3: Create Recording Start Script

**Files:**
- Create: `skills/screen-capture/record.sh`
- Test: Manual verification

**Step 1: Create the script**

```bash
#!/bin/bash
# record.sh - Start screen recording using macOS screencapture
#
# Usage: ./record.sh [options]
#   --window <id>     Record specific window
#   --region          Prompt for region selection
#   --duration <sec>  Record for specific duration
#   --display <num>   Record specific display (1=main)
#   --audio <id>      Include audio source
#   --output <path>   Custom output path

set -e

RECORDINGS_DIR="/Users/brokkrbot/brokkr-agent/recordings"
LOCK_FILE="/Users/brokkrbot/brokkr-agent/recordings/.recording.lock"
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
OUTPUT_FILE="${RECORDINGS_DIR}/recording-${TIMESTAMP}.mov"

# Parse arguments
WINDOW_ID=""
REGION=""
DURATION=""
DISPLAY=""
AUDIO=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --window)
            WINDOW_ID="$2"
            shift 2
            ;;
        --region)
            REGION="1"
            shift
            ;;
        --duration)
            DURATION="$2"
            shift 2
            ;;
        --display)
            DISPLAY="$2"
            shift 2
            ;;
        --audio)
            AUDIO="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if already recording
if [ -f "$LOCK_FILE" ]; then
    EXISTING_PID=$(cat "$LOCK_FILE" | head -1)
    if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
        echo "ERROR: Recording already in progress (PID: $EXISTING_PID)"
        echo "Use './stop.sh' to stop the current recording"
        exit 1
    else
        # Stale lock file
        rm -f "$LOCK_FILE"
    fi
fi

# Ensure recordings directory exists
mkdir -p "$RECORDINGS_DIR"

# Build screencapture command
CMD="screencapture"

# Duration flag (-V for timed, -v for continuous)
if [ -n "$DURATION" ]; then
    CMD="$CMD -V $DURATION"
else
    CMD="$CMD -v"
fi

# Window-specific recording
if [ -n "$WINDOW_ID" ]; then
    CMD="$CMD -l $WINDOW_ID"
fi

# Region selection (interactive)
if [ -n "$REGION" ]; then
    CMD="$CMD -R"
fi

# Display selection
if [ -n "$DISPLAY" ]; then
    CMD="$CMD -D $DISPLAY"
fi

# Audio source
if [ -n "$AUDIO" ]; then
    CMD="$CMD -G $AUDIO"
fi

# Output file
CMD="$CMD $OUTPUT_FILE"

echo "Starting screen recording..."
echo "Output: $OUTPUT_FILE"
echo "Command: $CMD"
echo ""

# Start recording in background
$CMD &
PID=$!

# Write lock file
echo "$PID" > "$LOCK_FILE"
echo "$OUTPUT_FILE" >> "$LOCK_FILE"
echo "$TIMESTAMP" >> "$LOCK_FILE"

echo "Recording started (PID: $PID)"
echo "Use './stop.sh' or press Ctrl+C to stop"

# If duration specified, wait and cleanup
if [ -n "$DURATION" ]; then
    echo "Recording for $DURATION seconds..."
    wait $PID
    rm -f "$LOCK_FILE"
    echo "Recording complete: $OUTPUT_FILE"
fi
```

**Step 2: Make executable and test**

```bash
chmod +x skills/screen-capture/record.sh

# Test with 3-second recording
./skills/screen-capture/record.sh --duration 3
```

Expected: Creates a 3-second .mov file in recordings/

**Step 3: Commit**

```bash
git add skills/screen-capture/record.sh
git commit -m "feat(screen-capture): add recording start script"
```

---

### Task 1.4: Create Recording Stop Script

**Files:**
- Create: `skills/screen-capture/stop.sh`
- Test: Manual verification

**Step 1: Create the script**

```bash
#!/bin/bash
# stop.sh - Stop current screen recording
#
# Usage: ./stop.sh

set -e

LOCK_FILE="/Users/brokkrbot/brokkr-agent/recordings/.recording.lock"

if [ ! -f "$LOCK_FILE" ]; then
    echo "No recording in progress"
    exit 0
fi

PID=$(head -1 "$LOCK_FILE")
OUTPUT_FILE=$(sed -n '2p' "$LOCK_FILE")
START_TIME=$(sed -n '3p' "$LOCK_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping recording (PID: $PID)..."
    kill -INT "$PID" 2>/dev/null || kill "$PID" 2>/dev/null

    # Wait for process to finish
    sleep 1

    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Force stopping..."
        kill -9 "$PID" 2>/dev/null
    fi

    echo "Recording stopped"
else
    echo "Recording process already stopped"
fi

rm -f "$LOCK_FILE"

if [ -f "$OUTPUT_FILE" ]; then
    FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
    echo "Saved: $OUTPUT_FILE ($FILE_SIZE)"
else
    echo "Warning: Output file not found at $OUTPUT_FILE"
fi
```

**Step 2: Make executable and test**

```bash
chmod +x skills/screen-capture/stop.sh

# Test: start recording, then stop
./skills/screen-capture/record.sh &
sleep 2
./skills/screen-capture/stop.sh
```

Expected: Recording stops and file is saved

**Step 3: Commit**

```bash
git add skills/screen-capture/stop.sh
git commit -m "feat(screen-capture): add recording stop script"
```

---

### Task 1.5: Create Recordings List Script

**Files:**
- Create: `skills/screen-capture/list-recordings.sh`

**Step 1: Create the script**

```bash
#!/bin/bash
# list-recordings.sh - List available recordings
#
# Usage: ./list-recordings.sh [--json]

RECORDINGS_DIR="/Users/brokkrbot/brokkr-agent/recordings"
JSON_OUTPUT=""

if [ "$1" == "--json" ]; then
    JSON_OUTPUT="1"
fi

if [ ! -d "$RECORDINGS_DIR" ]; then
    if [ -n "$JSON_OUTPUT" ]; then
        echo "[]"
    else
        echo "No recordings directory"
    fi
    exit 0
fi

FILES=$(ls -1t "$RECORDINGS_DIR"/*.mov 2>/dev/null || true)

if [ -z "$FILES" ]; then
    if [ -n "$JSON_OUTPUT" ]; then
        echo "[]"
    else
        echo "No recordings found"
    fi
    exit 0
fi

if [ -n "$JSON_OUTPUT" ]; then
    echo "["
    FIRST=1
    for f in $FILES; do
        if [ $FIRST -eq 0 ]; then echo ","; fi
        FIRST=0
        FILENAME=$(basename "$f")
        SIZE=$(ls -lh "$f" | awk '{print $5}')
        MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f")
        echo "  {\"file\": \"$FILENAME\", \"path\": \"$f\", \"size\": \"$SIZE\", \"modified\": \"$MODIFIED\"}"
    done
    echo "]"
else
    echo "Available recordings:"
    echo ""
    for f in $FILES; do
        FILENAME=$(basename "$f")
        SIZE=$(ls -lh "$f" | awk '{print $5}')
        MODIFIED=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$f")
        echo "  $FILENAME  ($SIZE, $MODIFIED)"
    done
fi
```

**Step 2: Make executable**

```bash
chmod +x skills/screen-capture/list-recordings.sh
```

**Step 3: Commit**

```bash
git add skills/screen-capture/list-recordings.sh
git commit -m "feat(screen-capture): add recordings list script"
```

---

### Task 1.6: Register Screen Capture Commands

**Files:**
- Modify: `lib/builtin-commands.js`
- Test: `node dry-run-test.js "/record"`

**Step 1: Read current builtin-commands.js**

First examine the current structure of `lib/builtin-commands.js` to understand the command registration pattern.

**Step 2: Add screen capture commands**

Add to the exports in `lib/builtin-commands.js`:

```javascript
// Screen Capture Commands
CommandFactory.skill({
  name: 'record',
  description: 'Start/stop screen recording',
  aliases: [],
  skill: 'screen-capture',
  arguments: {
    required: [],
    optional: ['action', 'options'],
    hint: '[stop|window|region] [--duration <seconds>]'
  },
  examples: [
    '/record - Start full-screen recording',
    '/record stop - Stop current recording',
    '/record window - Record specific window',
    '/record --duration 30 - Record for 30 seconds'
  ]
}),

CommandFactory.internal({
  name: 'recordings',
  description: 'List available screen recordings',
  function: 'handleListRecordings'
})
```

**Step 3: Test command parsing**

```bash
node dry-run-test.js "/record"
node dry-run-test.js "/record stop"
node dry-run-test.js "/recordings"
```

Expected: Commands parsed correctly

**Step 4: Commit**

```bash
git add lib/builtin-commands.js
git commit -m "feat(screen-capture): register recording commands"
```

---

## Phase 2: Remotion Video Project

### Task 2.1: Initialize Remotion Project

**Files:**
- Create: `remotion-videos/` directory with Remotion scaffolding

**Step 1: Create Remotion project**

```bash
cd /Users/brokkrbot/brokkr-agent
npx create-video@latest remotion-videos --blank
```

When prompted:
- Project name: `remotion-videos`
- Template: blank

**Step 2: Verify installation**

```bash
cd remotion-videos
npm install
npx remotion preview
```

Expected: Remotion Studio opens in browser

**Step 3: Commit (from brokkr-agent root)**

```bash
cd /Users/brokkrbot/brokkr-agent
git add remotion-videos/
git commit -m "feat(remotion): initialize blank Remotion project"
```

---

### Task 2.2: Create Tutorial Video Composition Template

**Files:**
- Create: `remotion-videos/src/compositions/TutorialVideo.tsx`
- Modify: `remotion-videos/src/Root.tsx`

**Step 1: Create TutorialVideo composition**

```typescript
// remotion-videos/src/compositions/TutorialVideo.tsx
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

export type TutorialVideoProps = {
  screenRecordingPath: string;
  title: string;
  subtitle?: string;
  introDuration?: number;
  outroDuration?: number;
};

const INTRO_DURATION = 90; // 3 seconds at 30fps
const OUTRO_DURATION = 120; // 4 seconds at 30fps

export const TutorialVideo: React.FC<TutorialVideoProps> = ({
  screenRecordingPath,
  title,
  subtitle = '',
  introDuration = INTRO_DURATION,
  outroDuration = OUTRO_DURATION,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
      {/* Intro Sequence */}
      <Sequence from={0} durationInFrames={introDuration}>
        <Intro title={title} subtitle={subtitle} />
      </Sequence>

      {/* Main Screen Recording */}
      <Sequence from={introDuration}>
        <AbsoluteFill>
          <OffthreadVideo
            src={screenRecordingPath}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

// Intro Component
const Intro: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [50, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic)
  });

  const subtitleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            color: '#e94560',
            fontSize: 72,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 700,
            margin: 0,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              color: '#ffffff',
              fontSize: 32,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 400,
              marginTop: 20,
              opacity: subtitleOpacity,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

export default TutorialVideo;
```

**Step 2: Register composition in Root.tsx**

```typescript
// remotion-videos/src/Root.tsx
import { Composition, getInputProps } from 'remotion';
import { TutorialVideo, TutorialVideoProps } from './compositions/TutorialVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TutorialVideo"
        component={TutorialVideo}
        durationInFrames={900} // 30 seconds default, will be overridden
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          screenRecordingPath: '',
          title: 'Tutorial',
          subtitle: '',
          introDuration: 90,
          outroDuration: 120,
        }}
      />
    </>
  );
};
```

**Step 3: Test in Remotion Studio**

```bash
cd remotion-videos
npx remotion preview
```

**Step 4: Commit**

```bash
cd /Users/brokkrbot/brokkr-agent
git add remotion-videos/src/
git commit -m "feat(remotion): add TutorialVideo composition with intro"
```

---

### Task 2.3: Create Callout/Annotation Component

**Files:**
- Create: `remotion-videos/src/components/Callout.tsx`

**Step 1: Create Callout component**

```typescript
// remotion-videos/src/components/Callout.tsx
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

export type CalloutProps = {
  text: string;
  x: number; // percentage from left
  y: number; // percentage from top
  startFrame: number;
  durationInFrames: number;
  style?: 'arrow' | 'box' | 'highlight';
  color?: string;
};

export const Callout: React.FC<CalloutProps> = ({
  text,
  x,
  y,
  startFrame,
  durationInFrames,
  style = 'box',
  color = '#e94560',
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - startFrame;

  if (relativeFrame < 0 || relativeFrame > durationInFrames) {
    return null;
  }

  const fadeIn = interpolate(relativeFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    relativeFrame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  const scale = interpolate(relativeFrame, [0, 10], [0.8, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.5)),
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        zIndex: 100,
      }}
    >
      {style === 'box' && (
        <div
          style={{
            backgroundColor: color,
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 8,
            fontSize: 24,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      )}
      {style === 'highlight' && (
        <div
          style={{
            border: `3px solid ${color}`,
            borderRadius: 8,
            padding: '8px 16px',
            backgroundColor: `${color}22`,
          }}
        >
          <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 600 }}>{text}</span>
        </div>
      )}
    </div>
  );
};
```

**Step 2: Commit**

```bash
git add remotion-videos/src/components/
git commit -m "feat(remotion): add Callout annotation component"
```

---

### Task 2.4: Create Outro Component

**Files:**
- Create: `remotion-videos/src/components/Outro.tsx`
- Modify: `remotion-videos/src/compositions/TutorialVideo.tsx`

**Step 1: Create Outro component**

```typescript
// remotion-videos/src/components/Outro.tsx
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

export type OutroProps = {
  message?: string;
  ctaText?: string;
  ctaUrl?: string;
};

export const Outro: React.FC<OutroProps> = ({
  message = 'Thanks for watching!',
  ctaText = 'Try brokkr.co',
  ctaUrl = 'brokkr.co',
}) => {
  const frame = useCurrentFrame();

  const messageOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const ctaOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' });
  const ctaScale = interpolate(frame, [20, 40], [0.9, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.2)),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0f3460 0%, #16213e 50%, #1a1a2e 100%)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            color: '#ffffff',
            fontSize: 48,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontWeight: 600,
            margin: 0,
            opacity: messageOpacity,
          }}
        >
          {message}
        </p>
        <div
          style={{
            marginTop: 40,
            opacity: ctaOpacity,
            transform: `scale(${ctaScale})`,
          }}
        >
          <div
            style={{
              backgroundColor: '#e94560',
              color: '#ffffff',
              padding: '16px 40px',
              borderRadius: 12,
              fontSize: 32,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontWeight: 700,
              display: 'inline-block',
            }}
          >
            {ctaText}
          </div>
          <p
            style={{
              color: '#888888',
              fontSize: 24,
              marginTop: 16,
            }}
          >
            {ctaUrl}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

**Step 2: Update TutorialVideo to include Outro**

Add to TutorialVideo.tsx after the screen recording sequence:

```typescript
// Add import
import { Outro } from '../components/Outro';

// Add Outro sequence in TutorialVideo component (before closing AbsoluteFill)
{/* Outro Sequence - starts after screen recording */}
<Sequence from={introDuration + screenRecordingDuration} durationInFrames={outroDuration}>
  <Outro
    message="Thanks for watching!"
    ctaText="Try brokkr.co"
    ctaUrl="brokkr.co"
  />
</Sequence>
```

**Step 3: Commit**

```bash
git add remotion-videos/src/components/Outro.tsx remotion-videos/src/compositions/TutorialVideo.tsx
git commit -m "feat(remotion): add Outro component with CTA"
```

---

### Task 2.5: Create Video Creation Skill Structure (Standardized)

**Files:**
- Create: `skills/video-creation/SKILL.md` (with frontmatter)
- Create: `skills/video-creation/config.json`
- Create: `skills/video-creation/lib/` directory
- Create: `skills/video-creation/reference/` directory
- Create: `skills/video-creation/scripts/` directory
- Create: `skills/video-creation/tests/` directory
- Create: `.claude/commands/video.md`
- Create: `.claude/agents/content-analyzer.md`

**Step 1: Create skill directory structure**

```bash
mkdir -p skills/video-creation/lib
mkdir -p skills/video-creation/reference
mkdir -p skills/video-creation/scripts
mkdir -p skills/video-creation/tests
mkdir -p .claude/commands
mkdir -p .claude/agents
```

**Step 2: Create SKILL.md with frontmatter**

```yaml
---
name: video-creation
description: Create polished tutorial videos from recordings using Remotion. Use for producing brokkr.co content.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Video Creation Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Add intro/outro sequences with branding
- Apply callout annotations at specific timestamps
- Render high-quality video with Remotion
- Share via iCloud Family Sharing

## Usage

### Via Command (Manual)
```
/video create "Tutorial Title"    # Full workflow
/video render recording.mov       # Render with Remotion
/video preview                    # Open Remotion Studio
/video share video.mp4            # Share via iCloud
/video list                       # List available videos
```

## Configuration

Edit `skills/video-creation/config.json`:

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

- **TutorialVideo** - Standard tutorial with intro/outro
- **QuickDemo** - Shorter format, minimal intro

## Memory Notes (8GB RAM)

- Default Remotion cache: ~4GB (50% of system RAM)
- Optimal concurrency: 2 (benchmark to confirm)
- Pre-render cleanup: Kill Chrome, Safari before rendering
- Resolution strategy: 1080p for most, 720p for videos >10 minutes

## Reference Documentation

See `reference/` directory for detailed docs:
- `remotion-patterns.md` - Remotion best practices
```

**Step 3: Create config.json**

```json
{
  "exports_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports",
  "icloud_shared_dir": "~/Library/Mobile Documents/com~apple~CloudDocs/Family/Brokkr-Videos",
  "remotion_concurrency": 2,
  "default_resolution": "1080p",
  "default_fps": 30,
  "intro_duration_frames": 90,
  "outro_duration_frames": 120,
  "crf_quality": {
    "high": 18,
    "medium": 23,
    "low": 28
  }
}
```

**Step 4: Create command file**

Create `.claude/commands/video.md`:

```yaml
---
name: video
description: Create and manage tutorial videos using Remotion
argument-hint: <create|render|preview|share|list> [recording] [--title "Title"]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the video-creation skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

**Step 5: Create content-analyzer subagent**

Create `.claude/agents/content-analyzer.md`:

```yaml
---
name: content-analyzer
description: Analyze video content to generate chapter markers and descriptions
tools: Read, Grep
model: haiku
permissionMode: dontAsk
---

You are a content analyzer for tutorial videos. Analyze the video/recording and:

1. Identify key sections and transitions
2. Generate chapter markers with timestamps
3. Create brief descriptions for each section
4. Suggest callout placements

Video data: $ARGUMENTS

Output JSON:
{
  "chapters": [
    {"timestamp": "0:00", "title": "Introduction", "description": "..."},
    {"timestamp": "0:30", "title": "Setup", "description": "..."}
  ],
  "callouts": [
    {"timestamp": "0:15", "text": "Click here", "x": 50, "y": 30}
  ]
}
```

**Step 6: Create reference documentation**

Create `skills/video-creation/reference/remotion-patterns.md`:

```markdown
# Remotion Patterns Reference

## Official Documentation Sources

- [Remotion Official Documentation](https://www.remotion.dev/docs/)
- [Remotion CLI Render](https://www.remotion.dev/docs/cli/render)
- [Remotion Performance Guide](https://www.remotion.dev/docs/performance)
- [Remotion Transitions](https://www.remotion.dev/docs/transitions/transitionseries)

## Memory Optimization for 8GB RAM

- Default Remotion cache: ~4GB (50% of system RAM)
- Optimal concurrency: 2 (use `npx remotion benchmark` to confirm)
- Pre-render cleanup: Kill Chrome, Safari before rendering
- Resolution strategy: 1080p for most, 720p for videos >10 minutes

## Quality Presets

| Preset | CRF Value | Use Case |
|--------|-----------|----------|
| high | 18 | Final production |
| medium | 23 | Preview/draft |
| low | 28 | Quick test |

## Progress Indicators

Use `--log=verbose` for detailed rendering progress.
```

**Step 7: Commit**

```bash
git add skills/video-creation/ .claude/commands/video.md .claude/agents/content-analyzer.md
git commit -m "feat(video-creation): create standardized skill structure"
```

**Step 2: Create render.js**

```javascript
// skills/video-creation/render.js
// Render a tutorial video from screen recording
//
// Usage: node render.js <recording-path> <title> [subtitle]

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

const REMOTION_DIR = join(process.cwd(), 'remotion-videos');
const OUTPUT_DIR = join(process.cwd(), 'videos');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node render.js <recording-path> <title> [subtitle]');
    process.exit(1);
  }

  const [recordingPath, title, subtitle = ''] = args;

  // Validate recording exists
  if (!existsSync(recordingPath)) {
    console.error(`Recording not found: ${recordingPath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Get video duration using ffprobe (if available) or estimate
  let videoDuration = 30; // default 30 seconds
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${recordingPath}"`,
      { encoding: 'utf-8' }
    );
    videoDuration = Math.ceil(parseFloat(result));
  } catch (e) {
    console.log('ffprobe not available, using estimated duration');
    // Estimate from file size (rough: 1MB ≈ 1 second for screen recording)
    const { statSync } = await import('fs');
    const stats = statSync(recordingPath);
    videoDuration = Math.max(10, Math.ceil(stats.size / (1024 * 1024)));
  }

  console.log(`Recording duration: ~${videoDuration} seconds`);

  const fps = 30;
  const introDuration = 90; // 3 seconds
  const outroDuration = 120; // 4 seconds
  const totalFrames = (videoDuration * fps) + introDuration + outroDuration;

  console.log('Bundling Remotion project...');
  const bundleLocation = await bundle({
    entryPoint: join(REMOTION_DIR, 'src/index.ts'),
    webpackOverride: (config) => config,
  });

  console.log('Selecting composition...');
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'TutorialVideo',
    inputProps: {
      screenRecordingPath: recordingPath,
      title,
      subtitle,
      introDuration,
      outroDuration,
    },
  });

  // Override duration based on actual recording
  composition.durationInFrames = totalFrames;

  const outputFileName = `tutorial-${basename(recordingPath, '.mov')}.mp4`;
  const outputPath = join(OUTPUT_DIR, outputFileName);

  console.log(`Rendering video to: ${outputPath}`);
  console.log(`Total frames: ${totalFrames} (~${Math.ceil(totalFrames / fps)} seconds)`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps: {
      screenRecordingPath: recordingPath,
      title,
      subtitle,
      introDuration,
      outroDuration,
    },
    // Memory optimization for 8GB RAM
    concurrency: 2,
  });

  console.log(`\nVideo rendered successfully: ${outputPath}`);
  return outputPath;
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
```

**Step 3: Commit**

```bash
git add skills/video-creation/
git commit -m "feat(video-creation): add Remotion rendering skill"
```

---

### Task 2.6: Create Video Preview Script

**Files:**
- Create: `skills/video-creation/preview.sh`

**Step 1: Create the script**

```bash
#!/bin/bash
# preview.sh - Open Remotion Studio for video preview
#
# Usage: ./preview.sh

set -e

REMOTION_DIR="/Users/brokkrbot/brokkr-agent/remotion-videos"

cd "$REMOTION_DIR"

echo "Opening Remotion Studio..."
echo "Press Ctrl+C to close"
echo ""

npx remotion preview
```

**Step 2: Make executable**

```bash
chmod +x skills/video-creation/preview.sh
```

**Step 3: Commit**

```bash
git add skills/video-creation/preview.sh
git commit -m "feat(video-creation): add Remotion preview script"
```

---

## Phase 3: iCloud Sharing Integration

### iCloud Storage Paths (Standardized)

Following the architecture patterns, all files use `lib/icloud-storage.js`:

```javascript
// Recordings stored in iCloud
const recordingPath = getPath('recordings', `recording-${timestamp}.mov`);
// → ~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Recordings/YYYY-MM-DD/

// Rendered videos stored in iCloud Exports
const exportPath = getPath('exports', `tutorial-${title}.mp4`);
// → ~/Library/Mobile Documents/com~apple~CloudDocs/Brokkr/Exports/YYYY-MM-DD/
```

### Task 3.1: Create Video Sharing Script

**Files:**
- Create: `skills/video-creation/scripts/share.sh`

**Step 1: Create the script**

```bash
#!/bin/bash
# share.sh - Share video to iCloud Family Sharing folder
#
# Usage: ./share.sh <video-path>

set -e

VIDEO_PATH="$1"
ICLOUD_SHARED="/Users/brokkrbot/Library/Mobile Documents/com~apple~CloudDocs/Family/Brokkr-Videos"

if [ -z "$VIDEO_PATH" ]; then
    echo "Usage: ./share.sh <video-path>"
    exit 1
fi

if [ ! -f "$VIDEO_PATH" ]; then
    echo "Video not found: $VIDEO_PATH"
    exit 1
fi

# Ensure shared folder exists
mkdir -p "$ICLOUD_SHARED"

# Copy video to iCloud
FILENAME=$(basename "$VIDEO_PATH")
DEST_PATH="$ICLOUD_SHARED/$FILENAME"

echo "Copying video to iCloud Family Sharing..."
cp "$VIDEO_PATH" "$DEST_PATH"

# Check sync status (brctl is macOS iCloud control)
echo "Checking iCloud sync status..."
sleep 2

# Use brctl to check if file is uploaded
if command -v brctl &> /dev/null; then
    STATUS=$(brctl status "$DEST_PATH" 2>/dev/null || echo "unknown")
    echo "Sync status: $STATUS"
fi

echo ""
echo "Video shared to: $DEST_PATH"
echo "Note: iCloud sync may take a few minutes for Tommy to see the file"
```

**Step 2: Make executable**

```bash
chmod +x skills/video-creation/share.sh
```

**Step 3: Commit**

```bash
git add skills/video-creation/share.sh
git commit -m "feat(video-creation): add iCloud sharing script"
```

---

### Task 3.2: Register Video Commands (Standardized)

**Files:**
- Verify: `.claude/commands/video.md` (created in Task 2.5)
- Verify: `.claude/commands/record.md` (created in Task 1.1)

**Step 1: Verify command files exist**

The command files were created in earlier tasks. Verify they exist:

```bash
cat .claude/commands/video.md
cat .claude/commands/record.md
```

**Step 2: Test command parsing**

```bash
node dry-run-test.js "/record"
node dry-run-test.js "/record stop"
node dry-run-test.js "/video create \"How to use brokkr\""
node dry-run-test.js "/video render recording.mov"
```

Expected: Commands parsed correctly with skill handler

**Step 3: Create recordings command**

Create `.claude/commands/recordings.md`:

```yaml
---
name: recordings
description: List available screen recordings
argument-hint: [--json]
allowed-tools: Read, Write, Edit, Bash, Task
---

List all available screen recordings from iCloud storage.

Format: $ARGUMENTS
```

**Step 4: Commit**

```bash
git add .claude/commands/
git commit -m "feat(video-creation): register video and recording commands"
```

---

## Phase 4: Integration and Testing

### Task 4.1: Create End-to-End Workflow Script

**Files:**
- Create: `skills/video-creation/create-tutorial.sh`

**Step 1: Create the workflow script**

```bash
#!/bin/bash
# create-tutorial.sh - Full tutorial video creation workflow
#
# Usage: ./create-tutorial.sh "<title>" [recording-path]
#
# If no recording provided, will use most recent recording

set -e

TITLE="$1"
RECORDING="$2"

RECORDINGS_DIR="/Users/brokkrbot/brokkr-agent/recordings"
VIDEOS_DIR="/Users/brokkrbot/brokkr-agent/videos"
SKILL_DIR="/Users/brokkrbot/brokkr-agent/skills/video-creation"

if [ -z "$TITLE" ]; then
    echo "Usage: ./create-tutorial.sh \"<title>\" [recording-path]"
    exit 1
fi

# If no recording specified, use most recent
if [ -z "$RECORDING" ]; then
    RECORDING=$(ls -1t "$RECORDINGS_DIR"/*.mov 2>/dev/null | head -1)
    if [ -z "$RECORDING" ]; then
        echo "No recordings found. Use /record first."
        exit 1
    fi
    echo "Using most recent recording: $RECORDING"
fi

# Verify recording exists
if [ ! -f "$RECORDING" ]; then
    echo "Recording not found: $RECORDING"
    exit 1
fi

echo "========================================"
echo "Creating Tutorial Video"
echo "========================================"
echo "Title: $TITLE"
echo "Recording: $RECORDING"
echo ""

# Step 1: Render video
echo "Step 1/2: Rendering video with Remotion..."
cd /Users/brokkrbot/brokkr-agent/remotion-videos
OUTPUT=$(node "$SKILL_DIR/render.js" "$RECORDING" "$TITLE")
VIDEO_PATH=$(echo "$OUTPUT" | tail -1 | sed 's/Video rendered successfully: //')

if [ ! -f "$VIDEO_PATH" ]; then
    echo "Error: Rendered video not found"
    exit 1
fi

echo ""
echo "Step 2/2: Sharing to iCloud..."
"$SKILL_DIR/share.sh" "$VIDEO_PATH"

echo ""
echo "========================================"
echo "Tutorial Video Complete!"
echo "========================================"
echo "Local: $VIDEO_PATH"
echo "iCloud: ~/Library/Mobile Documents/com~apple~CloudDocs/Family/Brokkr-Videos/"
```

**Step 2: Make executable**

```bash
chmod +x skills/video-creation/create-tutorial.sh
```

**Step 3: Commit**

```bash
git add skills/video-creation/create-tutorial.sh
git commit -m "feat(video-creation): add end-to-end workflow script"
```

---

### Task 4.2: Update CLAUDE.md with New Capabilities

**Files:**
- Modify: `/Users/brokkrbot/brokkr-agent/CLAUDE.md`

**Step 1: Add screen recording and video creation sections**

Add to the Capabilities section in CLAUDE.md:

```markdown
### Screen Recording & Video Creation

Brokkr can create professional tutorial videos for brokkr.co:

**Screen Recording:**
- `/record` - Start full-screen recording
- `/record stop` - Stop current recording
- `/record window` - Record specific window
- `/recordings` - List available recordings

**Video Creation (Remotion):**
- `/video create <title>` - Full workflow: render + share
- `/video render <recording>` - Process recording with Remotion
- `/video preview` - Open Remotion Studio
- `/video share <video>` - Share via iCloud Family Sharing

**Workflow:**
1. Use `/record` to capture screen activity
2. Use `/video create "Title"` to add intro/outro and render
3. Video automatically shared via iCloud Family Sharing

**Memory Notes:**
- Remotion rendering is memory-intensive on 8GB RAM
- Close Chrome before rendering if needed
- Videos render serially (one at a time)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add screen recording and video creation capabilities"
```

---

### Task 4.3: Create Test Recording and Video

**Manual Testing Steps:**

```bash
# 1. Create a short test recording
cd /Users/brokkrbot/brokkr-agent
./skills/screen-capture/record.sh --duration 5

# 2. Verify recording was created
./skills/screen-capture/list-recordings.sh

# 3. Render test video (close Chrome first to free RAM)
pkill -f Chrome || true
./skills/video-creation/create-tutorial.sh "Test Video"

# 4. Verify video was created
ls -la videos/

# 5. Verify iCloud sharing
ls -la ~/Library/Mobile\ Documents/com~apple~CloudDocs/Family/Brokkr-Videos/
```

**Expected Results:**
- Recording saved to `recordings/recording-YYYY-MM-DD-HHMMSS.mov`
- Video rendered to `videos/tutorial-recording-YYYY-MM-DD-HHMMSS.mp4`
- Video copied to iCloud Family Sharing folder

---

## Phase 5: Advanced Features (Future)

### Task 5.1: Audio Narration Support

**Future Enhancement:** Add voice narration to videos
- Use macOS `say` command for text-to-speech
- Or integrate with ElevenLabs API for realistic voice
- Overlay narration audio in Remotion

### Task 5.2: Click Highlighting

**Future Enhancement:** Automatically highlight mouse clicks
- Track mouse position during recording
- Add visual indicators (circles, ripples) in Remotion
- Requires additional tracking during recording

### Task 5.3: Automatic Chapter Markers

**Future Enhancement:** AI-powered chapter detection
- Analyze video content with Claude
- Generate chapter markers for longer tutorials
- Export in YouTube-compatible format

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.6 | Screen Capture Skill - recording, stopping, listing |
| 2 | 2.1-2.6 | Remotion Setup - project, templates, rendering |
| 3 | 3.1-3.2 | iCloud Sharing - output delivery |
| 4 | 4.1-4.3 | Integration - workflow, docs, testing |
| 5 | 5.1-5.3 | Future - narration, highlights, chapters |

**Total Tasks:** 17 (Phases 1-4)

**Estimated Time:** 4-6 hours for full implementation

**Key Files:**
- `skills/screen-capture/` - Recording scripts
- `skills/video-creation/` - Rendering and sharing scripts
- `remotion-videos/` - Remotion project with templates
- `recordings/` - Raw screen recordings
- `videos/` - Rendered tutorial videos
