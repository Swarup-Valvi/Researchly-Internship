import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderOptions, googleCalendarUrl } from './calendar.js';

const it = test;

const params = (url) => new URL(url).searchParams;

  it('offers nothing when the record has no dates (never invents one)', () => {
    assert.deepEqual(reminderOptions({ id: 'x', name: 'X' }), []);
  });

  it('all-day deadline when the time zone is unknown; end date is exclusive', () => {
    const [d] = reminderOptions({ id: 'x', name: 'ICML', edition: '2099', submission_deadline: '2099-01-30' });
    assert.equal(d.id, 'deadline');
    assert.equal(params(d.url).get('dates'), '20990130/20990131');
    assert.equal(params(d.url).get('text'), 'Deadline: ICML 2099');
    assert.equal(params(d.url).get('action'), 'TEMPLATE');
  });

  it('timed deadline ending at deadline_at, plus a one-week heads-up', () => {
    const opts = reminderOptions({ id: 'x', title: 'NeurIPS 2099', submission_deadline: '2099-05-15', deadline_at: '2099-05-15T20:00:00Z' });
    assert.equal(params(opts[0].url).get('dates'), '20990515T190000Z/20990515T200000Z');
    assert.equal(opts[1].id, 'week_before');
    assert.equal(params(opts[1].url).get('dates'), '20990508/20990509');
  });

  it('no heads-up once the deadline is less than a week away or passed', () => {
    const ids = reminderOptions({ id: 'x', name: 'Old', submission_deadline: '2001-01-01' }).map((o) => o.id);
    assert.deepEqual(ids, ['deadline']);
  });

  it('conference dates span start..end inclusive with location and links in details', () => {
    const o = reminderOptions({ id: 'icml-2099', name: 'ICML', start_date: '2099-07-10', end_date: '2099-07-15',
      city: 'Seoul', country: 'South Korea', official_url: 'https://icml.cc' }, { siteUrl: 'https://r.example' })
      .find((x) => x.id === 'event');
    const p = params(o.url);
    assert.equal(p.get('dates'), '20990710/20990716');
    assert.equal(p.get('location'), 'Seoul, South Korea');
    assert.ok(p.get('details').includes('https://icml.cc'));
    assert.ok(p.get('details').includes('https://r.example/conferences/icml-2099'));
  });

  it('googleCalendarUrl encodes text safely', () => {
    assert.ok(googleCalendarUrl({ text: 'A & B', dates: '1/2' }).includes('text=A+%26+B'));
  });
