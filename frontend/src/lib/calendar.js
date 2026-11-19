// "Add to Google Calendar" links. No API, no OAuth: the event is pre-filled in the user's own Google Calendar
// (https://calendar.google.com/calendar/render?action=TEMPLATE...) and they press Save. Nothing is invented: a link is
// offered only for dates the record actually has.
import { deadlineMoment } from './deadline.js';

const DAY = 86400000;
const dayOf = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const compact = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');        // 2027-01-30T12:00:00Z -> 20270130T120000Z
const allDay = (day) => day.replace(/-/g, '');
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

export function confTitle(conf) {
  return conf?.title || [conf?.name, conf?.edition].filter(Boolean).join(' ') || 'Conference';
}

export function googleCalendarUrl({ text, dates, details = '', location = '' }) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text, dates });
  if (details) p.set('details', details);
  if (location) p.set('location', location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** -> [{ id, label, sub, url }] for the dates this record has: deadline, a 7-day heads-up, and the event itself. */
export function reminderOptions(conf, { siteUrl = '' } = {}) {
  const name = confTitle(conf);
  const page = siteUrl && conf?.id ? `${siteUrl}/conferences/${encodeURIComponent(conf.id)}` : '';
  const official = conf?.official_url || '';
  const details = (what) => [what, official && `Official site: ${official}`, page && `On Researchly: ${page}`,
    'Always confirm dates on the official site.'].filter(Boolean).join('\n');
  const location = [conf?.city, conf?.country].filter(Boolean).join(', ') || conf?.location || '';
  const out = [];

  const deadlineDay = dayOf(conf?.submission_deadline);
  if (conf?.deadline_at || deadlineDay) {
    let dates;
    let sub;
    if (conf?.deadline_at && !Number.isNaN(Date.parse(conf.deadline_at))) {
      const end = new Date(conf.deadline_at);
      dates = `${compact(new Date(end.getTime() - 3600000).toISOString())}/${compact(end.toISOString())}`;
      sub = 'Timed event ending at the exact deadline';
    } else {
      dates = `${allDay(deadlineDay)}/${allDay(nextDay(deadlineDay))}`;
      sub = 'All-day (time zone not stated)';
    }
    out.push({ id: 'deadline', label: 'Submission deadline', sub,
      url: googleCalendarUrl({ text: `Deadline: ${name}`, dates, details: details(`Paper submission deadline for ${name}.`) }) });

    const due = deadlineMoment(conf);
    if (due && due.getTime() - 7 * DAY > Date.now()) {
      const day = new Date(due.getTime() - 7 * DAY).toISOString().slice(0, 10);
      out.push({ id: 'week_before', label: '1 week before deadline', sub: `Heads-up on ${day}`,
        url: googleCalendarUrl({ text: `1 week left: ${name}`, dates: `${allDay(day)}/${allDay(nextDay(day))}`,
          details: details(`One week until the submission deadline for ${name}.`) }) });
    }
  }

  const start = dayOf(conf?.start_date);
  if (start) {
    const end = dayOf(conf?.end_date) && conf.end_date >= start ? dayOf(conf.end_date) : start;
    out.push({ id: 'event', label: 'Conference dates', sub: end === start ? start : `${start} → ${end}`,
      url: googleCalendarUrl({ text: name, dates: `${allDay(start)}/${allDay(nextDay(end))}`, details: details(name), location }) });
  }
  return out;
}
