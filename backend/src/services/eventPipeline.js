/**
 * Seed-and-audit pass. Conference records come from (a) the developer-curated seed list
 * (tagged `curated_seed`, unverified) and (b) the scraping pipeline via ingestService.
 * Audits are computed from evidence only; this module never creates or "discovers" conferences.
 */
import { store } from '../db/store.js';
import { evaluateConferenceCredibility } from './credibilityEngine.js';
import { gatherLookups } from './lookups.js';
import { config } from '../config/env.js';
import { REAL_ACADEMIC_EVENTS } from '../db/realEvents.js';
import { syncFromPipeline } from './ingestService.js';

export { REAL_ACADEMIC_EVENTS };

/** Re-audit every stored conference (adds live DBLP/RDAP evidence when ENABLE_LIVE_CHECKS=true). */
export async function reauditAll() {
  const all = await store.getConferences({});
  let audited = 0;
  for (const c of all) {
    const lookups = config.enableLiveChecks ? await gatherLookups(c) : {};
    const a = evaluateConferenceCredibility(c, lookups);
    await store.saveCredibilityAudit(a);
    await store.saveConference({ ...c, credibility_score: a.overall_score, risk_level: a.risk_level });
    audited++;
  }
  return audited;
}

export async function runEventPipeline() {
  const ingest = await syncFromPipeline();
  const audited = await reauditAll();
  return { timestamp: new Date().toISOString(), ingest, audited_count: audited };
}
