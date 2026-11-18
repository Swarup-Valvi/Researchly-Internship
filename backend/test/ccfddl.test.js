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

test('DBLP lookup uses dblp_key when present: matched by exact /db/conf/<key>/ URL', async () => {
  const calls = [];
  const body = { result: { hits: { hit: [
    { info: { venue: 'AAAI Fall Symposia', url: 'https://dblp.org/db/conf/aaaifs/' } },
    { info: { venue: 'AAAI Conference on Artificial Intelligence', acronym: 'AAAI', url: 'https://dblp.org/db/conf/aaai/' } }] } } };
  const fetchImpl = async (url) => { calls.push(url); return json(body)(url); };
  const r = await dblpVenueLookup('Some Long Name', { fetchImpl, dblpKey: 'aaai' });
  assert.equal(r.ok, true); assert.equal(r.found, true); assert.equal(r.evidence_url, 'https://dblp.org/db/conf/aaai/');
  assert.match(calls[0], /q=aaai&/);
  const miss = await dblpVenueLookup('X', { fetchImpl: json({ result: { hits: { hit: [{ info: { url: 'https://dblp.org/db/conf/aaaifs/' } }] } } }), dblpKey: 'aaai' });
  assert.equal(miss.found, false);                                                            // prefix match is not a match
  const byName = await dblpVenueLookup('AAAI', { fetchImpl: json(body) });                   // no key: old name search
  assert.equal(byName.found, true);
});

test('gatherLookups passes the record dblp_key to the DBLP lookup', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: false, status: 503, json: async () => ({}) }; };
  await gatherLookups({ name: 'AAAI Conference on Artificial Intelligence', acronym: 'AAAI', dblp_key: 'aaai' }, { fetchImpl, mailto: '' });
  assert.ok(calls.some((u) => u.includes('dblp.org/search/venue/api?q=aaai&')));
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
