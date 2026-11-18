import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';

const byId = (a, id) => a.checks.find((c) => c.id === id);

test('a famous name earns nothing: no data -> insufficient evidence, no score', () => {
  const a = evaluateConferenceCredibility({ id: 'x', name: 'NeurIPS', title: 'NeurIPS', ranking: 'Core A*' });
  assert.equal(a.overall_score, null);
  assert.equal(a.risk_level, 'Insufficient evidence');
  assert.equal(a.coverage, 0);
  assert.ok(a.missing_information.length >= 8);
});

test('unchecked dimensions are null, never defaulted to a good score', () => {
  const a = evaluateConferenceCredibility({ id: 'x', official_url: 'https://conf.example.org' });
  assert.equal(a.tpc_score, null);
  assert.equal(a.venue_score, null);
  assert.equal(a.domain_score, null);                                // HTTPS alone does not score the domain dimension
  assert.equal(byId(a, 'https_transport').status, 'info');
});

test('pay-to-publish wording is a failed check with its evidence and drives High risk', () => {
  const a = evaluateConferenceCredibility({
    id: 'x', official_url: 'https://gcir.example.net', source_urls: ['https://gcir.example.net'],
    claim_snippets: ['Guaranteed acceptance within 48 hours.', 'All papers are Scopus indexed.']
  });
  const c = byId(a, 'fee_red_flags');
  assert.equal(c.status, 'fail');
  assert.match(c.evidence.observed, /Guaranteed acceptance/);
  assert.equal(c.evidence.url, 'https://gcir.example.net');
  assert.equal(a.risk_level, 'High');
  assert.equal(a.contradictions.length, 1);
});

test('submission via webmail/mailto fails; recognised review platform passes', () => {
  assert.equal(byId(evaluateConferenceCredibility({ id: 'x', submission_url: 'mailto:chair@gmail.com' }), 'submission_channel').status, 'fail');
  assert.equal(byId(evaluateConferenceCredibility({ id: 'x', submission_url: 'https://openreview.net/group?id=X' }), 'submission_channel').status, 'pass');
  assert.equal(byId(evaluateConferenceCredibility({ id: 'x', submission_url: 'https://myownsite.example/submit' }), 'submission_channel').status, 'not_checked');
});

test('claimed IEEE sponsorship: warn unless the publisher listing contains it', () => {
  const base = { id: 'x', sponsors_claimed: ['Technically co-sponsored by the IEEE Computer Society.'] };
  assert.equal(byId(evaluateConferenceCredibility(base), 'sponsorship_claim').status, 'warn');
  const ok = evaluateConferenceCredibility({ ...base, sponsors_verified_source: 'https://www.ieee.org/conferences/' });
  const c = byId(ok, 'sponsorship_claim');
  assert.equal(c.status, 'pass');
  assert.equal(c.evidence.url, 'https://www.ieee.org/conferences/');
});

test('Scopus/WoS claims are never marked verified; the engine says how to verify', () => {
  const a = evaluateConferenceCredibility({ id: 'x', indexing_claims: { scopus: 'claimed', wos: 'unknown', dblp: 'unknown' } });
  const c = byId(a, 'scopus_wos_verification');
  assert.equal(c.status, 'not_checked');
  assert.match(c.detail, /scopus/i);
});

test('low edition numbers are neutral, not negative', () => {
  const a = evaluateConferenceCredibility({ id: 'x', edition_number: 1 });
  assert.equal(byId(a, 'edition_history').status, 'not_checked');
});

test('well-evidenced record gets Low risk with explicit coverage', () => {
  const a = evaluateConferenceCredibility({
    id: 'x', official_url: 'https://icml.cc', publisher: 'PMLR', organizer: 'International Machine Learning Society',
    submission_url: 'https://openreview.net/x', edition_number: 44, fees: '$780 Regular / $320 Student'
  });
  assert.equal(a.risk_level, 'Low');
  assert.ok(a.coverage >= 0.45 && a.coverage < 1);
  assert.ok(a.limitations.length > 0);
});

test('hard-coded legacy score fields on the record are ignored', () => {
  const a = evaluateConferenceCredibility({ id: 'x', credibility_score: 99, risk_level: 'Low' });
  assert.equal(a.overall_score, null);
});
