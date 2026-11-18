/**
 * Discover page logic: timeline status, filtering, location facets and sort. Pure functions (no React, no
 * import.meta) so they run under `node --test`.
 *
 * Date rules (consistent with lib/deadline.js):
 * - Deadline: `deadline_at` when the time zone is known, else the END of that date anywhere on earth (AoE, UTC-12).
 * - An event has started once its start date has begun anywhere (00:00 UTC+14) and is over only once its end date
 *   (or start date, if no end date) has ended everywhere (23:59:59 UTC-12). Nothing is hidden early.
 */
import { deadlineMoment } from './deadline.js';

const DAY = /^\d{4}-\d{2}-\d{2}/;
const dayOf = (s) => (typeof s === 'string' && DAY.test(s) ? s.slice(0, 10) : null);
const ms = (d) => (d ? d.getTime() : null);

export const startMoment = (c) => { const d = dayOf(c?.start_date); return d ? new Date(`${d}T00:00:00+14:00`) : null; };
export const endMoment = (c) => {
  const d = dayOf(c?.end_date) || dayOf(c?.start_date);
  return d ? new Date(`${d}T23:59:59-12:00`) : null;
};

/** 'ongoing' | 'upcoming' | 'past' | 'tba' (no usable start date and no deadline). */
export function timelineStatus(c, now = new Date()) {
  const t = now.getTime();
  const start = ms(startMoment(c));
  const end = ms(endMoment(c));
  const deadline = ms(deadlineMoment(c));
  if (start !== null && t >= start && t <= end) return 'ongoing';
  if ((start !== null && t < start) || (deadline !== null && t <= deadline)) return 'upcoming';
  if (start === null && deadline === null) return 'tba';
  return 'past';
}

/** Event dates for display; 'TBA' when the record has none. */
export function eventDatesLabel(c) {
  const s = dayOf(c?.start_date);
  const e = dayOf(c?.end_date);
  if (!s) return 'TBA';
  return e && e !== s ? `${s} – ${e}` : s;
}

export const TIMELINES = {
  current: 'Ongoing & upcoming',
  closing: 'Deadline within 14 days',
  all: 'Include past events',
  past: 'Past events only',
};

function matchesTimeline(c, timeline, now) {
  const st = timelineStatus(c, now);
  if (timeline === 'all') return true;
  if (timeline === 'past') return st === 'past';
  if (timeline === 'closing') {
    const d = ms(deadlineMoment(c));
    return d !== null && d >= now.getTime() && d <= now.getTime() + 14 * 86400000;
  }
  return st !== 'past';                                   // 'current' (default): ongoing, upcoming and TBA
}

// ---- location ----------------------------------------------------------------------------------------------
export const ONLINE = '__online';
export const NO_LOCATION = '__none';
const ONLINE_FORMATS = new Set(['virtual', 'hybrid', 'webinar', 'online']);
const COUNTRY_ALIASES = { usa: 'United States', us: 'United States', 'u.s.a.': 'United States', uk: 'United Kingdom' };

/**
 * Country as stated by the record. Pipeline records carry `country` (null = not stated, e.g. multi-site NeurIPS
 * 2026: never guessed). Older records without that field fall back to the last part of a "city, ..., country"
 * location string; a single-part location ("Singapore", "Paris") is not treated as a country.
 */
export function countryOf(c) {
  if (c && 'country' in c) return c.country || null;
  const parts = String(c?.location || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  return COUNTRY_ALIASES[last.toLowerCase()] || last;
}

export const isOnline = (c) => ONLINE_FORMATS.has(String(c?.format || '').toLowerCase());

function matchesCountry(c, country) {
  if (!country) return true;
  if (country === ONLINE) return isOnline(c);
  if (country === NO_LOCATION) return !countryOf(c);
  return countryOf(c) === country;
}

function matchesCity(c, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return [c.city, c.venue, c.location].some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
}

/** Dropdown options with counts, computed over `list` (already filtered by everything except country). */
export function countryFacets(list) {
  const counts = new Map();
  let none = 0;
  let online = 0;
  for (const c of list) {
    const k = countryOf(c);
    if (k) counts.set(k, (counts.get(k) || 0) + 1); else none += 1;
    if (isOnline(c)) online += 1;
  }
  const countries = [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
  return [
    { value: ONLINE, label: 'Online / Hybrid', count: online },
    ...countries,
    { value: NO_LOCATION, label: 'Location not stated', count: none },
  ];
}

// ---- other filters ------------------------------------------------------------------------------------------
const lc = (s) => String(s || '').toLowerCase();

function matchesSearch(c, q) {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  return [c.name, c.title, c.location, c.venue, ...(c.topics || [])].some((v) => lc(v).includes(n));
}

/** Apply all filters. `skip` names one filter to leave out (used to compute facet counts). */
export function applyFilters(list, f = {}, now = new Date(), skip = null) {
  return list.filter((c) =>
    matchesSearch(c, f.search) &&
    (!f.field || f.field === 'All' || lc(c.field).includes(lc(f.field))) &&
    (!f.format || f.format === 'All' || lc(c.format) === lc(f.format)) &&
    (!f.event_type || f.event_type === 'All' || lc(c.event_type || 'Conference') === lc(f.event_type)) &&
    (!f.risk || f.risk === 'All' || lc(c.risk_level) === lc(f.risk)) &&
    matchesTimeline(c, f.timeline || 'current', now) &&
    (skip === 'country' || matchesCountry(c, f.country)) &&
    matchesCity(c, f.city));
}

/**
 * Default order: soonest upcoming deadline first, then start date. Groups:
 *   0 open deadline (by deadline, then start) · 1 no open deadline but ongoing/upcoming (by start)
 *   2 TBA · 3 past (most recent first).
 */
export function sortForDiscover(list, now = new Date()) {
  const t = now.getTime();
  const key = (c) => {
    const d = ms(deadlineMoment(c));
    const s = ms(startMoment(c));
    const st = timelineStatus(c, now);
    if (d !== null && d >= t) return [0, d, s ?? Infinity];
    if (st === 'ongoing' || st === 'upcoming') return [1, s ?? Infinity, 0];
    if (st === 'tba') return [2, 0, 0];
    return [3, -(ms(endMoment(c)) ?? d ?? 0), 0];
  };
  return list
    .map((c) => ({ c, k: key(c) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || lc(a.c.name).localeCompare(lc(b.c.name)))
    .map((x) => x.c);
}

/** Banner counts from the data actually returned by the API. */
export function bannerCounts(shown, total) {
  const assessed = shown.filter((c) => ['low', 'medium', 'high'].includes(lc(c.risk_level))).length;
  return { shown: shown.length, total: total.length, assessed };
}
