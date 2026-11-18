import test from 'node:test';
import assert from 'node:assert/strict';
import { dblpVenueLookup, rdapDomainAge, registrableDomain } from '../src/services/lookups.js';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';

const json = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });

const sparql = (title, years, first, last) => ({ results: { bindings: [title
  ? { title: { value: title }, years: { value: String(years) }, first: { value: String(first) }, last: { value: String(last) } }
  : { years: { value: '0' } }] } });

test('DBLP (SPARQL by key): found with years of publications; unknown key not found; no key not looked up', async () => {
  const calls = [];
  const r = await dblpVenueLookup('ICML', { dblpKey: 'icml', fetchImpl: async (u) => { calls.push(u); return json(sparql('ICML', 40, 1985, 2026))(); } });
  assert.equal(r.ok, true); assert.equal(r.found, true); assert.equal(r.years_with_publications, 40); assert.equal(r.first_year, 1985);
  assert.equal(r.evidence_url, 'https://dblp.org/db/conf/icml/');
  assert.match(calls[0], /^https:\/\/sparql\.dblp\.org\/sparql\?query=/);
  assert.ok(!calls[0].includes('search/venue'));                                        // disallowed by dblp robots.txt
  assert.equal((await dblpVenueLookup('ZZZ', { dblpKey: 'zzz', fetchImpl: json(sparql(null)) })).found, false);
  assert.deepEqual(await dblpVenueLookup('ICML', { fetchImpl: json(sparql('ICML', 1, 1, 1)) }), { ok: false, error: 'no dblp_key' });
});

test('lookups never throw: HTTP errors and timeouts become ok:false', async () => {
  assert.deepEqual((await dblpVenueLookup('ICML', { dblpKey: 'icml', fetchImpl: json({}, 500) })).ok, false);
  const slow = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const r = await dblpVenueLookup('ICML', { dblpKey: 'icml', fetchImpl: slow, timeoutMs: 20 });
  assert.equal(r.ok, false); assert.equal(r.error, 'timeout');
});

test('RDAP: domain age computed; shared hosting skipped', async () => {
  const body = { events: [{ eventAction: 'registration', eventDate: '2015-01-01T00:00:00Z' }] };
  const r = await rdapDomainAge('https://www.iclr.cc/page', { fetchImpl: json(body) });
  assert.equal(r.ok, true); assert.ok(r.age_days > 365 * 5); assert.match(r.evidence_url, /rdap\.org\/domain\/iclr\.cc$/);
  assert.equal((await rdapDomainAge('https://someone.github.io/conf', { fetchImpl: json(body) })).ok, false);
  assert.equal(registrableDomain('cs.ox.ac.uk'), 'ox.ac.uk');
});

test('engine turns live evidence into checks, and a brand-new domain is a failed check', () => {
  const young = { ok: true, registered_at: new Date(Date.now() - 30 * 86400000).toISOString(), age_days: 30, evidence_url: 'https://rdap.org/domain/x.org' };
  const a = evaluateConferenceCredibility({ id: 'x', official_url: 'https://x.org' }, { rdap: young, dblp: { ok: true, found: false, evidence_url: 'u' } });
  assert.equal(a.checks.find((c) => c.id === 'domain_age').status, 'fail');
  assert.equal(a.checks.find((c) => c.id === 'dblp_presence').status, 'warn');
  assert.equal(a.risk_level, 'High');
  const failed = evaluateConferenceCredibility({ id: 'x' }, { dblp: { ok: false, error: 'timeout' } });
  assert.match(failed.checks.find((c) => c.id === 'dblp_presence').detail, /timeout/);
});
