// lib/group-monitor.js
// Group conversation state machine for iMessage groups
// Tracks when Brokkr should respond to group messages

export const STATES = {
  IDLE: 'idle',
  ACTIVE: 'active'
};

export const MESSAGE_WINDOW = 20;
export const TIME_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * GroupMonitor tracks group conversation state
 *
 * States:
 * - IDLE: Not monitoring, only responds to direct "Brokkr" mentions
 * - ACTIVE: Monitoring conversation, evaluates each message
 *
 * Transitions:
 * - IDLE -> ACTIVE: When Brokkr is mentioned
 * - ACTIVE -> IDLE: After MESSAGE_WINDOW messages without Brokkr mention
 * - ACTIVE -> IDLE: After TIME_WINDOW_MS since last Brokkr response
 */
export class GroupMonitor {
  constructor() {
    // Map of groupId -> { state, lastBrokkrResponse, messagesSinceResponse }
    this.groups = new Map();
  }

  /**
   * Get the current state for a group
   * @param {string} groupId - The group identifier
   * @returns {string} - Current state (IDLE for unknown groups)
   */
  getState(groupId) {
    const group = this.groups.get(groupId);
    if (!group) {
      return STATES.IDLE;
    }
    return group.state;
  }

  /**
   * Check if text contains the word "brokkr" (case-insensitive, word boundary)
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  mentionsBrokkr(text) {
    if (!text) return false;
    // Word boundary match for "brokkr" - not part of another word
    const pattern = /\bbrokkr\b/i;
    return pattern.test(text);
  }

  /**
   * Check if text directly addresses Brokkr
   * Patterns: "Brokkr, ...", "Hey Brokkr...", "@Brokkr..."
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  isDirectlyAddressed(text) {
    if (!text) return false;

    const lowerText = text.toLowerCase().trim();

    // Pattern: starts with "brokkr," or "brokkr "
    if (/^brokkr[,\s]/i.test(lowerText)) {
      return true;
    }

    // Pattern: "hey brokkr" anywhere at start
    if (/^hey\s+brokkr\b/i.test(lowerText)) {
      return true;
    }

    // Pattern: "@brokkr" at start
    if (/^@brokkr\b/i.test(lowerText)) {
      return true;
    }

    return false;
  }

  /**
   * Process a message and determine if Brokkr should respond
   * @param {Object} params
   * @param {string} params.groupId - The group identifier
   * @param {string} params.text - The message text
   * @param {string} params.sender - The sender identifier
   * @returns {Object} - { shouldRespond: boolean, reason: string }
   */
  processMessage({ groupId, text, sender }) {
    const now = Date.now();
    const mentionsBrokkr = this.mentionsBrokkr(text);
    const isDirectlyAddressed = this.isDirectlyAddressed(text);

    // Get or initialize group state
    let group = this.groups.get(groupId);

    // Check for time-based transition from ACTIVE to IDLE
    if (group && group.state === STATES.ACTIVE) {
      const timeSinceLastResponse = now - group.lastBrokkrResponse;
      if (timeSinceLastResponse > TIME_WINDOW_MS) {
        // Transition to IDLE due to time window exceeded
        group.state = STATES.IDLE;
        group.messagesSinceResponse = 0;
      }
    }

    // Handle IDLE state
    // In IDLE, ONLY respond to direct addresses, not indirect mentions
    // "Brokkr, what do you think?" → respond
    // "I disagree with Brokkr" → do NOT respond
    if (!group || group.state === STATES.IDLE) {
      if (isDirectlyAddressed) {
        // Transition to ACTIVE on direct address
        this.groups.set(groupId, {
          state: STATES.ACTIVE,
          lastBrokkrResponse: now,
          messagesSinceResponse: 0
        });

        return {
          shouldRespond: true,
          reason: 'directly_addressed'
        };
      }

      // Indirect mentions in IDLE state are ignored
      return {
        shouldRespond: false,
        reason: mentionsBrokkr ? 'indirect_mention' : 'not_mentioned'
      };
    }

    // Handle ACTIVE state
    // Even in ACTIVE, only respond to DIRECT addresses, not indirect mentions
    // "I disagree with Brokkr" → do NOT respond (indirect)
    if (isDirectlyAddressed) {
      // Reset counters on direct address
      group.lastBrokkrResponse = now;
      group.messagesSinceResponse = 0;

      return {
        shouldRespond: true,
        reason: 'directly_addressed'
      };
    }

    // Indirect mention in ACTIVE state - don't respond but keep state active
    if (mentionsBrokkr) {
      // Reset counters but don't respond
      group.messagesSinceResponse = 0;

      return {
        shouldRespond: false,
        reason: 'indirect_mention'
      };
    }

    // Increment message counter
    group.messagesSinceResponse++;

    // Check for message window transition
    if (group.messagesSinceResponse > MESSAGE_WINDOW) {
      // Transition to IDLE due to message window exceeded
      group.state = STATES.IDLE;

      return {
        shouldRespond: false,
        reason: 'message_window_exceeded'
      };
    }

    // In ACTIVE state, evaluate relevance (for now, just indicate we're monitoring)
    return {
      shouldRespond: false,
      reason: 'monitoring'
    };
  }
}
