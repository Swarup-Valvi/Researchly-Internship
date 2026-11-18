/**
 * Pipeline ingestion: reads researchly_pipeline's conferences.json (file, URL, or POSTed body),
 * validates it, maps it to the store shape, tracks deadline drift, and runs the evidence-based audit.
 * Nothing here generates conference data; records only ever come from the pipeline.
 */
import fs from 'node:fs/promises';
import { store } from '../db/store.js';
import { config } from '../config/env.js';
import { evaluateConferenceCredibility } from './credibilityEngine.js';
import { gatherLookups } from './lookups.js';

const MAX_RECORDS = 2000;

/** Light structural validation (the pipeline already validates against the full JSON Schema). */
export function validatePipelineRecord(r) {
  const errs = [];
  if (!r || typeof r !== 'object') return ['not an object'];
  if (!/^[a-f0-9]{64}$/.test(r.conference_id || '')) errs.push('conference_id must be a sha256 hex string');
  if (!r.canonical_name || typeof r.canonical_name !== 'string') errs.push('canonical_name missing');
  if (!Number.isInteger(r.year) || r.year < 1950 || r.year > 2100) errs.push('year invalid');
  if (!Array.isArray(r.provenance?.source_urls) || r.provenance.source_urls.length === 0) errs.push('provenance.source_urls missing');
  if (typeof r.website_url !== 'string' || !/^https?:\/\//.test(r.website_url)) errs.push('website_url invalid');
  return errs;
}

const hasOffset = (s) => typeof s === 'string' && /T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(s);
const isoDay = (s) => (typeof s === 'string' && s.length >= 10 ? s.slice(0, 10) : null);

export function mapPipelineRecord(rec) {
  const d = rec.dates || {};
  const loc = rec.location || {};
  const place = [loc.city, loc.country].filter(Boolean).join(', ');
  const slugBase = (rec.acronym || rec.canonical_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = `${slugBase}-${rec.year}-${rec.conference_id.slice(0, 6)}`;
  const edNum = parseInt(rec.edition, 10);
  return {
    id,
    slug: id,
    name: rec.acronym || rec.canonical_name,
    title: rec.canonical_name,
    edition: String(rec.year),
    edition_number: Number.isFinite(edNum) ? edNum : null,
    field: rec.topics?.[0] || 'Unclassified',
    topics: rec.topics || [],
    submission_deadline: isoDay(d.submission_deadline),
    // A deadline is a precise instant ONLY when the pipeline resolved its time zone (ISO with offset, e.g.
    // "2026-07-28T23:59-12:00"). Otherwise it is a calendar date and is labelled as such, never shown as a time.
    deadline_at: hasOffset(d.submission_deadline) ? d.submission_deadline : null,
    deadline_precision: hasOffset(d.submission_deadline) ? 'datetime' : (d.submission_deadline ? 'date' : null),
    raw_deadline: d.submission_deadline
      ? (hasOffset(d.submission_deadline)
        ? [d.submission_deadline, d.deadline_timezone].filter(Boolean).join(' ')
        : `${isoDay(d.submission_deadline)} (time zone not stated)`)
      : null,
    notification_date: isoDay(d.notification_date),
    camera_ready: isoDay(d.camera_ready),
    start_date: isoDay(d.conference_start),
    end_date: isoDay(d.conference_end),
    location: loc.is_virtual && !loc.country ? 'Virtual' : (place || null),
    venue: loc.venue || null,
    city: loc.city || null,
    country: loc.country || null,
    format: loc.is_virtual ? (loc.country ? 'Hybrid' : 'Virtual') : 'In-Person',
    publisher: rec.publisher || null,
    organizer: enrichedField(rec, 'organizer')?.value || null,
    fees: rec.fees?.notes || null,
    ranking: rec.ranking_claims?.[0] ? `${rec.ranking_claims[0].system} ${rec.ranking_claims[0].value}` : null,
    official_url: rec.website_url,
    submission_url: null,
    has_paper_submission: true,
    // provenance / evidence carried through to the credibility engine and the UI
    data_origin: 'pipeline',
    needs_verification: false,
    source_primary: rec.provenance.primary_source,
    source_urls: rec.provenance.source_urls,
    pipeline_confidence: rec.provenance.confidence,
    extraction_method: rec.provenance.extraction_method,
    scraped_at: rec.provenance.scraped_at,
    raw_snapshot_ref: rec.raw_snapshot_ref || null,
    indexing_claims: rec.indexing_claims || {},
    sponsors_claimed: rec.sponsors?.claimed || [],
    sponsors_verified_source: rec.sponsors?.verified_source || null,
    claim_snippets: rec.claim_snippets || [],
    // ccfddl / structured-source fields (additive; see migrations/003)
    dblp_key: typeof rec.dblp_key === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(rec.dblp_key) ? rec.dblp_key : null,
    ranking_claims: Array.isArray(rec.ranking_claims)
      ? rec.ranking_claims.filter((r) => r && r.system && r.value && r.source_url)
        .map((r) => ({ system: String(r.system), value: String(r.value), source_url: String(r.source_url) }))
      : [],
    // NOTE: rec.committee is deliberately NOT mapped: member names never reach the store/DB/API.
    // Use committeeForAudit(rec) to pass it transiently to the audit.
    pipeline_conference_id: rec.conference_id,
    // Evidence gathered by the pipeline for the credibility engine (migrations/005). Every quote was verified
    // verbatim against the page it came from; lookups hold aggregate counts only (no committee names).
    evidence: buildEvidence(rec)
  };
}

const str = (v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : null);

/** A grounded-enrichment field that passed the quote gate and was applied: { value, quote, source_url } or null. */
export function enrichedField(rec, name) {
  const f = (rec.enrichment?.fields || []).find((x) => x && x.field === name);
  if (!f || typeof f.quote !== 'string') return null;
  return { value: typeof f.value === 'string' ? str(f.value) : f.value, quote: str(f.quote), source_url: str(f.source_url, 500) };
}

function pipelineLookup(l) {
  if (!l || typeof l !== 'object') return null;
  return { ok: l.ok === true, error: str(l.error, 200), data: l.data && typeof l.data === 'object' ? l.data : {},
    evidence_url: str(l.evidence_url, 500), checked_at: str(l.checked_at, 40) };
}

export function buildEvidence(rec) {
  const e = rec.enrichment || {};
  const lk = rec.lookups || null;
  const datasetUrl = (rec.provenance?.source_urls || []).find((u) => /github\.com\/ccfddl\//.test(u)) || null;
  return {
    series_years: (rec.series_years || []).filter((y) => Number.isInteger(y) && y >= 1950 && y <= 2100),
    series_source_url: datasetUrl,
    organizer: enrichedField(rec, 'organizer'),
    peer_review: enrichedField(rec, 'peer_review_statement'),
    fee_statement: enrichedField(rec, 'registration_fee_text'),
    risk_phrases: (rec.risk_phrases || []).filter((r) => r && r.category && r.quote)
      .map((r) => ({ category: String(r.category), quote: str(r.quote), source_url: str(r.source_url, 500), method: str(r.method, 20) })),
    pages_read: (e.pages_read || []).filter((u) => typeof u === 'string').slice(0, 10),
    enrichment_status: str(e.status, 40),
    enrichment_checked_at: str(e.checked_at, 40),
    rejected_quotes: Number.isInteger(e.hallucination_rejected) ? e.hallucination_rejected : 0,
    lookups: lk ? { dblp: pipelineLookup(lk.dblp), rdap: pipelineLookup(lk.rdap), committee: pipelineLookup(lk.committee) } : null
  };
}

/** Committee names + stated affiliations for the audit only. Never stored, logged or returned by the API. */
export function committeeForAudit(rec) {
  return (rec?.committee || []).filter((m) => m && typeof m.name === 'string')
    .map((m) => ({ name: m.name, affiliation: typeof m.affiliation === 'string' ? m.affiliation : null }));
}

export async function audit(conf, { live, committee, lookupOpts = {} }) {
  const lookups = live ? await gatherLookups(conf, { ...lookupOpts, committee }) : {};
  const a = evaluateConferenceCredibility(conf, lookups);
  await store.saveCredibilityAudit(a);
  // Persist only the aggregate committee summary (counts), so later re-audits can reuse it without names.
  const committee_summary = lookups.committee ?? conf.committee_summary ?? null;
  await store.saveConference({ ...conf, committee_summary, credibility_score: a.overall_score, risk_level: a.risk_level });
  return a;
}

export async function ingestRecords(records, { live = config.enableLiveChecks, lookupOpts = {} } = {}) {
  if (!Array.isArray(records)) throw new Error('expected an array of conference records');
  if (records.length > MAX_RECORDS) throw new Error(`too many records (max ${MAX_RECORDS})`);
  const result = { received: records.length, created: 0, updated: 0, deadline_changes: 0, rejected: [], superseded_seeds: [] };
  for (const rec of records) {
    const errs = validatePipelineRecord(rec);
    if (errs.length) {
      result.rejected.push({ conference_id: rec?.conference_id ?? null, errors: errs });
      continue;
    }
    const conf = mapPipelineRecord(rec);
    const existing = await store.getConferenceById(conf.id);
    if (existing && conf.submission_deadline && existing.submission_deadline && conf.submission_deadline !== existing.submission_deadline) {
      await store.recordDeadlineChange({
        conference_id: conf.id,
        previous_deadline: existing.submission_deadline,
        new_deadline: conf.submission_deadline,
        raw_previous_deadline: existing.raw_deadline,
        raw_new_deadline: conf.raw_deadline,
        change_reason: 'Deadline changed between pipeline runs (detected by comparing scraped values).'
      });
      conf.is_extended = conf.submission_deadline > existing.submission_deadline;
      result.deadline_changes++;
    }
    const saved = await store.saveConference({ ...(existing || {}), ...conf });
    result.superseded_seeds.push(...store.supersedeSeeds(saved));   // pipeline wins over a hand-entered seed
    await audit(saved, { live, committee: committeeForAudit(rec), lookupOpts });
    existing ? result.updated++ : result.created++;
  }
  return result;
}

/** Load the pipeline's output from PIPELINE_OUTPUT_URL or PIPELINE_OUTPUT_PATH. Returns null if neither is set. */
export async function loadPipelineOutput() {
  if (config.pipelineOutputUrl) {
    const res = await fetch(config.pipelineOutputUrl, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`pipeline output fetch failed: HTTP ${res.status}`);
    return res.json();
  }
  if (config.pipelineOutputPath) {
    return JSON.parse(await fs.readFile(config.pipelineOutputPath, 'utf8'));
  }
  return null;
}

export async function syncFromPipeline() {
  const data = await loadPipelineOutput();
  if (data === null) return { skipped: true, reason: 'PIPELINE_OUTPUT_URL / PIPELINE_OUTPUT_PATH not configured' };
  return ingestRecords(data);
}
