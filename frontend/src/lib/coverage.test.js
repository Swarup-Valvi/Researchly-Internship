import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionCoverage, coverageSummary } from './coverage.js';

const audit = {
  domain_score: 100, history_score: null,
  checks: [
    { id: 'https_transport', dimension: 'domain', label: 'HTTPS', status: 'pass', detail: 'ok' },
    { id: 'domain_age', dimension: 'domain', label: 'Domain age', status: 'not_checked', detail: 'Live RDAP lookup not run.' },
    { id: 'dblp_history', dimension: 'history', label: 'DBLP years', status: 'not_checked', detail: 'DBLP lookup not run.' }
  ]
};

test('a dimension ran when any of its checks produced pass/warn/fail; reasons list its not_checked checks', () => {
  const [domain, , , , , history] = dimensionCoverage(audit);
  assert.equal(domain.ran, true); assert.equal(domain.score, 100);
  assert.deepEqual(domain.reasons, [{ label: 'Domain age', reason: 'Live RDAP lookup not run.' }]);
  assert.equal(history.ran, false); assert.deepEqual(history.reasons, [{ label: 'DBLP years', reason: 'DBLP lookup not run.' }]);
});

test('coverage summary uses the 0.30 threshold', () => {
  const s = coverageSummary(audit);
  assert.equal(s.covered, 0.1); assert.equal(s.enough, false); assert.equal(s.ranCount, 1);
  assert.equal(coverageSummary({ checks: [] }).covered, 0);
});

test('info checks never make a dimension count as run', () => {
  const [domain] = dimensionCoverage({ checks: [
    { id: 'https_transport', dimension: 'domain', label: 'HTTPS', status: 'info', detail: 'info only' },
    { id: 'domain_age', dimension: 'domain', label: 'Domain age', status: 'not_checked', detail: 'RDAP not run' }] });
  assert.equal(domain.ran, false);
  assert.deepEqual(domain.info, [{ label: 'HTTPS', detail: 'info only' }]);
});
