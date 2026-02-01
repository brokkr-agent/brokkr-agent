/**
 * Notification Filter - Tier 1 Core Logic
 *
 * Processes notifications instantly using deterministic rules.
 * No AI invocation. < 1ms per notification.
 *
 * Returns:
 *   { decision: 'drop', reason, tier: 1 }
 *   { decision: 'queue', priority, command, reason, tier: 1 }
 *   { decision: 'unsure', tier: 1 } → sends to Tier 2 subagent
 */

export const RULES = {
  // ═══════════════════════════════════════════════════════════════
  // BLACKLIST: Always drop instantly
  // ═══════════════════════════════════════════════════════════════
  blacklist: {
    imessage: {
      senders: [
        /^\+1800/,        // Toll-free
        /^\+1888/,
        /^\+1877/,
        /^\+1866/
      ],
      content: [
        /unsubscribe/i,
        /click here to stop/i,
        /reply stop/i
      ]
    },
    email: {
      senders: [
        /@marketing\./i,
        /@newsletter\./i,
        /@promo\./i,
        /^noreply@/i,
        /^no-reply@/i
      ],
      subjects: [
        /^(?:sale|deal|offer|discount)/i,
        /unsubscribe/i,
        /weekly digest/i
      ]
    },
    calendar: {
      titles: [
        /^declined:/i,
        /^cancelled:/i
      ]
    },
    system: {
      bundleIds: [
        'com.apple.wifi.proxy',
        'com.apple.battery',
        'com.apple.photoanalysisd'
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // WHITELIST: Always queue as CRITICAL
  // ═══════════════════════════════════════════════════════════════
  whitelist: {
    imessage: {
      senders: [
        '+12069090025'    // Tommy's phone
      ],
      content: [
        /^\//,            // Command prefix
        /^brokkr/i,       // Direct address
        /^hey brokkr/i
      ]
    },
    email: {
      senders: [
        'tommyjohnson90@gmail.com'
      ],
      flags: ['flagged', 'important'],
      subjects: [
        /\[AGENT\]/i,
        /\[BROKKR\]/i
      ]
    },
    calendar: {
      content: [
        /\[AGENT\]/i,
        /\[BROKKR\]/i
      ]
    },
    reminders: {
      lists: ['Agent Tasks', 'Brokkr'],
      content: [
        /\[AGENT\]/i
      ]
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // PATTERNS: Match → queue with specific priority
  // ═══════════════════════════════════════════════════════════════
  patterns: {
    imessage: [
      { match: /urgent/i, priority: 'CRITICAL' },
      { match: /asap/i, priority: 'HIGH' },
      { match: /when you (?:can|get a chance)/i, priority: 'LOW' },
      { match: /fyi/i, priority: 'LOW' }
    ],
    email: [
      { match: /action required/i, priority: 'HIGH' },
      { match: /please review/i, priority: 'NORMAL' },
      { match: /fyi|for your information/i, priority: 'LOW' }
    ],
    calendar: [
      { match: /interview/i, priority: 'HIGH' },
      { match: /deadline/i, priority: 'HIGH' }
    ],
    bluetooth: [
      { match: /airpods/i, priority: 'NORMAL' },
      { match: /new device/i, priority: 'HIGH' }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════
// COMMAND MAPPING: notification type → skill command
// ═══════════════════════════════════════════════════════════════
export const COMMANDS = {
  imessage: (n) => `/imessage respond "${n.sender}"`,
  email: (n) => `/email process "${n.messageId}"`,
  calendar: (n) => `/calendar handle "${n.eventId}"`,
  reminders: (n) => `/reminders process "${n.reminderId}"`,
  bluetooth: (n) => `/bluetooth handle "${n.deviceId}"`,
  system: (n) => `/system handle "${n.type}"`
};

function matchesAny(value, patterns) {
  if (!patterns || !value) return false;
  return patterns.some(p => {
    if (p instanceof RegExp) return p.test(value);
    if (typeof p === 'string') return value.includes(p);
    return false;
  });
}

export function filterNotification(notification) {
  const { type, sender, content, subject, metadata = {} } = notification;
  const blacklist = RULES.blacklist[type] || {};
  const whitelist = RULES.whitelist[type] || {};
  const patterns = RULES.patterns[type] || [];

  // ─────────────────────────────────────────────────────────────
  // BLACKLIST CHECK (instant drop)
  // ─────────────────────────────────────────────────────────────
  if (matchesAny(sender, blacklist.senders) ||
      matchesAny(content, blacklist.content) ||
      matchesAny(subject, blacklist.subjects) ||
      matchesAny(metadata.bundleId, blacklist.bundleIds)) {
    return { decision: 'drop', reason: 'blacklisted', tier: 1 };
  }

  // ─────────────────────────────────────────────────────────────
  // WHITELIST CHECK (instant queue as CRITICAL)
  // ─────────────────────────────────────────────────────────────
  if (matchesAny(sender, whitelist.senders) ||
      matchesAny(content, whitelist.content) ||
      matchesAny(subject, whitelist.subjects) ||
      (metadata.flags && whitelist.flags?.some(f => metadata.flags.includes(f))) ||
      (metadata.list && whitelist.lists?.includes(metadata.list))) {
    return {
      decision: 'queue',
      priority: 'CRITICAL',
      command: COMMANDS[type]?.(notification) || `/system handle`,
      reason: 'whitelisted',
      tier: 1
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PATTERN CHECK (queue with specific priority)
  // ─────────────────────────────────────────────────────────────
  const searchText = `${content || ''} ${subject || ''}`;
  for (const pattern of patterns) {
    if (pattern.match.test(searchText)) {
      return {
        decision: 'queue',
        priority: pattern.priority,
        command: COMMANDS[type]?.(notification) || `/system handle`,
        reason: `pattern: ${pattern.match}`,
        tier: 1
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // NO MATCH → Send to Tier 2 (notification-processor subagent)
  // ─────────────────────────────────────────────────────────────
  return { decision: 'unsure', tier: 1 };
}
