// Runs the backend credibility engine OFFLINE (no lookups) on pipeline records read from stdin (JSON array).
// Prints a JSON array of { conference_id, risk_level, overall_score, coverage }. Used by eval/score.py.
// Backend modules log banners to stdout on import; keep stdout for our JSON only.
console.log = (...args) => console.error(...args);
const { evaluateConferenceCredibility } = await import('../../backend/src/services/credibilityEngine.js');
const { mapPipelineRecord } = await import('../../backend/src/services/ingestService.js');

let input = '';
for await (const chunk of process.stdin) input += chunk;
const out = JSON.parse(input).map((rec) => {
  const a = evaluateConferenceCredibility(mapPipelineRecord(rec), {});
  return { conference_id: rec.conference_id, risk_level: a.risk_level, overall_score: a.overall_score, coverage: a.coverage };
});
process.stdout.write(JSON.stringify(out));
process.exit(0);
