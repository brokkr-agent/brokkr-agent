// lib/notification-rules.js
// Trigger rules engine for notification processing
// Evaluates rules against notifications to determine actions

import { readFileSync, existsSync } from 'fs';

/**
 * Load rules from a JSON configuration file
 * @param {string} configPath - Path to the JSON config file
 * @returns {Array} Array of rule objects, empty if file missing or invalid
 */
export function loadRules(configPath) {
  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.rules || [];
  } catch {
    return [];
  }
}

/**
 * Parse and normalize a rule condition object
 * @param {Object|null|undefined} condition - Raw condition from rule
 * @returns {Object} Normalized condition object
 */
export function parseRuleCondition(condition) {
  if (!condition) {
    return {};
  }

  const normalized = {};

  // Handle 'any' flag
  if (condition.any) {
    normalized.any = true;
  }

  // Normalize string conditions (trim whitespace)
  if (condition.titleContains) {
    normalized.titleContains = String(condition.titleContains).trim();
  }

  if (condition.bodyContains) {
    normalized.bodyContains = String(condition.bodyContains).trim();
  }

  if (condition.senderContains) {
    normalized.senderContains = String(condition.senderContains).trim();
  }

  return normalized;
}

/**
 * Check if a notification matches a single rule
 * @param {Object} notification - Notification object with app and content
 * @param {Object} rule - Rule object to match against
 * @returns {boolean} True if notification matches the rule
 */
export function matchesRule(notification, rule) {
  // Check app matches (if rule specifies an app)
  if (rule.app && notification.app !== rule.app) {
    return false;
  }

  const content = notification.content || {};
  const condition = rule.condition || {};

  // If 'any: true', match all notifications from this app
  if (condition.any) {
    return true;
  }

  // Build combined text for anyContains and pattern matching
  const title = (content.title || '').toLowerCase();
  const body = (content.body || '').toLowerCase();
  const sender = (content.sender || content.title || '').toLowerCase();
  const combined = `${title} ${body} ${sender}`;

  // If no specific conditions, it's a match (app already matched above)
  const hasConditions = condition.titleContains || condition.bodyContains ||
    condition.senderContains || condition.anyContains || condition.pattern || condition.keywords;
  if (!hasConditions) {
    return true;
  }

  // Check title condition
  if (condition.titleContains) {
    if (!title.includes(condition.titleContains.toLowerCase())) {
      return false;
    }
  }

  // Check body condition
  if (condition.bodyContains) {
    if (!body.includes(condition.bodyContains.toLowerCase())) {
      return false;
    }
  }

  // Check sender condition
  if (condition.senderContains) {
    if (!sender.includes(condition.senderContains.toLowerCase())) {
      return false;
    }
  }

  // Check anyContains - matches if any field contains the text
  if (condition.anyContains) {
    if (!combined.includes(condition.anyContains.toLowerCase())) {
      return false;
    }
  }

  // Check pattern (regex) - matches against combined text
  if (condition.pattern) {
    try {
      const regex = new RegExp(condition.pattern, 'i');
      if (!regex.test(combined)) {
        return false;
      }
    } catch {
      // Invalid regex, treat as no match
      return false;
    }
  }

  // Check keywords (array, any match)
  if (condition.keywords && Array.isArray(condition.keywords)) {
    const hasKeyword = condition.keywords.some(kw =>
      combined.includes(kw.toLowerCase())
    );
    if (!hasKeyword) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate all rules against a notification
 * @param {Object} notification - Notification object with app and content
 * @param {Array} rules - Array of rule objects to evaluate
 * @returns {Array} Array of matched rules, sorted by priority (highest first)
 */
export function evaluateRules(notification, rules) {
  return rules
    .filter(rule => matchesRule(notification, rule))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
