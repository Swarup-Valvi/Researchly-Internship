/**
 * Live evidence lookups (opt-in via ENABLE_LIVE_CHECKS=true). Each returns a plain result object and
 * NEVER throws: failures come back as { ok: false, error } so the engine can report "not_checked".
 * `fetchImpl` is injectable for tests.
 */

import { config } from '../config/env.js';

const UA = 'ResearchlyBot/0.1 (+https://researchly-5mq7.onrender.com)';

async function getJson(url, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * DBLP venue search.
 * - With opts.dblpKey (e.g. "aaai" from the ccfddl dataset): found=true only if a hit's URL is exactly
 *   dblp.org/db/conf/<key>/ (or /db/journals/<key>/). The key is matched, never assumed to exist.
 * - Otherwise (name search): found=true only if a hit's acronym or venue name equals the query (case-insensitive).
 */
export async function dblpVenueLookup(acronym, opts = {}) {
  const key = typeof opts.dblpKey === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(opts.dblpKey) ? opts.dblpKey : null;
  const query = key || acronym;
  if (!query) return { ok: false, error: 'no acronym' };
  const url = `https://dblp.org/search/venue/api?q=${encodeURIComponent(query)}&format=json&h=10`;
  try {
    const data = await getJson(url, opts);
    let hits = data?.result?.hits?.hit ?? [];
    if (!Array.isArray(hits)) hits = [hits];
    const q = query.trim().toLowerCase();
    const keyRx = key ? new RegExp(`^https?://dblp\\.org/db/(conf|journals)/${key.toLowerCase()}/?$`) : null;
    const match = hits.map((h) => h.info || {}).find((i) => (keyRx
      ? keyRx.test(String(i.url || '').toLowerCase())
      : [i.acronym, i.venue].filter(Boolean).some((v) => String(v).trim().toLowerCase() === q)));
    return {
      ok: true, found: !!match, matched: match ? (match.venue || match.acronym) : null,
      evidence_url: match?.url || url, checked_at: new Date().toISOString()
    };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

const SECOND_LEVEL = new Set(['co', 'ac', 'edu', 'gov', 'org', 'com', 'net']);
const SHARED_HOSTS = ['github.io', 'sites.google.com', 'wordpress.com', 'wixsite.com', 'blogspot.com', 'netlify.app', 'vercel.app', 'weebly.com'];

export function registrableDomain(host) {
  const parts = host.toLowerCase().split('.');
  if (parts.length <= 2) return host.toLowerCase();
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  return (tld.length === 2 && SECOND_LEVEL.has(sld) ? parts.slice(-3) : parts.slice(-2)).join('.');
}

/** Domain age from RDAP (JSON WHOIS successor). Skips shared hosting where age says nothing. */
export async function rdapDomainAge(websiteUrl, opts = {}) {
  let host;
  try { host = new URL(websiteUrl).hostname; } catch { return { ok: false, error: 'invalid url' }; }
  if (SHARED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return { ok: false, error: 'shared hosting domain' };
  const domain = registrableDomain(host);
  const url = `https://rdap.org/domain/${domain}`;
  try {
    const data = await getJson(url, opts);
    const reg = (data.events || []).find((e) => e.eventAction === 'registration');
    if (!reg?.eventDate) return { ok: false, error: 'no registration date in RDAP response' };
    const registered = new Date(reg.eventDate);
    if (Number.isNaN(registered.getTime())) return { ok: false, error: 'unparseable registration date' };
    const age_days = Math.floor((Date.now() - registered.getTime()) / 86400000);
    return { ok: true, registered_at: registered.toISOString(), age_days, evidence_url: url, checked_at: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

// --- OpenAlex: program-committee members ----------------------------------------------------------

const OPENALEX_TTL_MS = 7 * 24 * 3600 * 1000;
const openAlexCache = new Map(); // key -> { at, value }; only successful lookups are cached
export const COMMITTEE_SAMPLE_SIZE = 10;

export function clearOpenAlexCache() { openAlexCache.clear(); }

/** Lower-case, strip accents and punctuation: "José  Pérez-Ruiz" -> "jose perez ruiz". */
export function normName(s) {
  return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Only grammatical words and "university" in its common spellings are ignored. Words like "institute" or
// "technology" are kept: they are what distinguishes Caltech from the University of California.
const STOP = new Set(['university', 'universidad', 'universite', 'universitat', 'universita', 'of', 'the', 'and', 'for', 'de', 'di',
  'da', 'del', 'la', 'department', 'dept', 'inc', 'ltd']);
const keyTokens = (s) => normName(s).split(' ').filter((t) => t.length > 2 && !STOP.has(t));

/** Same person name: identical normalized tokens as a set, or same surname + same first initial. */
export function sameName(a, b) {
  const x = normName(a).split(' ').filter(Boolean); const y = normName(b).split(' ').filter(Boolean);
  if (!x.length || !y.length) return false;
  if ([...x].sort().join(' ') === [...y].sort().join(' ')) return true;
  return x[x.length - 1] === y[y.length - 1] && x[0][0] === y[0][0];
}

/**
 * Institutions match when their distinctive tokens are identical as a set, or the shorter name has 2+ distinctive
 * tokens that all appear in the longer one. Deliberately strict: "University of California" does NOT match
 * "California Institute of Technology". A missed match only lowers confidence; a false match would be a false pass.
 */
export function sameInstitution(stated, candidate) {
  const a = [...new Set(keyTokens(stated))]; const b = [...new Set(keyTokens(candidate))];
  if (!a.length || !b.length) return false;
  if (a.length === b.length && a.every((t) => b.includes(t))) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 2 && short.every((t) => long.includes(t));
}

function institutionsOf(author) {
  const names = [
    ...(author.last_known_institutions || []).map((i) => i?.display_name),
    author.last_known_institution?.display_name,
    ...(author.affiliations || []).map((a) => a?.institution?.display_name)
  ];
  return [...new Set(names.filter(Boolean))];
}

/**
 * Look up one committee member on OpenAlex. Never throws.
 * -> { ok:true, name, affiliation, resolved, institution_match, author_id, matched_institution, evidence_url, checked_at }
 *    resolved: an OpenAlex author with the same name exists; institution_match: one of those authors is (or was)
 *    affiliated with the stated institution (null when the page states no affiliation).
 */
export async function openAlexAuthorLookup(name, affiliation, opts = {}) {
  if (!name) return { ok: false, error: 'no name' };
  const key = `${normName(name)}|${normName(affiliation)}`;
  const hit = openAlexCache.get(key);
  if (hit && Date.now() - hit.at < OPENALEX_TTL_MS) return hit.value;
  const mailto = opts.mailto ?? '';
  const url = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per-page=10` +
    (mailto ? `&mailto=${encodeURIComponent(mailto)}` : '');
  const publicUrl = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}`; // evidence link without the mailto
  try {
    const data = await getJson(url, opts);
    const candidates = (data?.results || []).filter((a) => sameName(name, a.display_name));
    let best = null; let inst = null;
    if (affiliation) {
      for (const a of candidates) {
        inst = institutionsOf(a).find((i) => sameInstitution(affiliation, i));
        if (inst) { best = a; break; }
      }
    }
    best = best || candidates[0] || null;
    const value = {
      ok: true, name, affiliation: affiliation || null,
      resolved: candidates.length > 0,
      institution_match: affiliation ? Boolean(inst) : null,
      author_id: best?.id || null,
      matched_institution: inst || null,
      evidence_url: best?.id ? best.id.replace('https://openalex.org/', 'https://api.openalex.org/authors/') : publicUrl,
      checked_at: new Date().toISOString()
    };
    openAlexCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

/** Evenly spaced, deterministic sample (same committee -> same sample on every run). */
export function sampleMembers(members, n = COMMITTEE_SAMPLE_SIZE) {
  if (members.length <= n) return members.slice();
  const step = members.length / n;
  return Array.from({ length: n }, (_, i) => members[Math.floor(i * step)]);
}

/**
 * Sequential lookups for a sample of the committee (sequential = gentle on the API). Never throws.
 * PRIVACY: returns AGGREGATE COUNTS ONLY. Member names, affiliations and OpenAlex author URLs are used inside this
 * function and never returned, so nothing downstream (engine, store, API) can persist or expose them.
 */
export async function committeeLookup(committee, opts = {}) {
  const members = (committee || []).filter((m) => m && typeof m.name === 'string' && m.name.trim());
  if (!members.length) return { ok: false, error: 'no committee listed' };
  const sample = sampleMembers(members, opts.sampleSize);
  const results = [];
  for (const m of sample) results.push(await openAlexAuthorLookup(m.name, m.affiliation, opts));
  const done = results.filter((r) => r.ok);
  if (!done.length) return { ok: false, error: `all ${results.length} OpenAlex lookups failed (${results[0]?.error || 'unknown'})` };
  const withAff = done.filter((r) => r.affiliation);
  return {
    ok: true,
    listed: members.length,
    sampled: sample.length,
    looked_up: done.length,
    failed_lookups: results.length - done.length,
    resolved: done.filter((r) => r.resolved).length,
    with_stated_affiliation: withAff.length,
    institution_matches: withAff.filter((r) => r.institution_match).length,
    checked_at: new Date().toISOString()
  };
}

/**
 * opts.committee: the pipeline's committee list, passed TRANSIENTLY by the caller (it is never stored on the
 * conference). When opts.committee is undefined (e.g. a periodic re-audit) no committee lookup is made and the key is
 * omitted, so the engine falls back to the stored aggregate summary.
 */
export async function gatherLookups(conf, opts = {}) {
  const mailto = opts.mailto ?? config.openAlexMailto;
  const [dblp, rdap] = await Promise.all([
    dblpVenueLookup(conf.acronym || conf.name, { ...opts, dblpKey: conf.dblp_key }),
    conf.official_url ? rdapDomainAge(conf.official_url, opts) : Promise.resolve({ ok: false, error: 'no website' })
  ]);
  if (opts.committee === undefined) return { dblp, rdap };
  const committee = await committeeLookup(opts.committee, { ...opts, mailto });
  return { dblp, rdap, committee };
}
