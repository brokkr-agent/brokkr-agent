// skills/notes/lib/notes.js
// NotesHandler module for Apple Notes integration via AppleScript
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stripHtml, htmlToMarkdown, wrapHtml, markdownToHtml } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs an AppleScript and returns parsed JSON output
 * @param {string} scriptName - Name of the .scpt file in the notes skill directory
 * @param {Array} args - Arguments to pass to the script
 * @returns {Object} Parsed JSON result with { success, data, error }
 */
function runScript(scriptName, args = []) {
  const scriptPath = join(__dirname, '..', scriptName);
  const escapedArgs = args.map(a => `"${String(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(' ');
  const cmd = `osascript "${scriptPath}" ${escapedArgs}`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024 // 10MB for large note content
    });

    return JSON.parse(output.trim());
  } catch (err) {
    // Try to parse error output as JSON
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout.trim());
      } catch {
        // Fall through to error return
      }
    }
    return { success: false, data: null, error: err.message };
  }
}

/**
 * NotesHandler class for managing Apple Notes operations
 */
export class NotesHandler {
  constructor() {
    // Expose HTML helpers for convenience
    this.stripHtml = stripHtml;
    this.htmlToMarkdown = htmlToMarkdown;
    this.wrapHtml = wrapHtml;
    this.markdownToHtml = markdownToHtml;
  }

  /**
   * List all folders in Notes.app
   * @returns {Object} { success, data: [{name, id}...], error }
   */
  listFolders() {
    return runScript('list-folders.scpt');
  }

  /**
   * List all notes in a specific folder
   * @param {string} folderName - Folder name (default: "Notes")
   * @returns {Object} { success, data: [{name, id, creationDate, modificationDate, folder}...], error }
   */
  listNotes(folderName = 'Notes') {
    return runScript('list-notes.scpt', [folderName]);
  }

  /**
   * List recently modified notes across all folders
   * @param {number} limit - Maximum number of notes to return (default: 10)
   * @returns {Object} { success, data: [{name, id, creationDate, modificationDate, folder}...], error }
   */
  listRecent(limit = 10) {
    return runScript('list-recent.scpt', [String(limit)]);
  }

  /**
   * Create a new note
   * @param {string} title - Note title
   * @param {string} body - Note body (can be plain text or HTML)
   * @param {string} folderName - Target folder (default: "Notes")
   * @returns {Object} { success, data: {id, name, folder, creationDate}, error }
   */
  createNote(title, body, folderName = 'Notes') {
    return runScript('create-note.scpt', [title, body, folderName]);
  }

  /**
   * Find notes by title (partial match) or ID (exact match)
   * @param {string} searchTerm - Title substring or exact note ID
   * @returns {Object} { success, data: [{id, name, folder, creationDate, modificationDate}...], error }
   */
  findNote(searchTerm) {
    return runScript('find-note.scpt', [searchTerm]);
  }

  /**
   * Read a note's full content by ID
   * @param {string} noteId - Note ID (x-coredata://...)
   * @returns {Object} { success, data: {id, name, body, creationDate, modificationDate, folder}, error }
   */
  readNote(noteId) {
    return runScript('read-note.scpt', [noteId]);
  }

  /**
   * Append content to an existing note
   * @param {string} noteId - Note ID (x-coredata://...)
   * @param {string} content - Content to append (plain text or HTML)
   * @returns {Object} { success, data: {id, name, modificationDate}, error }
   */
  appendNote(noteId, content) {
    return runScript('append-note.scpt', [noteId, content]);
  }

  /**
   * Modify an existing note's title and/or body
   * @param {string} noteId - Note ID (x-coredata://...)
   * @param {string} newTitle - New title (empty string to keep current)
   * @param {string} newBody - New body (empty string to keep current)
   * @returns {Object} { success, data: {id, name, modificationDate}, error }
   */
  modifyNote(noteId, newTitle = '', newBody = '') {
    return runScript('modify-note.scpt', [noteId, newTitle, newBody]);
  }

  /**
   * Delete a note (moves to Recently Deleted)
   * @param {string} noteId - Note ID (x-coredata://...)
   * @returns {Object} { success, data: {deleted, id}, error }
   */
  deleteNote(noteId) {
    return runScript('delete-note.scpt', [noteId]);
  }

  /**
   * Search notes by content (searches across title and body)
   * Note: This method requires search-notes.scpt to be implemented
   * @param {string} query - Search query
   * @param {string} folderName - Folder to search in (default: all folders)
   * @param {number} maxResults - Maximum results to return (default: 20)
   * @returns {Object} { success, data: [{id, name, folder, creationDate, modificationDate, snippet}...], error }
   */
  searchNotes(query, folderName = '', maxResults = 20) {
    return runScript('search-notes.scpt', [query, folderName, String(maxResults)]);
  }

  // Convenience methods

  /**
   * Read a note and return plain text content
   * @param {string} noteId - Note ID
   * @returns {Object} { success, data: {id, name, plainText, ...}, error }
   */
  readNotePlainText(noteId) {
    const result = this.readNote(noteId);
    if (result.success && result.data && result.data.body) {
      result.data.plainText = stripHtml(result.data.body);
    }
    return result;
  }

  /**
   * Read a note and return Markdown content
   * @param {string} noteId - Note ID
   * @returns {Object} { success, data: {id, name, markdown, ...}, error }
   */
  readNoteMarkdown(noteId) {
    const result = this.readNote(noteId);
    if (result.success && result.data && result.data.body) {
      result.data.markdown = htmlToMarkdown(result.data.body);
    }
    return result;
  }

  /**
   * Create a note from plain text (auto-wraps in HTML)
   * @param {string} title - Note title
   * @param {string} plainText - Plain text content
   * @param {string} folderName - Target folder (default: "Notes")
   * @returns {Object} { success, data: {id, name, folder, creationDate}, error }
   */
  createNotePlainText(title, plainText, folderName = 'Notes') {
    const htmlBody = wrapHtml(plainText);
    return this.createNote(title, htmlBody, folderName);
  }

  /**
   * Create a note from Markdown (converts to HTML)
   * @param {string} title - Note title
   * @param {string} markdown - Markdown content
   * @param {string} folderName - Target folder (default: "Notes")
   * @returns {Object} { success, data: {id, name, folder, creationDate}, error }
   */
  createNoteMarkdown(title, markdown, folderName = 'Notes') {
    const htmlBody = markdownToHtml(markdown);
    return this.createNote(title, htmlBody, folderName);
  }

  /**
   * Append plain text to a note (auto-wraps in HTML)
   * @param {string} noteId - Note ID
   * @param {string} plainText - Plain text to append
   * @returns {Object} { success, data: {id, name, modificationDate}, error }
   */
  appendNotePlainText(noteId, plainText) {
    const htmlContent = wrapHtml(plainText);
    return this.appendNote(noteId, htmlContent);
  }

  /**
   * Get a note by title (first match)
   * @param {string} title - Note title to search for
   * @returns {Object} { success, data: {id, name, body, ...} | null, error }
   */
  getNoteByTitle(title) {
    const findResult = this.findNote(title);
    if (!findResult.success || !findResult.data || findResult.data.length === 0) {
      return { success: true, data: null, error: null };
    }

    // Return first exact match, or first partial match
    const exactMatch = findResult.data.find(n => n.name === title);
    const noteInfo = exactMatch || findResult.data[0];

    return this.readNote(noteInfo.id);
  }

  /**
   * Quick create note with just title (minimal body)
   * @param {string} title - Note title
   * @param {string} folderName - Target folder (default: "Notes")
   * @returns {Object} { success, data: {id, name, folder, creationDate}, error }
   */
  quickNote(title, folderName = 'Notes') {
    return this.createNote(title, '<div></div>', folderName);
  }
}

// Export singleton instance
export const notesHandler = new NotesHandler();
export default NotesHandler;
