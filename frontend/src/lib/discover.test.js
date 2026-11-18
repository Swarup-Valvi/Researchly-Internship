import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timelineStatus, eventDatesLabel, applyFilters, countryFacets, countryOf, sortForDiscover, bannerCounts,
  ONLINE, NO_LOCATION,
} from './discover.js';

const NOW = new Date('2026-11-18T12:00:00Z');
const at = (iso) => new Date(iso);

test('ongoing: today is between start and end', () => {
  assert.equal(timelineStatus({ start_date: '2026-11-16', end_date: '2026-11-20' }, NOW), 'ongoing');
  assert.equal(timelineStatus({ start_date: '2026-11-18' }, NOW), 'ongoing');          // one-day event, no end date
});

test('upcoming: start date or submission deadline in the future', () => {
  assert.equal(timelineStatus({ start_date: '2027-02-16', end_date: '2027-02-23' }, NOW), 'upcoming');
  // event already over, but a (later-cycle) deadline is still open -> upcoming
  assert.equal(timelineStatus({ start_date: '2026-01-01', end_date: '2026-01-03', submission_deadline: '2026-12-01' }, NOW), 'upcoming');
  // no event dates at all, deadline in the future
  assert.equal(timelineStatus({ submission_deadline: '2027-01-10' }, NOW), 'upcoming');
});

test('past: event over and deadline passed', () => {
  assert.equal(timelineStatus({ start_date: '2026-07-01', end_date: '2026-07-05', submission_deadline: '2026-01-15' }, NOW), 'past');
  assert.equal(timelineStatus({ submission_deadline: '2026-03-01' }, NOW), 'past');
});

test('missing dates: TBA, kept in the default view', () => {
  const c = { name: 'X' };
  assert.equal(timelineStatus(c, NOW), 'tba');
  assert.equal(eventDatesLabel(c), 'TBA');
  assert.equal(eventDatesLabel({ start_date: 'TBD' }), 'TBA');
  assert.deepEqual(applyFilters([c], {}, NOW), [c]);
  assert.equal(eventDatesLabel({ start_date: '2027-02-16', end_date: '2027-02-23' }), '2027-02-16 – 2027-02-23');
});

test('AoE: a date-only deadline is open until 23:59:59 UTC-12 on that date', () => {
  const c = { submission_deadline: '2026-11-18' };
  assert.equal(timelineStatus(c, at('2026-11-19T11:59:00Z')), 'upcoming');           // still 18 Nov somewhere
  assert.equal(timelineStatus(c, at('2026-11-19T12:00:00Z')), 'past');
});

test('AoE: deadline_at (time zone known) is used as the exact instant', () => {
  const c = { submission_deadline: '2026-11-18', deadline_at: '2026-11-18T09:00:00Z' };
  assert.equal(timelineStatus(c, at('2026-11-18T08:59:00Z')), 'upcoming');
  assert.equal(timelineStatus(c, at('2026-11-18T09:01:00Z')), 'past');               // not extended to AoE
});

test('AoE: an event starts once its start date begins anywhere and ends once its end date ends everywhere', () => {
  const c = { start_date: '2026-11-19', end_date: '2026-11-19' };
  assert.equal(timelineStatus(c, at('2026-11-18T09:59:00Z')), 'upcoming');           // 19 Nov not yet begun in UTC+14
  assert.equal(timelineStatus(c, at('2026-11-18T10:00:00Z')), 'ongoing');
  assert.equal(timelineStatus(c, at('2026-11-20T11:59:59Z')), 'ongoing');
  assert.equal(timelineStatus(c, at('2026-11-20T12:00:01Z')), 'past');
});

const PAST = { id: 'p', name: 'Past', start_date: '2026-06-01', end_date: '2026-06-03', submission_deadline: '2026-01-10' };
const NEXT = { id: 'n', name: 'Next', start_date: '2027-05-01', submission_deadline: '2027-01-15' };

test('timeline filter: default hides past, "all" and "past" keep them reachable', () => {
  assert.deepEqual(applyFilters([PAST, NEXT], {}, NOW).map((c) => c.id), ['n']);
  assert.deepEqual(applyFilters([PAST, NEXT], { timeline: 'all' }, NOW).map((c) => c.id), ['p', 'n']);
  assert.deepEqual(applyFilters([PAST, NEXT], { timeline: 'past' }, NOW).map((c) => c.id), ['p']);
  assert.deepEqual(applyFilters([PAST, NEXT, { id: 's', submission_deadline: '2026-11-25' }], { timeline: 'closing' }, NOW).map((c) => c.id), ['s']);
});

const LOC = [
  { id: 'aaai', format: 'In-Person', city: null, country: null, venue: 'Singapore EXPO', location: null },
  { id: 'alt', format: 'In-Person', city: 'Toronto', country: 'Canada', venue: 'Fields Institute', location: 'Toronto, Canada' },
  { id: 'neurips', format: 'In-Person', city: null, country: null, venue: null, location: null },      // multi-site
  { id: 'v', format: 'Virtual', country: null, location: 'Virtual' },
  { id: 'seed', format: 'Hybrid', location: 'Seattle, WA, USA' },                                     // older record, no country field
];

test('country of a record: explicit field first, never guessed from a single word', () => {
  assert.equal(countryOf(LOC[1]), 'Canada');
  assert.equal(countryOf(LOC[2]), null);
  assert.equal(countryOf(LOC[4]), 'United States');
  assert.equal(countryOf({ location: 'Singapore' }), null);
});

test('location filter: country, Online / Hybrid, not stated, and city/venue search', () => {
  const ids = (f) => applyFilters(LOC, { timeline: 'all', ...f }, NOW).map((c) => c.id);
  assert.deepEqual(ids({ country: 'Canada' }), ['alt']);
  assert.deepEqual(ids({ country: ONLINE }), ['v', 'seed']);
  assert.deepEqual(ids({ country: NO_LOCATION }), ['aaai', 'neurips', 'v']);
  assert.deepEqual(ids({ city: 'toronto' }), ['alt']);
  assert.deepEqual(ids({ city: 'expo' }), ['aaai']);                                 // venue matches
});

test('country facets carry counts and a "Location not stated" bucket', () => {
  assert.deepEqual(countryFacets(LOC).map((o) => [o.label, o.count]), [
    ['Online / Hybrid', 2], ['Canada', 1], ['United States', 1], ['Location not stated', 3],
  ]);
});

test('sort: soonest open deadline first, then start date; TBA then past last', () => {
  const list = [
    { id: 'past', start_date: '2026-06-01', submission_deadline: '2026-01-01' },
    { id: 'tba' },
    { id: 'startOnly', start_date: '2027-01-05' },
    { id: 'late', submission_deadline: '2027-03-01', start_date: '2027-08-01' },
    { id: 'soonA', submission_deadline: '2026-12-01', start_date: '2027-06-01' },
    { id: 'soonB', submission_deadline: '2026-12-01', start_date: '2027-04-01' },
  ];
  assert.deepEqual(sortForDiscover(list, NOW).map((c) => c.id), ['soonB', 'soonA', 'late', 'startOnly', 'tba', 'past']);
});

test('banner counts come from the data', () => {
  const shown = [{ risk_level: 'Low' }, { risk_level: 'Not assessed' }, { risk_level: null }, { risk_level: 'High' }];
  assert.deepEqual(bannerCounts(shown, [...shown, {}]), { shown: 4, total: 5, assessed: 2 });
});
