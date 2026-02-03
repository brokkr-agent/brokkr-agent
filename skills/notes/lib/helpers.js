// skills/notes/lib/helpers.js
// HTML utility functions for Notes.app integration
// Notes.app stores content as HTML, these helpers convert to/from plain text and Markdown

/**
 * Strip HTML tags and return plain text
 * @param {string} html - HTML content from Notes.app
 * @returns {string} Plain text with HTML tags removed
 */
export function stripHtml(html) {
  if (!html) return '';

  return html
    // Replace <br>, <br/>, <br /> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    // Replace </p>, </div>, </li> with newlines
    .replace(/<\/(p|div|li)>/gi, '\n')
    // Replace </tr> with newlines
    .replace(/<\/tr>/gi, '\n')
    // Replace </h1> through </h6> with double newlines
    .replace(/<\/h[1-6]>/gi, '\n\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    // Collapse multiple newlines into two
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
}

/**
 * Convert basic HTML to Markdown
 * Handles common formatting from Notes.app
 * @param {string} html - HTML content from Notes.app
 * @returns {string} Markdown formatted text
 */
export function htmlToMarkdown(html) {
  if (!html) return '';

  let md = html;

  // Handle headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Handle bold
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');

  // Handle italic
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');

  // Handle underline (no Markdown equivalent, use emphasis)
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, '_$1_');

  // Handle strikethrough
  md = md.replace(/<(strike|s|del)[^>]*>(.*?)<\/(strike|s|del)>/gi, '~~$2~~');

  // Handle links
  md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Handle unordered lists
  md = md.replace(/<ul[^>]*>/gi, '\n');
  md = md.replace(/<\/ul>/gi, '\n');
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

  // Handle ordered lists (simple conversion to unordered)
  md = md.replace(/<ol[^>]*>/gi, '\n');
  md = md.replace(/<\/ol>/gi, '\n');

  // Handle line breaks and paragraphs
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<p[^>]*>/gi, '');
  md = md.replace(/<\/div>/gi, '\n');
  md = md.replace(/<div[^>]*>/gi, '');

  // Handle code (inline)
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Handle preformatted/code blocks
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n');

  // Handle blockquotes
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
    return content.split('\n').map(line => `> ${line}`).join('\n') + '\n';
  });

  // Handle horizontal rules
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Remove any remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&nbsp;/gi, ' ');
  md = md.replace(/&amp;/gi, '&');
  md = md.replace(/&lt;/gi, '<');
  md = md.replace(/&gt;/gi, '>');
  md = md.replace(/&quot;/gi, '"');
  md = md.replace(/&#39;/gi, "'");
  md = md.replace(/&apos;/gi, "'");

  // Clean up extra whitespace
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}

/**
 * Wrap plain text in basic HTML for Notes.app
 * @param {string} text - Plain text content
 * @returns {string} HTML wrapped text suitable for Notes.app body
 */
export function wrapHtml(text) {
  if (!text) return '<div></div>';

  // Escape HTML special characters
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Convert newlines to <br/> tags
  html = html.replace(/\n/g, '<br/>');

  // Wrap in a div
  return `<div>${html}</div>`;
}

/**
 * Convert Markdown to basic HTML for Notes.app
 * @param {string} markdown - Markdown formatted text
 * @returns {string} HTML suitable for Notes.app body
 */
export function markdownToHtml(markdown) {
  if (!markdown) return '<div></div>';

  let html = markdown;

  // Escape HTML special characters first (but not the ones we'll add)
  html = html.replace(/&/g, '&amp;');

  // Handle headers (must come before escaping < >)
  html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.*)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // Handle horizontal rules
  html = html.replace(/^---$/gm, '<hr/>');

  // Handle bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // Handle italic
  html = html.replace(/\*([^*]+)\*/g, '<i>$1</i>');

  // Handle strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Handle inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Handle links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Handle unordered list items
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');

  // Convert double newlines to paragraph breaks
  html = html.replace(/\n\n/g, '</div><div>');

  // Convert single newlines to <br/>
  html = html.replace(/\n/g, '<br/>');

  // Wrap in div
  return `<div>${html}</div>`;
}

export default {
  stripHtml,
  htmlToMarkdown,
  wrapHtml,
  markdownToHtml
};
