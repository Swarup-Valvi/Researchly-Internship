/**
 * Deadline display rules.
 * - A deadline is a precise instant only when the backend sends `deadline_at` (time zone known).
 * - Otherwise it is a calendar date: shown as a date, never as a time. Days-left is counted to the END of that date
 *   anywhere on earth (23:59:59 UTC-12), the latest moment it could still be open, so it never shows "Passed" early.
 */
const dayOf = (s) => (typeof s === 'string' && s.length >= 10 ? s.slice(0, 10) : null);

export function deadlineMoment(conf) {
  if (conf?.deadline_at) {
    const d = new Date(conf.deadline_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const day = dayOf(conf?.submission_deadline);
  return day ? new Date(`${day}T23:59:59-12:00`) : null;
}

export function daysLeft(conf) {
  const d = deadlineMoment(conf);
  return d ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
}

export function deadlineLabel(conf, fallback = 'TBA') {
  if (conf?.raw_deadline) return conf.raw_deadline;
  const day = dayOf(conf?.submission_deadline);
  if (!day) return fallback;
  return conf?.deadline_at ? conf.deadline_at : `${day} (time zone not stated)`;
}
