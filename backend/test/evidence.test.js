import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';
import { mapPipelineRecord, buildEvidence } from '../src/services/ingestService.js';

const SITE = 'https://fict2027.example.org/';
const byId = (a, id) => a.checks.find((c) => c.id === id);
const base = (evidence = {}, extra = {}) => ({ id: 'fict-2027', name: 'FICT', official_url: SITE, evidence, ...extra });
const q = (quote, value = null) => ({ value, quote, source_url: SITE });

test('unknown stays not_checked: no pages read, no lookups', () => {
  const a = evaluateConferenceCredibility(base());
  for (const id of ['risk_phrases', 'peer_review_statement', 'organizer_named', 'fee_transparency', 'dblp_presence', 'dblp_history', 'dataset_history']) {
    assert.equal(byId(a, id).status, 'not_checked', id);
  }
  assert.match(byId(a, 'risk_phrases').detail, /not been read/);
});

test('risk phrase: guaranteed acceptance fails with the quote as evidence; a short review only warns', () => {
  const quote = 'We guarantee acceptance for all registered papers.';
  const a = evaluateConferenceCredibility(base({ pages_read: [SITE],
    risk_phrases: [{ category: 'fast_review', quote: 'Decision within 2 days.', source_url: SITE, method: 'pattern' },
      { category: 'guaranteed_acceptance', quote, source_url: SITE, method: 'pattern' }] }));
  const c = byId(a, 'risk_phrases');
  assert.equal(c.status, 'fail'); assert.ok(c.detail.includes(quote));
  assert.equal(c.evidence.url, SITE); assert.equal(c.evidence.observed.length, 2);
  assert.equal(a.risk_level, 'High');
  const w = evaluateConferenceCredibility(base({ pages_read: [SITE],
    risk_phrases: [{ category: 'no_named_committee', quote: 'Program Committee: TBA', source_url: SITE, method: 'llm_grounded' }] }));
  assert.equal(byId(w, 'risk_phrases').status, 'warn');
});

test('risk phrase: pages read and nothing found -> pass, naming how many pages were scanned', () => {
  const a = evaluateConferenceCredibility(base({ pages_read: [SITE, `${SITE}proceedings`] }));
  const c = byId(a, 'risk_phrases');
  assert.equal(c.status, 'pass'); assert.match(c.detail, /2 page\(s\)/);
});

test('peer review, organizer, fee transparency pass only with a verified quote', () => {
  const a = evaluateConferenceCredibility(base({ pages_read: [SITE],
    peer_review: q('All papers undergo double-blind peer review.'),
    organizer: q('Organised by the Fictional Computing Society.', 'Fictional Computing Society'),
    fee_statement: q('Registration fee: USD 450 for regular authors.') }, { organizer: 'Fictional Computing Society' }));
  assert.equal(byId(a, 'peer_review_statement').status, 'pass');
  assert.equal(byId(a, 'peer_review_statement').evidence.observed, 'All papers undergo double-blind peer review.');
  assert.equal(byId(a, 'organizer_named').status, 'pass');
  assert.equal(byId(a, 'fee_transparency').status, 'pass');
  const noAmount = evaluateConferenceCredibility(base({ pages_read: [SITE], fee_statement: q('Registration fees will be announced soon.') }));
  assert.equal(byId(noAmount, 'fee_transparency').status, 'not_checked');
  assert.match(byId(noAmount, 'fee_transparency').detail, /states no amount/);
  assert.match(byId(noAmount, 'peer_review_statement').detail, /do not describe the review process/);
});

const lookups = {
  dblp: { ok: true, data: { found: true, title: 'Fictional Computing (FICT)', years_with_publications: 12, first_year: 2014, last_year: 2026 },
    evidence_url: 'https://dblp.org/db/conf/fict/', checked_at: '2026-11-18T00:00:00Z' },
  rdap: { ok: true, data: { registered_at: '2001-05-01T00:00:00+00:00', age_days: 9000 }, evidence_url: 'https://rdap.org/domain/example.org', checked_at: '2026-11-18T00:00:00Z' },
  committee: { ok: false, error: 'no committee listed', checked_at: '2026-11-18T00:00:00Z' }
};

