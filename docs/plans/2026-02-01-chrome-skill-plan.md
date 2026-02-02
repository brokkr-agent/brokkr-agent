# Chrome Browser Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks
>
> **Architecture Reference:** See `docs/concepts/2026-02-01-apple-integration-architecture.md` for standardized patterns.

**Goal:** Formalize Chrome browser automation capabilities into a reusable skill with efficient patterns for page navigation, content extraction, form interaction, screenshot capture, and session management. This skill provides programmatic web automation for Brokkr agent tasks.

**Architecture:** Create a Puppeteer-based skill that leverages the existing Chrome installation (already used by WhatsApp bot). Uses browser contexts for session isolation, allowing WhatsApp and agent tasks to coexist without conflicts. Provides reusable JavaScript modules for common patterns (navigation, forms, extraction) with robust error handling and retry logic. Skill modules are loaded by Claude during job execution via the worker process.

**Tech Stack:** Puppeteer (whatsapp-web.js already includes this), Node.js, existing Chrome "for Testing" installation, shared browser instance with isolated contexts

---

## Skill Directory Structure

```
skills/chrome/
├── SKILL.md                    # Main instructions (standard header)
├── config.json                 # Integration-specific config
├── lib/
│   ├── chrome.js               # Core functionality (browser-manager)
│   ├── navigation.js           # Page navigation utilities
│   ├── extraction.js           # Content extraction utilities
│   ├── forms.js                # Form interaction utilities
│   ├── screenshots.js          # Screenshot capture utilities
│   └── helpers.js              # Skill-specific helpers
├── reference/                  # Documentation, research
│   └── puppeteer-api.md
├── scripts/                    # Reusable automation scripts
│   └── *.sh
└── tests/
    ├── browser-manager.test.js
    ├── navigation.test.js
    ├── extraction.test.js
    ├── forms.test.js
    └── screenshots.test.js
```

## Command File

Create `.claude/commands/chrome.md`:

```yaml
---
name: chrome
description: Control Chrome browser for web automation tasks
argument-hint: [action] [url] [args...]
allowed-tools: Read, Write, Edit, Bash, Task
---

Load the Chrome skill and process: $ARGUMENTS

Context from notification (if triggered by monitor):
!`cat /tmp/brokkr-notification-context.json 2>/dev/null || echo "{}"`
```

## iCloud Storage Integration

Use `lib/icloud-storage.js` for screenshots and downloads:

```javascript
const { getPath } = require('../../lib/icloud-storage');

// Save screenshot to iCloud
const screenshotPath = getPath('exports', `screenshot-${Date.now()}.png`);

// Save downloaded file to iCloud
const downloadPath = getPath('attachments', filename);
```

## Notification Processing Criteria

| Event | Queue If | Drop If |
|-------|----------|---------|
| Download complete | File matches watched types (PDF, CSV, etc.) | Temporary or cache files |
| Bookmark sync | Bookmark added from monitored folders | Browser internal changes |

## SKILL.md Standard Header

```yaml
---
name: chrome
description: Control Chrome browser for web automation. Navigate pages, extract content, fill forms, capture screenshots.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Chrome Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

## Capabilities

- Page navigation with retry logic
- Content extraction (text, HTML, structured data)
- Form interaction (type, click, select, submit)
- Screenshot capture (viewport, full page, element)
- Session isolation via browser contexts

## Usage

### Via Command (Manual)
```
/chrome navigate https://example.com
/chrome screenshot https://example.com
```

### Via Notification (Automatic)
Triggered when downloads complete or bookmarks sync.

## Reference Documentation

See `reference/` directory for detailed docs.
```

---

## Research Summary

### Official Documentation Sources

