/**
 * Live evidence lookups (opt-in via ENABLE_LIVE_CHECKS=true). Each returns a plain result object and
 * NEVER throws: failures come back as { ok: false, error } so the engine can report "not_checked".
 * `fetchImpl` is injectable for tests.
 */

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

/** DBLP venue search. found=true only if a hit's acronym or venue name equals the query (case-insensitive). */
export async function dblpVenueLookup(acronym, opts = {}) {
  if (!acronym) return { ok: false, error: 'no acronym' };
  const url = `https://dblp.org/search/venue/api?q=${encodeURIComponent(acronym)}&format=json&h=10`;
  try {
    const data = await getJson(url, opts);
    let hits = data?.result?.hits?.hit ?? [];
    if (!Array.isArray(hits)) hits = [hits];
    const q = acronym.trim().toLowerCase();
    const match = hits.map((h) => h.info || {}).find((i) =>
      [i.acronym, i.venue].filter(Boolean).some((v) => String(v).trim().toLowerCase() === q));
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

export async function gatherLookups(conf, opts = {}) {
  const [dblp, rdap] = await Promise.all([
    dblpVenueLookup(conf.acronym || conf.name, opts),
    conf.official_url ? rdapDomainAge(conf.official_url, opts) : Promise.resolve({ ok: false, error: 'no website' })
  ]);
  return { dblp, rdap };
}
