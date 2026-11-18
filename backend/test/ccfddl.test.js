import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';
import { dblpVenueLookup, gatherLookups } from '../src/services/lookups.js';
import { mapPipelineRecord } from '../src/services/ingestService.js';

const YAML_URL = 'https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/aaai.yml';
const byId = (a, id) => a.checks.find((c) => c.id === id);
const json = (body, status = 200) => async (url) => ({ ok: status < 400, status, json: async () => body, url });

test('rank_listing: pass with community-dataset evidence and the required wording', () => {
  const a = evaluateConferenceCredibility({ id: 'x', ranking_claims: [
    { system: 'CORE', value: 'A*', source_url: YAML_URL }, { system: 'CCF', value: 'A', source_url: YAML_URL }] });
  const c = byId(a, 'rank_listing');
  assert.equal(c.status, 'pass');
  assert.equal(c.evidence.kind, 'community_dataset');
  assert.equal(c.evidence.url, YAML_URL);
  assert.match(c.detail, /listed in a community-maintained dataset, not verified against CORE's own site/);
  assert.match(c.detail, /CORE A\*, CCF A/);
  assert.doesNotMatch(c.detail, /\bverified (by|against) CORE\b(?!'s own site)/);
});

test('rank_listing: not_checked when absent or not from the community dataset', () => {
  assert.equal(byId(evaluateConferenceCredibility({ id: 'x' }), 'rank_listing').status, 'not_checked');
  const other = evaluateConferenceCredibility({ id: 'x', ranking_claims: [{ system: 'CORE', value: 'A', source_url: 'https://example.org/claims' }] });
  assert.equal(byId(other, 'rank_listing').status, 'not_checked');
  const legacy = evaluateConferenceCredibility({ id: 'x', ranking: 'Core A*' });           // free-text ranking earns nothing
  assert.equal(byId(legacy, 'rank_listing').status, 'not_checked');
});

test('gatherLookups passes the record dblp_key to the DBLP SPARQL lookup', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: false, status: 503, json: async () => ({}) }; };
  await gatherLookups({ name: 'AAAI Conference on Artificial Intelligence', acronym: 'AAAI', dblp_key: 'aaai' }, { fetchImpl, mailto: '' });
  assert.ok(calls.some((u) => u.startsWith('https://sparql.dblp.org/sparql?') && decodeURIComponent(u).includes('<https://dblp.org/streams/conf/aaai>')));
});

test('mapPipelineRecord passes dblp_key and ranking_claims through (validated)', () => {
  const rec = { conference_id: 'c'.repeat(64), canonical_name: 'AAAI Conference on Artificial Intelligence', acronym: 'AAAI', year: 2027,
    website_url: 'https://aaai.org/conference/aaai/aaai-27/', dblp_key: 'aaai',
    ranking_claims: [{ system: 'CORE', value: 'A*', source_url: YAML_URL }, { system: 'CCF' }],
    provenance: { primary_source: 'ccfddl', source_urls: [YAML_URL] } };
  const m = mapPipelineRecord(rec);
  assert.equal(m.dblp_key, 'aaai');
  assert.deepEqual(m.ranking_claims, [{ system: 'CORE', value: 'A*', source_url: YAML_URL }]);
  assert.equal(m.source_primary, 'ccfddl');
  assert.equal(mapPipelineRecord({ ...rec, dblp_key: 'bad key; drop table' }).dblp_key, null);
});

test('LLM-sourced indexing claims stay claims: never a verified status', () => {
  const a = evaluateConferenceCredibility({ id: 'x', indexing_claims: { scopus: 'claimed', wos: 'claimed', dblp: 'claimed' },
    claim_snippets: ['Proceedings will be submitted for indexing in Scopus and DBLP.'] });
  assert.equal(byId(a, 'scopus_wos_verification').status, 'not_checked');
  assert.equal(byId(a, 'dblp_presence').status, 'not_checked');                              // a claim is not a DBLP lookup
  assert.ok(!a.checks.some((c) => c.status === 'verified'));
  assert.ok(!JSON.stringify(a.checks.map((c) => c.status)).includes('verified'));
});

