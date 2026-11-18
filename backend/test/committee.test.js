import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openAlexAuthorLookup, committeeLookup, clearOpenAlexCache, sameName, sameInstitution, sampleMembers, gatherLookups
} from '../src/services/lookups.js';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';
import { ingestRecords, mapPipelineRecord, committeeForAudit } from '../src/services/ingestService.js';
import { store } from '../src/db/store.js';

// Fictional people. All network access is a mocked fetch; these tests never touch the real API.
const author = (id, name, inst) => ({ id: `https://openalex.org/${id}`, display_name: name,
  last_known_institutions: inst ? [{ display_name: inst }] : [] });
const DIRECTORY = {
  'Alice Fictional': [author('A1', 'Alice Fictional', 'University of Nowhere')],
  'Bruno Testa': [author('A2', 'Bruno Testa', 'Instituto Ficticio')],
  'Chen Placeholder': [author('A3', 'Chen Placeholder', 'Example Institute of Technology')],
  'Dana Sample': [author('A4', 'Dana Sample', 'Fictional Research Lab')],
  'Wrong Place': [author('A5', 'Wrong Place', 'California Institute of Technology')]
};
function mockOpenAlex(calls = []) {
  return async (url) => {
    calls.push(url);
    if (!url.includes('api.openalex.org')) return { ok: false, status: 503, json: async () => ({}) };
    const q = decodeURIComponent(new URL(url).searchParams.get('search'));
    return { ok: true, status: 200, json: async () => ({ results: DIRECTORY[q] || [] }) };
  };
}
const fails = async () => ({ ok: false, status: 503, json: async () => ({}) });
const byId = (a, id) => a.checks.find((c) => c.id === id);
const PC = [
  { name: 'Alice Fictional', affiliation: 'University of Nowhere' },
  { name: 'Bruno Testa', affiliation: 'Instituto Ficticio' },
  { name: 'Chen Placeholder', affiliation: 'Example Institute of Technology' },
  { name: 'Dana Sample', affiliation: 'Fictional Research Lab' }
];
const ghosts = (n) => Array.from({ length: n }, (_, i) => ({ name: `Nobody Number${i}`, affiliation: 'Global Institute' }));
const ALL_NAMES = [...PC, ...ghosts(6), { name: 'Wrong Place' }].map((m) => m.name);
const OVERCLAIM = /\b(verified|genuine|legitimate|fake|fraud|bogus|predatory)\b/i;

test('name and institution matching', () => {
  assert.ok(sameName('José Pérez', 'Jose Perez'));
  assert.ok(sameName('J. Smith', 'John Smith'));
  assert.ok(!sameName('Jane Smith', 'Jane Smythe'));
  assert.ok(sameInstitution('University of Nowhere', 'Nowhere University'));
  assert.ok(!sameInstitution('University of California', 'California Institute of Technology'));
});

test('OpenAlex lookup: resolves, matches institution, caches, sends mailto only when configured', async () => {
  clearOpenAlexCache();
  const calls = [];
  const r = await openAlexAuthorLookup('Alice Fictional', 'University of Nowhere', { fetchImpl: mockOpenAlex(calls), mailto: 'ops@example.org' });
  assert.equal(r.ok, true); assert.equal(r.resolved, true); assert.equal(r.institution_match, true);
  assert.match(calls[0], /mailto=ops%40example\.org/);
  await openAlexAuthorLookup('Alice Fictional', 'University of Nowhere', { fetchImpl: mockOpenAlex(calls) });
  assert.equal(calls.length, 1, 'second lookup served from cache');
  const wrong = await openAlexAuthorLookup('Wrong Place', 'University of California', { fetchImpl: mockOpenAlex(calls) });
  assert.equal(wrong.resolved, true); assert.equal(wrong.institution_match, false);
  const noAff = await openAlexAuthorLookup('Dana Sample', null, { fetchImpl: mockOpenAlex(calls) });
  assert.equal(noAff.institution_match, null);                     // nothing stated -> nothing to compare
  assert.doesNotMatch(calls.at(-1), /mailto/);
});

