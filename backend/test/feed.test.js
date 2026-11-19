import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFeed, canView, normalizeVisibility } from '../src/services/feed.js';
import { buildDigest } from '../src/services/newsletter.js';

const posts = [
  { id: 1, user_id: 'me', visibility: 'connections' },
  { id: 2, user_id: 'friend', visibility: 'connections' },
  { id: 3, user_id: 'stranger', visibility: 'connections' },
  { id: 4, user_id: 'stranger', visibility: 'public' },
  { id: 5, user_id: 'friend' },                              // legacy row, no visibility -> public
  { id: 6, user_id: null, visibility: 'public' }             // seed post
];
const ids = (xs) => xs.map((p) => p.id);
const friends = new Set(['friend']);

test('guests see only public posts', () => {
  assert.deepEqual(ids(filterFeed(posts)), [4, 5, 6]);
});

test('"all" shows public posts plus connections-only posts by me and my connections', () => {
  assert.deepEqual(ids(filterFeed(posts, { viewerId: 'me', connectedIds: friends })), [1, 2, 4, 5, 6]);
});

test('"connections" shows only posts by me and my connections, never strangers', () => {
  assert.deepEqual(ids(filterFeed(posts, { viewerId: 'me', connectedIds: friends, scope: 'connections' })), [1, 2, 5]);
  assert.deepEqual(filterFeed(posts, { scope: 'connections' }), []);
});

test('unknown visibility falls back to public; connections-only post hidden from non-connections', () => {
  assert.equal(normalizeVisibility('everyone'), 'public');
  assert.equal(canView(posts[2], 'me', friends), false);
});

test('digest lists sections, escapes HTML, links to the site and offers unsubscribe', () => {
  const d = buildDigest({
    name: 'Ada', newConnections: [{ name: 'Grace <b>', institution: 'Navy' }], pendingRequests: 2,
    posts: [{ author_name: 'Grace', content: 'x'.repeat(300) }],
    events: [{ id: 'icml-2027', title: 'ICML 2027', deadline: '2027-01-30', city: 'Seoul', country: 'South Korea' }]
  }, { siteUrl: 'https://researchly.example', now: new Date('2026-11-20T00:00:00Z') });
  assert.equal(d.empty, false);
  assert.match(d.subject, /1 new event, 1 new connection, 1 post/);
  assert.ok(d.html.includes('Grace &lt;b&gt;') && !d.html.includes('Grace <b>'));
  assert.ok(d.html.includes('https://researchly.example/conferences/icml-2027'));
  assert.match(d.text, /2 pending connection request/);
  assert.match(d.text, /x{100}…/);
  assert.ok(d.html.includes('https://researchly.example/profile'));
});

test('an empty week says so instead of inventing content', () => {
  const d = buildDigest({}, { now: new Date('2026-11-20T00:00:00Z') });
  assert.equal(d.empty, true);
  assert.match(d.text, /quiet week/);
});