test('ingest of a real pipeline ccfddl record (generated from the trimmed AAAI fixture) stores dblp_key + ranks and passes rank_listing', async () => {
  const fs = await import('node:fs');
  const { ingestRecords } = await import('../src/services/ingestService.js');
  const { store } = await import('../src/db/store.js');
  const rec = JSON.parse(fs.readFileSync(new URL('./fixtures_ccfddl_aaai2027.json', import.meta.url)));
  const res = await ingestRecords([rec], { live: false });
  assert.deepEqual(res.rejected, []);
  const id = mapPipelineRecord(rec).id;
  const conf = await store.getConferenceById(id);
  assert.equal(conf.dblp_key, 'aaai'); assert.equal(conf.source_primary, 'ccfddl');
  assert.equal(conf.submission_deadline, '2026-07-28');
  const audit = await store.getCredibilityAudit(id);
  assert.equal(audit.checks.find((c) => c.id === 'rank_listing').status, 'pass');
});

test('pipeline record wins over the curated_seed record for the same conference + year; seed marked superseded', async () => {
  const fs = await import('node:fs');
  const { ingestRecords } = await import('../src/services/ingestService.js');
  const { store, conferenceYearKey } = await import('../src/db/store.js');
  // Real pipeline output generated from ccfddl (NeurIPS 2026, ACL 2026, CHI 2026); the seed list has NeurIPS 2026,
  // ACL 2026 and "ACM CHI" 2026.
  const recs = JSON.parse(fs.readFileSync(new URL('./fixtures_ccfddl_seed_overlap.json', import.meta.url)));
  assert.equal(conferenceYearKey({ name: 'ACM CHI', edition: '2026' }), conferenceYearKey({ name: 'CHI', edition: '2026' }));
  const before = await store.getConferences({});
  const seedIds = before.filter((c) => c.data_origin === 'curated_seed' && ['neurips', 'acl', 'chi']
    .some((n) => conferenceYearKey(c) === `${n}|2026`)).map((c) => c.id);
  assert.equal(seedIds.length, 3, 'seed list contains NeurIPS, ACL and ACM CHI 2026');

  const res = await ingestRecords(recs, { live: false });
  assert.deepEqual(res.rejected, []);
  assert.deepEqual([...res.superseded_seeds].sort(), [...seedIds].sort());

  const after = await store.getConferences({});
  for (const key of ['neurips|2026', 'acl|2026', 'chi|2026']) {
    const shown = after.filter((c) => conferenceYearKey(c) === key);
    assert.equal(shown.length, 1, `exactly one ${key} listed`);
    assert.equal(shown[0].data_origin, 'pipeline');
  }
  for (const id of seedIds) {
    const seed = await store.getConferenceById(id);
    assert.equal(seed.superseded, true);
    assert.match(seed.superseded_by, /-2026-[0-9a-f]{6}$/);
  }
  const acl = after.find((c) => conferenceYearKey(c) === 'acl|2026');
  assert.equal(acl.location, 'San Diego, United States');       // ccfddl value, not the seed's
  const neurips = after.find((c) => conferenceYearKey(c) === 'neurips|2026');
  assert.equal(neurips.location, null);                        // multi-site place: left empty, not guessed
  assert.equal(neurips.country, null);
});

test('a deadline without a known time zone is a date, never a precise time', () => {
  const base = { conference_id: 'd'.repeat(64), canonical_name: 'IEEE International Conference on Data Engineering', acronym: 'ICDE',
    year: 2027, website_url: 'https://icde2027.github.io/', provenance: { primary_source: 'ccfddl', source_urls: [YAML_URL] } };
  const pt = mapPipelineRecord({ ...base, dates: { submission_deadline: '2026-06-11', deadline_timezone: null } });   // ccfddl 'PT'
  assert.equal(pt.deadline_precision, 'date');
  assert.equal(pt.deadline_at, null);
  assert.equal(pt.raw_deadline, '2026-06-11 (time zone not stated)');
  assert.doesNotMatch(pt.raw_deadline, /\d{2}:\d{2}/);
  const aoe = mapPipelineRecord({ ...base, dates: { submission_deadline: '2026-07-28T23:59-12:00', deadline_timezone: 'AoE' } });
  assert.equal(aoe.deadline_precision, 'datetime');
  assert.equal(aoe.deadline_at, '2026-07-28T23:59-12:00');
  assert.equal(aoe.submission_deadline, '2026-07-28');
  const none = mapPipelineRecord({ ...base, dates: {} });
  assert.equal(none.deadline_precision, null); assert.equal(none.raw_deadline, null);
  // the engine does not read deadlines at all: same audit with and without a time
  const strip = (a) => JSON.stringify(a.checks.map((c) => [c.id, c.status]));
  assert.equal(strip(evaluateConferenceCredibility(pt)), strip(evaluateConferenceCredibility(aoe)));
});