test('OpenAlex lookup never throws; failures are not cached', async () => {
  clearOpenAlexCache();
  assert.deepEqual(await openAlexAuthorLookup('Alice Fictional', 'X', { fetchImpl: fails }), { ok: false, error: 'HTTP 503' });
  const slow = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  assert.equal((await openAlexAuthorLookup('Alice Fictional', 'X', { fetchImpl: slow, timeoutMs: 20 })).error, 'timeout');
  assert.equal((await openAlexAuthorLookup('Alice Fictional', 'University of Nowhere', { fetchImpl: mockOpenAlex() })).ok, true);
  clearOpenAlexCache();
  const all = await committeeLookup(PC, { fetchImpl: async () => { throw new Error('network down'); }, sampleSize: 3 });
  assert.equal(all.ok, false); assert.match(all.error, /lookups failed/);
});

test('committeeLookup returns aggregate counts only (no names, affiliations or author URLs)', async () => {
  clearOpenAlexCache();
  const c = await committeeLookup(PC, { fetchImpl: mockOpenAlex() });
  assert.deepEqual(Object.keys(c).sort(), ['checked_at', 'failed_lookups', 'institution_matches', 'listed', 'looked_up', 'ok',
    'resolved', 'sampled', 'with_stated_affiliation']);
  const blob = JSON.stringify(c);
  for (const n of ALL_NAMES) assert.ok(!blob.includes(n), n);
  assert.ok(!blob.includes('openalex.org/A'));
});

test('sampling is deterministic and capped', () => {
  const many = Array.from({ length: 95 }, (_, i) => ({ name: `M${i}` }));
  assert.equal(sampleMembers(many).length, 10);
  assert.deepEqual(sampleMembers(many), sampleMembers(many));
  assert.equal(sampleMembers(many)[0].name, 'M0');
});

test('engine pass: wording says names correspond to real researchers, never "verified"/"genuine"', async () => {
  clearOpenAlexCache();
  const committee = await committeeLookup(PC, { fetchImpl: mockOpenAlex() });
  const a = evaluateConferenceCredibility({ id: 'x', official_url: 'https://fict.example.org' }, { committee });
  const c = byId(a, 'committee_verification');
  assert.equal(c.status, 'pass');
  assert.match(c.detail, /names correspond to real researchers at the stated institutions/);
  assert.doesNotMatch(c.detail, OVERCLAIM);
  assert.deepEqual(c.evidence.observed, { listed: 4, sampled: 4, looked_up: 4, failed_lookups: 0, resolved: 4,
    with_stated_affiliation: 4, institution_matches: 4 });
  assert.equal(c.evidence.url, 'https://fict.example.org'); assert.ok(c.evidence.checked_at);
  assert.ok(a.limitations.some((l) => /without their knowledge or consent/.test(l)));
  assert.equal(a.tpc_score, 100);
});

test('engine warn needs >= 5 lookups; 4 sparse lookups stay not_checked; never fail', async () => {
  clearOpenAlexCache();
  const four = await committeeLookup(ghosts(4), { fetchImpl: mockOpenAlex() });
  const c4 = byId(evaluateConferenceCredibility({ id: 'x' }, { committee: four }), 'committee_verification');
  assert.equal(c4.status, 'not_checked');
  const five = await committeeLookup(ghosts(5), { fetchImpl: mockOpenAlex() });
  const c5 = byId(evaluateConferenceCredibility({ id: 'x' }, { committee: five }), 'committee_verification');
  assert.equal(c5.status, 'warn');
  assert.match(c5.detail, /risk indicator/); assert.doesNotMatch(c5.detail, OVERCLAIM);
  for (const lk of [four, five, { ok: false, error: 'all 5 OpenAlex lookups failed (timeout)' }]) {
    assert.notEqual(byId(evaluateConferenceCredibility({ id: 'x' }, { committee: lk }), 'committee_verification').status, 'fail');
  }
});

