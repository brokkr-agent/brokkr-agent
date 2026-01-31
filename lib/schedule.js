// lib/schedule.js
import { execSync } from 'child_process';
import { info, error } from './logger.js';

const CRON_MARKER = '# BROKKR:';

function parseToCron(timeExpr) {
  const lower = timeExpr.toLowerCase();

  // "at 3pm" or "at 15:00"
  const atMatch = lower.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (atMatch) {
    let hour = parseInt(atMatch[1]);
    const minute = atMatch[2] ? parseInt(atMatch[2]) : 0;
    const ampm = atMatch[3];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * *`;
  }

  // "every day at 9am"
  const dailyMatch = lower.match(/every day at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = dailyMatch[2] ? parseInt(dailyMatch[2]) : 0;
    const ampm = dailyMatch[3];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * *`;
  }

  // "every monday at 9am"
  const weeklyMatch = lower.match(/every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (weeklyMatch) {
    const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[weeklyMatch[1]];
    let hour = parseInt(weeklyMatch[2]);
    const minute = weeklyMatch[3] ? parseInt(weeklyMatch[3]) : 0;
    const ampm = weeklyMatch[4];

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return `${minute} ${hour} * * ${day}`;
  }

  // "every hour"
  if (lower.includes('every hour')) {
    return '0 * * * *';
  }

  return null;
}

export function addSchedule(timeExpr, task) {
  const cron = parseToCron(timeExpr);
  if (!cron) {
    return { success: false, error: `Could not parse time: ${timeExpr}` };
  }

  const id = Date.now().toString(36);
  const escapedTask = task.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const command = `cd /Users/brokkrbot/brokkr-agent && claude -p "${escapedTask}" --dangerously-skip-permissions --chrome >> logs/scheduled.log 2>&1`;
  const cronLine = `${cron} ${command} ${CRON_MARKER}${id}`;

  try {
    const current = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const updated = current.trim() + '\n' + cronLine + '\n';
    execSync(`echo "${updated.replace(/"/g, '\\"')}" | crontab -`);

    info('Schedule', 'Added scheduled task', { id, cron, task: task.slice(0, 50) });
    return { success: true, id, cron };
  } catch (err) {
    error('Schedule', 'Failed to add schedule', { error: err.message });
    return { success: false, error: err.message };
  }
}

export function listSchedules() {
  try {
    const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const lines = crontab.split('\n').filter(l => l.includes(CRON_MARKER));

    return lines.map(line => {
      const idMatch = line.match(/# BROKKR:(\w+)/);
      const parts = line.split(' ');
      return {
        id: idMatch ? idMatch[1] : 'unknown',
        cron: parts.slice(0, 5).join(' '),
        command: parts.slice(5).join(' ').replace(/# BROKKR:\w+/, '').trim()
      };
    });
  } catch {
    return [];
  }
}

export function removeSchedule(id) {
  try {
    const crontab = execSync('crontab -l 2>/dev/null || true', { encoding: 'utf-8' });
    const lines = crontab.split('\n').filter(l => !l.includes(`${CRON_MARKER}${id}`));
    execSync(`echo "${lines.join('\n').replace(/"/g, '\\"')}" | crontab -`);

    info('Schedule', 'Removed scheduled task', { id });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