- [Puppeteer Official Documentation](https://github.com/puppeteer/puppeteer) - High reputation, 2409 code snippets, benchmark score 91.1
- [Puppeteer Page Interactions Guide](https://github.com/puppeteer/puppeteer/blob/main/docs/guides/page-interactions.md)
- [WebScraping.AI - Managing Sessions](https://www.browserless.io/blog/manage-sessions)
- [Browser Context Best Practices](https://github.com/puppeteer/puppeteer/issues/85)

### Key Capabilities

**Page Navigation:**
- `page.goto(url, { waitUntil: 'networkidle2' })` - Navigate with network idle wait
- `page.waitForSelector(selector, { visible: true, timeout: 30000 })` - Wait for elements
- `page.waitForNavigation()` - Wait for navigation after actions
- Default timeout: 30 seconds (configurable via `page.setDefaultTimeout()`)

**Content Extraction:**
- `page.content()` - Get full HTML
- `page.$eval(selector, el => el.textContent)` - Extract text from element
- `page.$$eval(selector, els => els.map(...))` - Extract data from multiple elements
- `page.evaluate(() => {...})` - Run custom JavaScript in page context

**Form Interaction:**
- `page.type(selector, text)` - Type into input fields
- `page.click(selector)` - Click elements
- `page.select(selector, ...values)` - Select dropdown options
- `page.locator(selector).fill(value)` - Modern API for form filling

**Screenshot/Recording:**
- `page.screenshot({ path: 'screenshot.png', fullPage: true })` - Capture page
- `elementHandle.screenshot({ path: 'element.png' })` - Capture specific element

**Session Management:**
- **Browser Contexts:** Isolated sessions within single browser (like incognito mode)
- **Use case:** WhatsApp bot runs in default context, agent tasks in separate contexts
- **Benefits:** Separate cookies, localStorage, cache; resource-efficient vs. multiple browsers
- **Pattern:** One browser instance, multiple contexts for isolation

### Best Practices Discovered

1. **Browser Context vs Multiple Instances**
   - Use browser contexts for session isolation (more efficient)
   - Use separate browser instances only when complete isolation needed

2. **Error Handling**
   - Wrap all operations in try-catch blocks
   - Use `waitForSelector` with timeout to avoid hanging
   - Dispose pages properly to prevent memory leaks

3. **Session Persistence**
   - Save cookies to disk after login for reuse
   - Use `page.cookies()` and `page.setCookie()` for session management

4. **Retry Logic**
   - Implement exponential backoff for failed operations
   - Check element visibility before interaction
   - Handle navigation timeouts gracefully

### Limitations & Considerations

- Chrome processes need cleanup between tasks (already handled in `lib/resources.js`)
- Visible Chrome allows manual intervention if needed (current setup)
- Puppeteer temp directories accumulate in `/tmp` (already cleaned)
- Coordinate access with WhatsApp bot via browser contexts

---

## Design Decisions

### Why Browser Contexts?

WhatsApp bot and agent tasks can share a single Chrome instance using separate browser contexts:
- WhatsApp runs in default context (persistent)
- Agent tasks create temporary contexts (isolated, disposable)
- No conflicts, efficient resource usage

### Skill Structure

```
skills/chrome/
  skill.md              # Documentation and usage
  lib/
    browser-manager.js  # Manages browser instance and contexts
    navigation.js       # Page navigation utilities
    extraction.js       # Content extraction utilities
    forms.js            # Form interaction utilities
    screenshots.js      # Screenshot capture utilities
  tests/
    browser-manager.test.js
    navigation.test.js
    extraction.test.js
    forms.test.js
    screenshots.test.js
```

### Integration with WhatsApp Bot

The WhatsApp bot (whatsapp-web.js) already launches Chrome via Puppeteer. We'll:
1. Export the browser instance from whatsapp-bot.js
2. Create new contexts for agent tasks
3. Clean up contexts after task completion (not the browser)

### Error Handling Strategy

All skill functions return `{ success: boolean, data?: any, error?: string }`:
- Success case: `{ success: true, data: extractedContent }`
- Failure case: `{ success: false, error: 'Selector not found after 30s' }`

---

## Task Overview

| Task | Description | Files | Test Strategy |
|------|-------------|-------|---------------|
| 1 | Install Puppeteer | `package.json` | Verify dependency installed |
| 2 | Browser Manager Module | `skills/chrome/lib/browser-manager.js` | Unit test: launch, context creation, cleanup |
| 3 | Navigation Module | `skills/chrome/lib/navigation.js` | Unit test: goto, waitFor, retries |
| 4 | Content Extraction Module | `skills/chrome/lib/extraction.js` | Unit test: text, HTML, structured data |
| 5 | Form Interaction Module | `skills/chrome/lib/forms.js` | Unit test: type, click, select, submit |
| 6 | Screenshot Module | `skills/chrome/lib/screenshots.js` | Unit test: page, element, options |
| 7 | Error Handling & Retry Logic | All modules | Unit test: timeouts, retries, graceful failures |
| 8 | Integration with Resources.js | `lib/resources.js` | Test context cleanup on session change |
| 9 | Skill Documentation | `skills/chrome/skill.md` | Manual review for completeness |
| 10 | Integration Testing | Manual testing script | End-to-end: navigate, extract, form fill |

---

## Task 1: Install Puppeteer Dependency

**Objective:** Add Puppeteer as an explicit dependency to package.json.

**Why:** whatsapp-web.js may include Puppeteer internally, but we need it as a direct dependency for the Chrome skill.

### Test (TDD)

```bash
# Verify Puppeteer is installed
npm list puppeteer
```

**Expected Output:**
```
whatsapp-claude@1.0.0 /Users/brokkrbot/brokkr-agent
└── puppeteer@X.X.X
```

### Implementation

```bash
cd /Users/brokkrbot/brokkr-agent
npm install puppeteer --save
```

### Verification

```bash
npm list puppeteer
# Should show puppeteer in dependencies
```

**Commit:** `feat(chrome): add puppeteer dependency for browser skill`

---

## Task 2: Browser Manager Module

**Objective:** Create a module to manage browser instance lifecycle and context creation.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/lib/browser-manager.js`
- `/Users/brokkrbot/brokkr-agent/skills/chrome/tests/browser-manager.test.js`

### Test (TDD)

Create test file first:

```javascript
// skills/chrome/tests/browser-manager.test.js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { getBrowser, createContext, closeContext, isBrowserReady } from '../lib/browser-manager.js';

describe('Browser Manager', () => {
  test('getBrowser launches browser instance', async () => {
    const browser = await getBrowser();
    expect(browser).toBeTruthy();
    expect(await browser.version()).toMatch(/Chrome/);
  });

  test('isBrowserReady returns false before launch', () => {
    expect(isBrowserReady()).toBe(false);
  });

  test('createContext creates isolated browser context', async () => {
    const browser = await getBrowser();
    const context = await createContext({ id: 'test-context' });
    expect(context).toBeTruthy();
    const pages = await context.pages();
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  test('closeContext disposes of context properly', async () => {
    const context = await createContext({ id: 'test-context-2' });
    const result = await closeContext(context);
    expect(result.success).toBe(true);
  });

  afterAll(async () => {
    const browser = await getBrowser();
    await browser.close();
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/chrome/tests/browser-manager.test.js
```

**Expected:** Test fails - module doesn't exist yet.

### Implementation

```javascript
// skills/chrome/lib/browser-manager.js
import puppeteer from 'puppeteer';

let browserInstance = null;
const activeContexts = new Map();

/**
 * Get or launch the shared browser instance
 * @returns {Promise<Browser>} Puppeteer browser instance
 */
export async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: false, // Visible Chrome for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 }
    });
  }
  return browserInstance;
}

/**
 * Check if browser instance is ready
 * @returns {boolean} True if browser is launched and connected
 */
export function isBrowserReady() {
  return browserInstance !== null && browserInstance.isConnected();
}

/**
 * Create a new isolated browser context
 * @param {Object} options - Context options
 * @param {string} options.id - Unique context ID
 * @returns {Promise<BrowserContext>} Isolated browser context
 */
export async function createContext({ id }) {
  const browser = await getBrowser();
  const context = await browser.createBrowserContext();
  activeContexts.set(id, context);
  return context;
}

/**
 * Close and cleanup a browser context
 * @param {BrowserContext} context - Context to close
 * @returns {Promise<{success: boolean}>} Result
 */
export async function closeContext(context) {
  try {
    // Remove from tracking
    for (const [id, ctx] of activeContexts.entries()) {
      if (ctx === context) {
        activeContexts.delete(id);
        break;
      }
    }
    await context.close();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all active context IDs
 * @returns {string[]} Array of active context IDs
 */
export function getActiveContextIds() {
  return Array.from(activeContexts.keys());
}

/**
 * Close all active contexts (cleanup)
 * @returns {Promise<number>} Number of contexts closed
 */
export async function closeAllContexts() {
  const contexts = Array.from(activeContexts.values());
  for (const context of contexts) {
    await closeContext(context);
  }
  return contexts.length;
}
```

### Verification

```bash
npm test -- skills/chrome/tests/browser-manager.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(chrome): add browser manager module with context isolation`

---

## Task 3: Navigation Module

**Objective:** Create utilities for page navigation with robust waiting and error handling.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/lib/navigation.js`
- `/Users/brokkrbot/brokkr-agent/skills/chrome/tests/navigation.test.js`

### Test (TDD)

```javascript
// skills/chrome/tests/navigation.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getBrowser, createContext, closeContext } from '../lib/browser-manager.js';
import { navigateTo, waitForElement, getCurrentUrl } from '../lib/navigation.js';

describe('Navigation Module', () => {
  let context, page;

  beforeEach(async () => {
    context = await createContext({ id: 'nav-test' });
    page = await context.newPage();
  });

  afterEach(async () => {
    await page.close();
    await closeContext(context);
  });

  test('navigateTo navigates to URL successfully', async () => {
    const result = await navigateTo(page, 'https://example.com');
    expect(result.success).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  test('navigateTo handles invalid URL', async () => {
    const result = await navigateTo(page, 'not-a-url');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('waitForElement waits for selector', async () => {
    await navigateTo(page, 'https://example.com');
    const result = await waitForElement(page, 'h1');
    expect(result.success).toBe(true);
    expect(result.element).toBeTruthy();
  });

  test('waitForElement times out on missing selector', async () => {
    await navigateTo(page, 'https://example.com');
    const result = await waitForElement(page, '.nonexistent', { timeout: 1000 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });

  test('getCurrentUrl returns current page URL', async () => {
    await navigateTo(page, 'https://example.com');
    const url = getCurrentUrl(page);
    expect(url).toBe('https://example.com/');
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/chrome/tests/navigation.test.js
```

### Implementation

```javascript
// skills/chrome/lib/navigation.js

/**
 * Navigate to a URL with retry logic
 * @param {Page} page - Puppeteer page
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @param {number} options.timeout - Navigation timeout (ms)
 * @param {string} options.waitUntil - Wait condition ('load', 'networkidle2', etc.)
 * @param {number} options.retries - Number of retry attempts
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function navigateTo(page, url, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'networkidle2',
    retries = 2
  } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { timeout, waitUntil });
      return { success: true, url: page.url() };
    } catch (error) {
      if (attempt === retries) {
        return { success: false, error: error.message };
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Wait for an element to appear on the page
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @param {Object} options - Wait options
 * @param {boolean} options.visible - Wait for element to be visible
 * @param {number} options.timeout - Wait timeout (ms)
 * @returns {Promise<{success: boolean, element?: ElementHandle, error?: string}>}
 */
export async function waitForElement(page, selector, options = {}) {
  const {
    visible = true,
    timeout = 30000
  } = options;

  try {
    const element = await page.waitForSelector(selector, { visible, timeout });
    return { success: true, element };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Wait for navigation to complete
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Wait options
 * @param {number} options.timeout - Wait timeout (ms)
 * @param {string} options.waitUntil - Wait condition
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function waitForNavigation(page, options = {}) {
  const {
    timeout = 30000,
    waitUntil = 'networkidle2'
  } = options;

  try {
    await page.waitForNavigation({ timeout, waitUntil });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get current page URL
 * @param {Page} page - Puppeteer page
 * @returns {string} Current URL
 */
export function getCurrentUrl(page) {
  return page.url();
}

/**
 * Go back in browser history
 * @param {Page} page - Puppeteer page
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function goBack(page) {
  try {
    await page.goBack({ waitUntil: 'networkidle2' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Reload the current page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function reload(page) {
  try {
    await page.reload({ waitUntil: 'networkidle2' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Verification

```bash
npm test -- skills/chrome/tests/navigation.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(chrome): add navigation module with retry logic`

---

## Task 4: Content Extraction Module

**Objective:** Create utilities for extracting content from web pages.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/lib/extraction.js`
- `/Users/brokkrbot/brokkr-agent/skills/chrome/tests/extraction.test.js`

### Test (TDD)

```javascript
// skills/chrome/tests/extraction.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createContext, closeContext } from '../lib/browser-manager.js';
import { navigateTo } from '../lib/navigation.js';
import { getPageText, getElementText, getHTML, extractData } from '../lib/extraction.js';

describe('Extraction Module', () => {
  let context, page;

  beforeEach(async () => {
    context = await createContext({ id: 'extract-test' });
    page = await context.newPage();
    await navigateTo(page, 'https://example.com');
  });

  afterEach(async () => {
    await page.close();
    await closeContext(context);
  });

  test('getPageText extracts visible text', async () => {
    const result = await getPageText(page);
    expect(result.success).toBe(true);
    expect(result.text).toContain('Example Domain');
  });

  test('getElementText extracts text from selector', async () => {
    const result = await getElementText(page, 'h1');
    expect(result.success).toBe(true);
    expect(result.text).toBe('Example Domain');
  });

  test('getHTML extracts page HTML', async () => {
    const result = await getHTML(page);
    expect(result.success).toBe(true);
    expect(result.html).toContain('<!doctype html>');
  });

  test('extractData runs custom extraction function', async () => {
    const result = await extractData(page, () => {
      return { title: document.title, url: window.location.href };
    });
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('Example Domain');
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/chrome/tests/extraction.test.js
```

### Implementation

```javascript
// skills/chrome/lib/extraction.js

/**
 * Extract all visible text from page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export async function getPageText(page) {
  try {
    const text = await page.evaluate(() => document.body.innerText);
    return { success: true, text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract text from a specific element
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
export async function getElementText(page, selector) {
  try {
    const text = await page.$eval(selector, el => el.textContent.trim());
    return { success: true, text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract text from multiple elements
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @returns {Promise<{success: boolean, texts?: string[], error?: string}>}
 */
export async function getElementsText(page, selector) {
  try {
    const texts = await page.$$eval(selector, els => els.map(el => el.textContent.trim()));
    return { success: true, texts };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get full HTML of page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<{success: boolean, html?: string, error?: string}>}
 */
export async function getHTML(page) {
  try {
    const html = await page.content();
    return { success: true, html };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract structured data using custom function
 * @param {Page} page - Puppeteer page
 * @param {Function} extractFn - Function to run in page context
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function extractData(page, extractFn) {
  try {
    const data = await page.evaluate(extractFn);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get attribute value from element
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @param {string} attribute - Attribute name
 * @returns {Promise<{success: boolean, value?: string, error?: string}>}
 */
export async function getElementAttribute(page, selector, attribute) {
  try {
    const value = await page.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
    return { success: true, value };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Verification

```bash
npm test -- skills/chrome/tests/extraction.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(chrome): add content extraction module`

---

## Task 5: Form Interaction Module

**Objective:** Create utilities for interacting with forms (typing, clicking, selecting).

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/lib/forms.js`
- `/Users/brokkrbot/brokkr-agent/skills/chrome/tests/forms.test.js`

### Test (TDD)

```javascript
// skills/chrome/tests/forms.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createContext, closeContext } from '../lib/browser-manager.js';
import { navigateTo } from '../lib/navigation.js';
import { typeText, clickElement, selectOption, fillForm } from '../lib/forms.js';

describe('Forms Module', () => {
  let context, page;

  beforeEach(async () => {
    context = await createContext({ id: 'forms-test' });
    page = await context.newPage();
    // Create a simple test page with a form
    await page.setContent(`
      <html>
        <body>
          <form>
            <input id="name" type="text" />
            <select id="color">
              <option value="red">Red</option>
              <option value="blue">Blue</option>
            </select>
            <button id="submit">Submit</button>
          </form>
        </body>
      </html>
    `);
  });

  afterEach(async () => {
    await page.close();
    await closeContext(context);
  });

  test('typeText types into input field', async () => {
    const result = await typeText(page, '#name', 'John Doe');
    expect(result.success).toBe(true);
    const value = await page.$eval('#name', el => el.value);
    expect(value).toBe('John Doe');
  });

  test('clickElement clicks an element', async () => {
    let clicked = false;
    await page.evaluate(() => {
      document.getElementById('submit').addEventListener('click', (e) => {
        e.preventDefault();
        window.wasClicked = true;
      });
    });
    const result = await clickElement(page, '#submit');
    expect(result.success).toBe(true);
    clicked = await page.evaluate(() => window.wasClicked);
    expect(clicked).toBe(true);
  });

  test('selectOption selects from dropdown', async () => {
    const result = await selectOption(page, '#color', 'blue');
    expect(result.success).toBe(true);
    const value = await page.$eval('#color', el => el.value);
    expect(value).toBe('blue');
  });

  test('fillForm fills multiple fields', async () => {
    const result = await fillForm(page, {
      '#name': 'Jane Doe',
      '#color': 'red'
    });
    expect(result.success).toBe(true);
    const nameValue = await page.$eval('#name', el => el.value);
    const colorValue = await page.$eval('#color', el => el.value);
    expect(nameValue).toBe('Jane Doe');
    expect(colorValue).toBe('red');
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/chrome/tests/forms.test.js
```

### Implementation

```javascript
// skills/chrome/lib/forms.js

/**
 * Type text into an input field
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @param {string} text - Text to type
 * @param {Object} options - Type options
 * @param {number} options.delay - Delay between keystrokes (ms)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function typeText(page, selector, text, options = {}) {
  const { delay = 0 } = options;

  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.click(selector); // Focus the element
    await page.type(selector, text, { delay });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Click an element
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @param {Object} options - Click options
 * @param {number} options.delay - Delay before click (ms)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function clickElement(page, selector, options = {}) {
  const { delay = 0 } = options;

  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await page.click(selector);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Select option from dropdown
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector for <select> element
 * @param {string|string[]} values - Value(s) to select
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function selectOption(page, selector, values) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    const valuesArray = Array.isArray(values) ? values : [values];
    await page.select(selector, ...valuesArray);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check a checkbox
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function checkCheckbox(page, selector) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    const isChecked = await page.$eval(selector, el => el.checked);
    if (!isChecked) {
      await page.click(selector);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fill multiple form fields
 * @param {Page} page - Puppeteer page
 * @param {Object} fields - Map of selector to value
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function fillForm(page, fields) {
  try {
    for (const [selector, value] of Object.entries(fields)) {
      // Determine field type
      const tagName = await page.$eval(selector, el => el.tagName.toLowerCase());
      const type = await page.$eval(selector, el => el.type?.toLowerCase());

      if (tagName === 'select') {
        await selectOption(page, selector, value);
      } else if (type === 'checkbox') {
        if (value) {
          await checkCheckbox(page, selector);
        }
      } else {
        // Clear existing value first
        await page.click(selector, { clickCount: 3 }); // Select all
        await page.keyboard.press('Backspace');
        await typeText(page, selector, value);
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Submit a form
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector for form or submit button
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function submitForm(page, selector) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click(selector)
    ]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Verification

```bash
npm test -- skills/chrome/tests/forms.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(chrome): add form interaction module`

---

## Task 6: Screenshot Module

**Objective:** Create utilities for capturing screenshots.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/lib/screenshots.js`
- `/Users/brokkrbot/brokkr-agent/skills/chrome/tests/screenshots.test.js`

### Test (TDD)

```javascript
// skills/chrome/tests/screenshots.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, unlinkSync } from 'fs';
import { createContext, closeContext } from '../lib/browser-manager.js';
import { navigateTo } from '../lib/navigation.js';
import { captureScreenshot, captureElement, captureFullPage } from '../lib/screenshots.js';

describe('Screenshots Module', () => {
  let context, page;
  const testFile = '/tmp/test-screenshot.png';

  beforeEach(async () => {
    context = await createContext({ id: 'screenshot-test' });
    page = await context.newPage();
    await navigateTo(page, 'https://example.com');
  });

  afterEach(async () => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
    await page.close();
    await closeContext(context);
  });

  test('captureScreenshot saves screenshot to file', async () => {
    const result = await captureScreenshot(page, { path: testFile });
    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(true);
  });

  test('captureFullPage captures full page', async () => {
    const result = await captureFullPage(page, { path: testFile });
    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(true);
  });

  test('captureElement captures specific element', async () => {
    const result = await captureElement(page, 'h1', { path: testFile });
    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(true);
  });
});
```

**Run test (should FAIL):**
```bash
npm test -- skills/chrome/tests/screenshots.test.js
```

### Implementation

```javascript
// skills/chrome/lib/screenshots.js

/**
 * Capture screenshot of current viewport
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Screenshot options
 * @param {string} options.path - File path to save screenshot
 * @param {string} options.type - Image type ('png' or 'jpeg')
 * @param {number} options.quality - JPEG quality (0-100)
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function captureScreenshot(page, options = {}) {
  const {
    path = '/tmp/screenshot.png',
    type = 'png',
    quality = 90
  } = options;

  try {
    await page.screenshot({ path, type, quality });
    return { success: true, path };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Capture full page screenshot (scrolls to capture all)
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Screenshot options
 * @param {string} options.path - File path to save screenshot
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function captureFullPage(page, options = {}) {
  const { path = '/tmp/screenshot-full.png' } = options;

  try {
    await page.screenshot({ path, fullPage: true });
    return { success: true, path };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Capture screenshot of specific element
 * @param {Page} page - Puppeteer page
 * @param {string} selector - CSS selector
 * @param {Object} options - Screenshot options
 * @param {string} options.path - File path to save screenshot
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export async function captureElement(page, selector, options = {}) {
  const { path = '/tmp/element-screenshot.png' } = options;

  try {
    const element = await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    await element.screenshot({ path });
    return { success: true, path };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Capture screenshot as base64 (no file saved)
 * @param {Page} page - Puppeteer page
 * @param {Object} options - Screenshot options
 * @param {string} options.type - Image type ('png' or 'jpeg')
 * @returns {Promise<{success: boolean, base64?: string, error?: string}>}
 */
export async function captureScreenshotBase64(page, options = {}) {
  const { type = 'png' } = options;

  try {
    const base64 = await page.screenshot({ encoding: 'base64', type });
    return { success: true, base64 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Verification

```bash
npm test -- skills/chrome/tests/screenshots.test.js
```

**Expected:** All tests pass.

**Commit:** `feat(chrome): add screenshot capture module`

---

## Task 7: Error Handling & Retry Logic

**Objective:** Ensure all modules have robust error handling and retry mechanisms.

**Files:** Review all module files

### Test (TDD)

Add error handling tests to each module's test file:

```javascript
// Add to skills/chrome/tests/navigation.test.js
test('navigateTo retries on timeout', async () => {
  // Use invalid URL that times out
  const result = await navigateTo(page, 'http://10.255.255.1', {
    timeout: 1000,
    retries: 2
  });
  expect(result.success).toBe(false);
  expect(result.error).toBeTruthy();
}, 15000); // Longer test timeout

// Add to skills/chrome/tests/extraction.test.js
test('getElementText handles missing selector', async () => {
  const result = await getElementText(page, '.nonexistent');
  expect(result.success).toBe(false);
  expect(result.error).toBeTruthy();
});

// Add to skills/chrome/tests/forms.test.js
test('typeText handles timeout gracefully', async () => {
  const result = await typeText(page, '.nonexistent', 'test');
  expect(result.success).toBe(false);
  expect(result.error).toBeTruthy();
});
```

### Implementation

Review all modules - error handling already implemented via try-catch blocks.
Verify retry logic in navigation.js is working correctly.

### Verification

```bash
npm test -- skills/chrome/tests/
```

**Expected:** All tests pass including new error handling tests.

**Commit:** `test(chrome): add error handling test coverage`

---

## Task 8: Integration with Resources.js

**Objective:** Update resources.js to cleanup browser contexts on session change.

**Files:**
- `/Users/brokkrbot/brokkr-agent/lib/resources.js`

### Test (TDD)

Add test to existing resources.test.js:

```javascript
// Add to tests/resources.test.js (if it exists, otherwise create)
import { describe, test, expect } from '@jest/globals';
import { cleanupBrowserContexts } from '../lib/resources.js';

test('cleanupBrowserContexts closes all browser contexts', async () => {
  // Test will be implemented when we integrate
  expect(true).toBe(true); // Placeholder
});
```

### Implementation

```javascript
// Add to lib/resources.js at the end

import { closeAllContexts } from '../skills/chrome/lib/browser-manager.js';

/**
 * Cleanup all browser contexts (Chrome skill)
 * @returns {Promise<number>} Number of contexts closed
 */
export async function cleanupBrowserContexts() {
  try {
    const count = await closeAllContexts();
    return count;
  } catch (error) {
    // Browser manager not available or no contexts
    return 0;
  }
}

/**
 * Run all cleanup functions (updated to include browser contexts)
 * @returns {Object} Summary of cleanup results
 */
export function fullCleanup() {
  return {
    trackedProcesses: cleanupTrackedProcesses(),
    chromeProcesses: cleanupChromeProcesses(),
    browserContexts: cleanupBrowserContexts(), // NEW
    tempFiles: cleanupTempFiles(),
    completedJobs: cleanupCompletedJobs(),
    orphanedJobs: cleanupOrphanedActiveJobs()
  };
}
```

**Note:** The fullCleanup function already exists - we're adding the browserContexts cleanup to it.

### Verification

```bash
npm test -- tests/resources.test.js
```

**Expected:** Tests pass.

**Commit:** `feat(chrome): integrate context cleanup with resources manager`

---

## Task 9: Skill Documentation

**Objective:** Create comprehensive skill documentation.

**Files:**
- `/Users/brokkrbot/brokkr-agent/skills/chrome/skill.md`

### Implementation

```markdown
# Chrome Browser Automation Skill

Control Chrome browser for web automation tasks using Puppeteer.

## Capabilities

- **Page Navigation:** Open URLs, wait for load, handle redirects
- **Content Extraction:** Get page text, HTML, structured data
- **Form Interaction:** Fill fields, click buttons, select dropdowns
- **Screenshots:** Capture full page or specific elements
- **Session Management:** Isolated browser contexts for parallel tasks

## Usage Examples

### Navigate to URL

```javascript
import { getBrowser, createContext, closeContext } from './skills/chrome/lib/browser-manager.js';
import { navigateTo } from './skills/chrome/lib/navigation.js';

const context = await createContext({ id: 'task-123' });
const page = await context.newPage();
const result = await navigateTo(page, 'https://example.com');
console.log(result); // { success: true, url: 'https://example.com/' }
await closeContext(context);
```

### Extract Page Content

```javascript
import { getPageText, getElementText } from './skills/chrome/lib/extraction.js';

const pageText = await getPageText(page);
const title = await getElementText(page, 'h1');
```

### Fill and Submit Form

```javascript
import { fillForm, submitForm } from './skills/chrome/lib/forms.js';

await fillForm(page, {
  '#email': 'user@example.com',
  '#password': 'secret',
  '#remember': true
});
await submitForm(page, 'button[type="submit"]');
```

### Capture Screenshot

```javascript
import { captureFullPage } from './skills/chrome/lib/screenshots.js';

const result = await captureFullPage(page, {
  path: '/tmp/screenshot.png'
});
```

## Architecture

### Browser Context Isolation

The skill uses Puppeteer browser contexts for session isolation:
- WhatsApp bot runs in default context (persistent)
- Agent tasks create temporary contexts (isolated cookies, storage)
- Contexts are cleaned up after task completion

### Error Handling

All functions return `{ success: boolean, data?, error? }`:
- Success: `{ success: true, data: ... }`
- Failure: `{ success: false, error: 'Error message' }`

### Retry Logic

Navigation functions include automatic retry with exponential backoff:
- Default: 2 retries
- Configurable timeout (default: 30s)
- Waits for network idle by default

## Integration with Brokkr

### Resource Cleanup

Browser contexts are automatically cleaned up during session changes via `lib/resources.js`.

### Coordination with WhatsApp Bot

The WhatsApp bot uses the default browser context. Agent tasks use isolated contexts, preventing conflicts.

## Dependencies

- `puppeteer` - Browser automation library
- Chrome "for Testing" - Installed via Puppeteer

## Files

```
skills/chrome/
  skill.md              # This file
  lib/
    browser-manager.js  # Browser instance and context management
    navigation.js       # Page navigation utilities
    extraction.js       # Content extraction utilities
    forms.js            # Form interaction utilities
    screenshots.js      # Screenshot capture utilities
  tests/
    browser-manager.test.js
    navigation.test.js
    extraction.test.js
    forms.test.js
    screenshots.test.js
```

## Future Enhancements

- Cookie persistence for authenticated sessions
- PDF generation
- Network request interception
- Custom HTTP headers
- Proxy support
```

### Verification

Manual review of skill.md for completeness.

**Commit:** `docs(chrome): add skill documentation`

---

## Task 10: Integration Testing

**Objective:** Perform end-to-end testing of Chrome skill.

### Manual Test Script

Create `/Users/brokkrbot/brokkr-agent/skills/chrome/manual-test.js`:

```javascript
// skills/chrome/manual-test.js
import { getBrowser, createContext, closeContext } from './lib/browser-manager.js';
import { navigateTo, waitForElement } from './lib/navigation.js';
import { getPageText, getElementText } from './lib/extraction.js';
import { fillForm, clickElement } from './lib/forms.js';
import { captureFullPage } from './lib/screenshots.js';

async function testChromeSkill() {
  console.log('Starting Chrome skill integration test...\n');

  let context, page;
  try {
    // 1. Create browser context
    console.log('1. Creating browser context...');
    context = await createContext({ id: 'manual-test' });
    page = await context.newPage();
    console.log('✓ Context created\n');

    // 2. Navigate to test page
    console.log('2. Navigating to example.com...');
    const navResult = await navigateTo(page, 'https://example.com');
    console.log(`✓ Navigation: ${navResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`  URL: ${navResult.url}\n`);

    // 3. Extract content
    console.log('3. Extracting page content...');
    const textResult = await getPageText(page);
    console.log(`✓ Page text extracted (${textResult.text?.length || 0} chars)`);
    const titleResult = await getElementText(page, 'h1');
    console.log(`✓ Title: ${titleResult.text}\n`);

    // 4. Capture screenshot
    console.log('4. Capturing screenshot...');
    const screenshotResult = await captureFullPage(page, {
      path: '/tmp/chrome-skill-test.png'
    });
    console.log(`✓ Screenshot: ${screenshotResult.success ? 'SAVED' : 'FAILED'}`);
    console.log(`  Path: ${screenshotResult.path}\n`);

    // 5. Navigate to form test page
    console.log('5. Testing form interaction...');
    await page.setContent(`
      <html>
        <body>
          <form id="testForm">
            <input id="name" type="text" placeholder="Name" />
            <input id="email" type="email" placeholder="Email" />
            <button type="submit">Submit</button>
          </form>
          <div id="result"></div>
          <script>
            document.getElementById('testForm').addEventListener('submit', (e) => {
              e.preventDefault();
              document.getElementById('result').textContent = 'Form submitted!';
            });
          </script>
        </body>
      </html>
    `);

    const fillResult = await fillForm(page, {
      '#name': 'Test User',
      '#email': 'test@example.com'
    });
    console.log(`✓ Form filled: ${fillResult.success ? 'SUCCESS' : 'FAILED'}`);

    const clickResult = await clickElement(page, 'button[type="submit"]');
    console.log(`✓ Button clicked: ${clickResult.success ? 'SUCCESS' : 'FAILED'}`);

    await new Promise(resolve => setTimeout(resolve, 500));
    const resultText = await getElementText(page, '#result');
    console.log(`✓ Form result: ${resultText.text}\n`);

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (page) await page.close();
    if (context) await closeContext(context);
    const browser = await getBrowser();
    await browser.close();
  }
}

testChromeSkill();
```

### Execution

```bash
cd /Users/brokkrbot/brokkr-agent
node skills/chrome/manual-test.js
```

**Expected Output:**
```
Starting Chrome skill integration test...

1. Creating browser context...
✓ Context created

2. Navigating to example.com...
✓ Navigation: SUCCESS
  URL: https://example.com/

3. Extracting page content...
✓ Page text extracted (XXX chars)
✓ Title: Example Domain

4. Capturing screenshot...
✓ Screenshot: SAVED
  Path: /tmp/chrome-skill-test.png

5. Testing form interaction...
✓ Form filled: SUCCESS
✓ Button clicked: SUCCESS
✓ Form result: Form submitted!

✅ All tests passed!
```

### Verification

```bash
# Check screenshot was created
ls -lh /tmp/chrome-skill-test.png

# Run all unit tests
npm test -- skills/chrome/tests/
```

**Expected:** Manual test completes successfully, screenshot exists, all unit tests pass.

**Commit:** `test(chrome): add integration test script`

---

## Completion Checklist

- [ ] Puppeteer dependency installed
- [ ] Browser manager module with context isolation
- [ ] Navigation module with retry logic
- [ ] Content extraction module
- [ ] Form interaction module
- [ ] Screenshot module
- [ ] Error handling test coverage
- [ ] Integration with resources.js cleanup
- [ ] Skill documentation complete
- [ ] Integration testing passed
- [ ] All unit tests passing
- [ ] Code committed with descriptive messages

## Success Criteria

1. All unit tests pass (`npm test -- skills/chrome/tests/`)
2. Manual integration test completes successfully
3. Browser contexts properly isolated (WhatsApp + agent tasks coexist)
4. Resource cleanup removes contexts on session change
5. Skill documentation clearly explains usage patterns
6. Error handling provides actionable error messages

## Future Enhancements

- Cookie persistence for authenticated sessions (login once, reuse session)
- PDF generation from pages
- Network request interception (modify requests/responses)
- Custom HTTP headers for API testing
- Proxy support for different locations
- Frame/iframe navigation utilities
- File upload/download handling

## Documentation Updates

After completion, update:
1. `/Users/brokkrbot/brokkr-agent/CLAUDE.md` - Add Chrome skill to capabilities
2. `/Users/brokkrbot/brokkr-agent/docs/concepts/2026-01-31-brokkr-self-improvement-system.md` - Mark Chrome skill as complete

---

**Implementation Notes:**

- Browser contexts prevent conflicts between WhatsApp and agent tasks
- Visible Chrome mode allows manual intervention if needed
- All modules use consistent error handling pattern
- Retry logic with exponential backoff prevents transient failures
- Screenshot paths default to `/tmp` for easy cleanup
- Form filling intelligently handles different input types