test('engine not_checked: no committee, live checks off, lookups failed, too few, or inconclusive', async () => {
  clearOpenAlexCache();
  const check = (lk, conf = {}) => byId(evaluateConferenceCredibility({ id: 'x', ...conf }, lk), 'committee_verification');
  assert.match(check({ committee: { ok: false, error: 'no committee listed' } }).detail, /No program committee/);
  const off = check({});
  assert.equal(off.status, 'not_checked'); assert.match(off.detail, /not run/);
  assert.match(check({ committee: { ok: false, error: 'all 4 OpenAlex lookups failed (timeout)' } }).detail, /timeout/);
  assert.equal(check({ committee: await committeeLookup(PC.slice(0, 2), { fetchImpl: mockOpenAlex() }) }).status, 'not_checked');
  const mixed = [...PC.slice(0, 2), { name: 'Wrong Place', affiliation: 'University of California' }, ...ghosts(1),
    { name: 'Dana Sample', affiliation: 'Some Other Place' }];
  const mid = check({ committee: await committeeLookup(mixed, { fetchImpl: mockOpenAlex() }) });
  assert.equal(mid.status, 'not_checked'); assert.match(mid.detail, /Inconclusive/);
  assert.equal(evaluateConferenceCredibility({ id: 'x' }, {}).tpc_score, null);   // never a default score
});

test('stored aggregate summary is reused by re-audits that have no committee list', async () => {
  clearOpenAlexCache();
  const summary = await committeeLookup(PC, { fetchImpl: mockOpenAlex() });
  const reaudit = await gatherLookups({ name: 'FICT' }, { fetchImpl: mockOpenAlex(), mailto: '' });
  assert.ok(!('committee' in reaudit));
  const a = evaluateConferenceCredibility({ id: 'x', committee_summary: summary }, reaudit);
  assert.equal(byId(a, 'committee_verification').status, 'pass');
});

test('mapPipelineRecord strips committee; committeeForAudit keeps names + affiliations only', () => {
  const rec = { conference_id: 'a'.repeat(64), canonical_name: 'Fict', year: 2027, website_url: 'https://f.example.org',
    provenance: { primary_source: 'individual', source_urls: ['https://f.example.org'] },
    committee: [{ name: 'Alice Fictional', affiliation: 'University of Nowhere', email: 'x@example.org' }, { name: 'Frida Nobody' }] };
  assert.ok(!('committee' in mapPipelineRecord(rec)));
  assert.deepEqual(committeeForAudit(rec),
    [{ name: 'Alice Fictional', affiliation: 'University of Nowhere' }, { name: 'Frida Nobody', affiliation: null }]);
});

test('PRIVACY: after a live ingest, no member name or OpenAlex author URL is in the saved conference or audit', async () => {
  clearOpenAlexCache();
  const members = [...PC, ...ghosts(3), { name: 'Wrong Place', affiliation: 'University of California' }];
  const rec = { conference_id: 'b'.repeat(64), canonical_name: 'Fictional Privacy Conference', year: 2027,
    website_url: 'https://privacy.example.org/', provenance: { primary_source: 'individual', source_urls: ['https://privacy.example.org/'],
      scraped_at: '2026-11-18T00:00:00Z', extraction_method: 'heuristic', confidence: 0.5 }, committee: members };
  const res = await ingestRecords([rec], { live: true, lookupOpts: { fetchImpl: mockOpenAlex(), mailto: '' } });
  assert.deepEqual(res.rejected, []);
  const id = mapPipelineRecord(rec).id;
  const conf = await store.getConferenceById(id);
  const audit = await store.getCredibilityAudit(id);
  assert.equal(byId(audit, 'committee_verification').evidence.observed.listed, members.length);   // the check did run
  assert.equal(conf.committee_summary.listed, members.length);
  const blob = JSON.stringify(conf) + JSON.stringify(audit);
  for (const m of members) {
    assert.ok(!blob.includes(m.name), `name leaked: ${m.name}`);
    assert.ok(!blob.includes(m.affiliation), `affiliation leaked: ${m.affiliation}`);
  }
  assert.ok(!blob.includes('openalex.org/A'), 'OpenAlex author URL leaked');
  assert.ok(!('committee' in conf));
});
