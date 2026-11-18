// Score the records produced by researchly_pipeline/eval/credibility_e2e.py with the real engine (no network).
//   node backend/scripts/credibility_eval.mjs <e2e.json> [--md]
import fs from 'node:fs';
import { mapPipelineRecord } from '../src/services/ingestService.js';
import { evaluateConferenceCredibility } from '../src/services/credibilityEngine.js';

const [file, flag] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const sites = new Map((data.enrichment_sites || []).map((s) => [`${s.conference}|${s.year}`, s]));
const short = { pass: 'P', warn: 'W', fail: 'F' };
const rows = data.records.map((rec) => {
  const conf = mapPipelineRecord(rec);
  const a = evaluateConferenceCredibility(conf);
  const site = sites.get(`${rec.acronym || rec.canonical_name}|${rec.year}`) || {};
  return {
    conference: `${rec.acronym || rec.canonical_name} ${rec.year}`,
    enrichment: site.status || 'n/a',
    pages: (site.pages_read || []).length,
    checks_run: a.checks.filter((c) => short[c.status]).map((c) => `${c.id}:${short[c.status]}`).join(' '),
    score: a.overall_score,
    coverage: a.coverage,
    risk: a.risk_level,
    rejected: (site.rejected_quotes || []).map((r) => `[${r.field}] ${r.reason}${r.quote ? `: "${r.quote.slice(0, 90)}"` : ''}`)
  };
});
if (flag === '--md') {
  console.log('| Conference | Enrichment (pages) | Checks that ran (P/W/F) | Score | Coverage | Risk | Rejected quotes |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.conference} | ${r.enrichment} (${r.pages}) | ${r.checks_run} | ${r.score ?? '—'} | ${r.coverage} | ${r.risk} | ${r.rejected.length ? r.rejected.join('<br>').replace(/\|/g, '/') : '0'} |`);
  }
} else {
  console.log(JSON.stringify(rows, null, 1));
}
