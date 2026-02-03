---
name: notes
description: Manage Apple Notes - create, search, read, append, modify notes via AppleScript
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Notes Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Status: IMPLEMENTED

## Capabilities

- List all folders in Notes.app
- List notes in a specific folder
- List recently modified notes across all folders
- Create notes with HTML formatting
- Find notes by title (partial match) or ID (exact match)
- Read full note content (HTML, plain text, or Markdown)
- Append content to existing notes
- Modify note title and/or body
- Delete notes (moves to Recently Deleted)
- Search notes by content across title and body

## Usage

### Via Command (Manual)

```
/notes list folders
/notes list recent 10
/notes list <folder-name>
/notes create "Title" "Body content"
/notes create "Title" "Body" --folder "Work"
/notes find "search term"
/notes read <note-id>
/notes append <note-id> "New content"
/notes modify <note-id> --title "New Title"
/notes modify <note-id> --body "New Body"
/notes delete <note-id>
/notes search "query"
/notes search "query" --folder "Work" --limit 10
```

### Via Notification (Automatic)

Triggered when Notes.app notifications match these criteria:
- Shared note notifications
- Notes containing `[AGENT]` in title
- Notes mentioning `@Brokkr`

## Scripts

All AppleScript files in `skills/notes/`:

| Script | Purpose |
|--------|---------|
| `list-folders.scpt` | List all folders in Notes.app |
| `list-notes.scpt` | List notes in a specific folder |
| `list-recent.scpt` | List recently modified notes (sorted by date) |
| `create-note.scpt` | Create a new note with title, body, folder |
| `find-note.scpt` | Find notes by title substring or exact ID |
| `read-note.scpt` | Read full note content by ID |
| `append-note.scpt` | Append content to an existing note |
| `modify-note.scpt` | Modify note title and/or body |
| `delete-note.scpt` | Delete note (moves to Recently Deleted) |
| `search-notes.scpt` | Search notes by content with snippets |

### Script Response Format

All scripts return JSON:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

On error:
```json
{
  "success": false,
  "data": null,
  "error": "Error message"
}
```

## Node.js Module

### Location
`skills/notes/lib/notes.js`

### Basic Usage

```javascript
import { notesHandler } from './skills/notes/lib/notes.js';

// List folders
const folders = notesHandler.listFolders();
// { success: true, data: [{name: "Notes", id: "x-coredata://..."}, ...] }

// List notes in folder
const notes = notesHandler.listNotes("Work");
// { success: true, data: [{name, id, creationDate, modificationDate, folder}, ...] }

// List recent notes
const recent = notesHandler.listRecent(5);
// { success: true, data: [...5 most recently modified notes] }

// Create a note
const newNote = notesHandler.createNote("Title", "Body content", "Notes");
// { success: true, data: {id, name, folder, creationDate} }

// Find notes by title
const found = notesHandler.findNote("meeting");
// { success: true, data: [{id, name, folder, ...}, ...] }

// Read note content
const content = notesHandler.readNote("x-coredata://...");
// { success: true, data: {id, name, body, creationDate, modificationDate, folder} }

// Append to note
const appended = notesHandler.appendNote("x-coredata://...", "<p>New content</p>");
// { success: true, data: {id, name, modificationDate} }

// Modify note
const modified = notesHandler.modifyNote("x-coredata://...", "New Title", "<p>New body</p>");
// { success: true, data: {id, name, modificationDate} }

// Delete note
const deleted = notesHandler.deleteNote("x-coredata://...");
// { success: true, data: {deleted: true, id: "..."} }

// Search notes
const results = notesHandler.searchNotes("project ideas", "", 20);
// { success: true, data: [{id, name, folder, snippet, ...}, ...] }
```

### Convenience Methods

```javascript
// Read note as plain text
const plain = notesHandler.readNotePlainText(noteId);
// data includes: { plainText: "..." }

// Read note as Markdown
const md = notesHandler.readNoteMarkdown(noteId);
// data includes: { markdown: "..." }

// Create note from plain text (auto-wraps HTML)
const fromPlain = notesHandler.createNotePlainText("Title", "Plain text body");

// Create note from Markdown (converts to HTML)
const fromMd = notesHandler.createNoteMarkdown("Title", "# Markdown\n- list item");

// Append plain text (auto-wraps HTML)
notesHandler.appendNotePlainText(noteId, "Plain text to append");

// Get note by title (first match)
const byTitle = notesHandler.getNoteByTitle("Meeting Notes");
// Returns full note content if found, or { data: null }

// Quick note with minimal body
const quick = notesHandler.quickNote("Quick Thought", "Ideas");
```

### HTML Helpers

The module exposes HTML conversion utilities:

```javascript
const { stripHtml, htmlToMarkdown, wrapHtml, markdownToHtml } = notesHandler;

// Strip HTML tags
const plain = stripHtml('<p>Hello <b>world</b></p>'); // "Hello world"

// Convert HTML to Markdown
const md = htmlToMarkdown('<h1>Title</h1><ul><li>Item</li></ul>');

// Wrap plain text in HTML
const html = wrapHtml('Plain text'); // '<div>Plain text</div>'

// Convert Markdown to HTML
const html = markdownToHtml('# Title\n- Item');
```

## Note IDs

Notes are identified by their Core Data URI:
```
x-coredata://12345678-1234-1234-1234-123456789ABC/ICNote/p123
```

**Best Practices:**
- Always store the full ID when referencing notes
- Use `findNote()` to get IDs from titles
- Pass IDs directly to read/append/modify/delete operations

## HTML Content

Notes.app stores content as HTML. The skill handles this transparently:

- **Reading:** Get raw HTML, plain text, or Markdown
- **Writing:** Pass plain text (auto-wrapped) or HTML directly
- **Appending:** Content is added as new paragraph(s)

## Folder Operations

The default folder is "Notes". To work with other folders:

```javascript
// List all folders first
const folders = notesHandler.listFolders();

// Create note in specific folder
notesHandler.createNote("Title", "Body", "Work");

// List notes in specific folder
notesHandler.listNotes("Personal");

// Search within specific folder
notesHandler.searchNotes("query", "Projects", 10);
```

## Error Handling

Always check the `success` field:

```javascript
const result = notesHandler.createNote("Title", "Body");
if (!result.success) {
  console.error(`Failed: ${result.error}`);
} else {
  console.log(`Created note: ${result.data.id}`);
}
```

Common errors:
- "Note not found" - Invalid note ID
- "Folder not found" - Folder doesn't exist
- "Notes is not running" - Notes.app needs to be opened

## Permissions

Notes skill requires:
- Automation permission for Notes.app (granted on first use)
- No database direct access (uses AppleScript only)