test('pipeline-stored lookups feed DBLP indexing (labelled not Scopus), history and domain age', () => {
  const a = evaluateConferenceCredibility(base({ lookups, series_years: [2019, 2021, 2023, 2025, 2026, 2027],
    series_source_url: 'https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/fict.yml' }));
  const d = byId(a, 'dblp_presence');
  assert.equal(d.status, 'pass'); assert.match(d.label, /DBLP \(not Scopus/); assert.match(d.detail, /not Scopus/);
  assert.equal(byId(a, 'dblp_history').status, 'pass'); assert.match(byId(a, 'dblp_history').detail, /12 distinct years \(2014–2026\)/);
  assert.equal(byId(a, 'dataset_history').status, 'pass'); assert.match(byId(a, 'dataset_history').detail, /6 editions listed/);
  assert.equal(byId(a, 'domain_age').status, 'pass');
  assert.match(byId(a, 'committee_verification').detail, /No program committee listed/);
  assert.equal(byId(a, 'scopus_wos_verification').status, 'not_checked');
});

test('a fresh request-time lookup wins over the stored one; a failed stored lookup is not_checked with its reason', () => {
  const fresh = { ok: true, found: false, matched: null, evidence_url: 'x', checked_at: 'now' };
  assert.equal(byId(evaluateConferenceCredibility(base({ lookups }), { dblp: fresh }), 'dblp_presence').status, 'warn');
  const failed = evaluateConferenceCredibility(base({ lookups: { dblp: { ok: false, error: 'disallowed by robots.txt' } } }));
  assert.match(byId(failed, 'dblp_presence').detail, /disallowed by robots\.txt/);
});

test('few editions are neutral, never negative', () => {
  const a = evaluateConferenceCredibility(base({ series_years: [2026, 2027],
    lookups: { dblp: { ...lookups.dblp, data: { ...lookups.dblp.data, years_with_publications: 2, first_year: 2025 } } } }));
  assert.equal(byId(a, 'dblp_history').status, 'not_checked'); assert.equal(byId(a, 'dataset_history').status, 'not_checked');
});

test('evidence mapping keeps only applied, quote-verified fields and aggregate lookups', () => {
  const rec = {
    conference_id: 'c'.repeat(64), canonical_name: 'International Conference on Fictional Computing', acronym: 'FICT', year: 2027,
    website_url: SITE, series_years: [2019, 2027, 'x'],
    provenance: { primary_source: 'ccfddl', source_urls: ['https://github.com/ccfddl/ccf-deadlines/blob/main/conference/AI/fict.yml'] },
    enrichment: { status: 'enriched', checked_at: '2026-11-18T00:00:00Z', pages_read: [SITE], hallucination_rejected: 2,
      fields: [{ field: 'organizer', value: 'Fictional Computing Society', quote: 'Organised by the Fictional Computing Society.', source_url: SITE },
        { field: 'peer_review_statement', value: 'double-blind peer review', quote: 'All papers undergo double-blind peer review.', source_url: SITE }] },
    risk_phrases: [{ category: 'fast_review', quote: 'Decision within 2 days.', source_url: SITE, method: 'pattern', found_at: 'x' }],
    lookups: { committee: { ok: true, data: { looked_up: 5, resolved: 4 }, checked_at: 'x' } }
  };
  const m = mapPipelineRecord(rec);
  assert.equal(m.organizer, 'Fictional Computing Society');
  const e = m.evidence;
  assert.deepEqual(e.series_years, [2019, 2027]);
  assert.equal(e.peer_review.quote, 'All papers undergo double-blind peer review.');
  assert.equal(e.fee_statement, null); assert.equal(e.rejected_quotes, 2);
  assert.deepEqual(e.risk_phrases, [{ category: 'fast_review', quote: 'Decision within 2 days.', source_url: SITE, method: 'pattern' }]);
  assert.deepEqual(e.lookups.committee.data, { looked_up: 5, resolved: 4 });
  assert.equal(buildEvidence({ provenance: { source_urls: [] } }).lookups, null);
});

test('HTTPS is information only; the domain dimension is scored only once RDAP domain age has run', () => {
  const noRdap = evaluateConferenceCredibility(base());
  assert.equal(byId(noRdap, 'https_transport').status, 'info');
  assert.equal(noRdap.domain_score, null);
  assert.ok(!noRdap.positive_indicators.some((l) => l.startsWith('Website uses HTTPS')));
  const withRdap = evaluateConferenceCredibility(base({ lookups: { rdap: lookups.rdap } }));
  assert.equal(withRdap.domain_score, 100);                         // from domain_age only
});

test('below 0.30 coverage the score is withheld: overall_score null, figure only as provisional_score', () => {
  // rank listing (indexing 0.15) + DBLP presence -> coverage 0.15 < 0.30
  const low = evaluateConferenceCredibility(base({ lookups: { dblp: lookups.dblp } }));
  assert.ok(low.coverage < 0.30);
  assert.equal(low.overall_score, null);
  assert.equal(low.provisional_score, 100);
  assert.equal(low.risk_level, 'Insufficient evidence');
  // enough coverage: a real score, no provisional figure
  const ok = evaluateConferenceCredibility(base({ lookups, series_years: [2019, 2021, 2023, 2025, 2027], pages_read: [SITE] }));
  assert.ok(ok.coverage >= 0.30);
  assert.equal(typeof ok.overall_score, 'number');
  assert.equal(ok.provisional_score, null);
});

test('a failed check still means High risk even when the score is withheld', () => {
  const a = evaluateConferenceCredibility(base({ pages_read: [SITE],
    risk_phrases: [{ category: 'guaranteed_acceptance', quote: 'We guarantee acceptance.', source_url: SITE, method: 'pattern' }] }));
  assert.equal(a.overall_score, null);
  assert.equal(a.risk_level, 'High');
});
