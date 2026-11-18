/**
 * Researchly.io - Evidence-based Credibility Engine (v2)
 *
 * Principles
 *  1. No evidence, no score: a check that cannot be performed is reported as `not_checked`
 *     (and excluded from the score) instead of silently defaulting to "good".
 *  2. Every check carries its evidence: what was observed, where it came from, and when.
 *  3. We never decide from a conference's *name*. Well-known names get no free pass.
 *  4. Wording is "risk indicators", never an accusation. Absence from our crawl is not proof of absence.
 *
 *  5. The LLM never scores. It only extracts {field, value, quote}; the pipeline keeps a quote only if it occurs
 *     verbatim in the fetched page (and, for risk phrases, only if code patterns confirm the category). This
 *     engine computes every status and score deterministically from that evidence.
 *
 * evaluateConferenceCredibility(conf, lookups?) is synchronous and pure. Evidence comes from:
 *   - conf.evidence (written by the pipeline: quotes, risk phrases, series years, and live lookups run for new or
 *     changed records: DBLP SPARQL, RDAP, OpenAlex aggregate counts);
 *   - `lookups` (optional request-time lookups from services/lookups.js); a fresh lookup wins over a stored one.
 * Anything without evidence is reported as not_checked.
 */

export const ENGINE_VERSION = 'v3-evidence';

// Dimension weights (sum = 1.0). Scores come only from checks that actually ran.
export const DIMENSIONS = [
  { key: 'domain', label: 'Domain & Infrastructure', weight: 0.10 },
  { key: 'organizer', label: 'Organizer & Sponsorship', weight: 0.15 },
  { key: 'publisher', label: 'Publisher Reputation', weight: 0.15 },
  { key: 'indexing', label: 'Indexing Validation', weight: 0.15 },
  { key: 'tpc', label: 'Technical Program Committee', weight: 0.15 },
  { key: 'history', label: 'Past History & Longevity', weight: 0.10 },
  { key: 'venue', label: 'Physical Venue', weight: 0.05 },
  { key: 'fee', label: 'Fee Transparency', weight: 0.10 },
  { key: 'editorial', label: 'Submission & Review Process', weight: 0.05 }
];

// 'info' and 'not_checked' are never scored.
const STATUS_SCORE = { pass: 100, warn: 60, fail: 10 };
export const MIN_COVERAGE = 0.30;

// Small, documented curated lists. They are evidence of "recognised", not of "this event is genuine".
export const RECOGNISED_PUBLISHERS = ['ieee', 'acm', 'springer', 'elsevier', 'pmlr', 'usenix', 'aaai', 'neurips', 'openreview', 'cvf', 'siam', 'wiley', 'oxford university press', 'cambridge university press'];
export const LEARNED_SOCIETIES = ['ieee', 'acm', 'association for computational linguistics', 'usenix', 'aaai', 'cvf', 'computer vision foundation', 'international machine learning society', 'siam', 'ifip', 'eurographics', 'neural information processing systems foundation'];
export const REVIEW_PLATFORMS = ['openreview.net', 'hotcrp.com', 'cmt3.research.microsoft.com', 'easychair.org', 'softconf.com', 'precisionconference.com', 'edas.info', 'linklings.net'];
const WEBMAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'proton.me', 'protonmail.com'];
const PUBLISHER_CLAIM_RX = /\b(ieee|acm|springer)\b/i;
const PAY_TO_PUBLISH_RX = [
  /guarantee[ds]?\s+(paper\s+)?acceptance/i,
  /acceptance\s+(guaranteed|within\s+\d+\s*(h|hours|days))/i,
  /\b(48|24|72)\s*(h|hours)\b/i,
  /fast[- ]?track\s+(acceptance|publication)/i,
  /mandatory\s+(author|publication|processing)\s+fee/i,
  /pay\s+to\s+publish/i
];

function check(id, dimension, label, status, detail, evidence = null) {
  return { id, dimension, label, status, detail, evidence };
}
const notChecked = (id, dimension, label, reason) => check(id, dimension, label, 'not_checked', reason);
const ev = (kind, url, observed, checkedAt) => ({ kind, url: url || null, observed: observed ?? null, checked_at: checkedAt });

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}
const lc = (s) => (s || '').toString().toLowerCase();
const includesAny = (text, list) => list.some((x) => lc(text).includes(x));

/** Text we hold about the conference that could contain red-flag language (raw, as scraped). */
function claimTexts(conf) {
  return [conf.fees, ...(conf.claim_snippets || []), ...(conf.sponsors_claimed || [])]
    .filter((t) => typeof t === 'string' && t.trim());
}

// Thresholds for the committee check. A warn needs a larger sample than a pass: a sparse result is not_checked.
export const COMMITTEE_RULES = { minForPass: 3, minForWarn: 5, passMatchFrac: 0.5, warnResolvedFrac: 0.3 };

/**
 * Program committee vs OpenAlex, from AGGREGATE counts only (see lookups.committeeLookup).
 *   pass: >= 3 lookups and more than half of sampled members with a stated affiliation have names that correspond
 *         to real researchers at the stated institutions.
 *   warn: >= 5 lookups and fewer than 30% of sampled names correspond to any researcher profile.
 *   not_checked: everything else (no committee, live checks off, lookups failed, sparse or in-between results).
 * It never returns fail, and never claims the committee is verified or genuine.
 * `c` = fresh lookup summary, else the aggregate summary stored on the conference from the last live audit.
 */
function committeeCheck(c, pageUrl, now) {
  const id = 'committee_verification'; const label = 'Program committee names vs researcher profiles';
  if (!c) return notChecked(id, 'tpc', label, 'Live OpenAlex lookup not run (requires ENABLE_LIVE_CHECKS during pipeline ingest).');
  if (!c.ok) {
    return notChecked(id, 'tpc', label, c.error === 'no committee listed' ? 'No program committee listed on record.' : `Lookup failed: ${c.error}`);
  }
  const observed = {
    listed: c.listed, sampled: c.sampled, looked_up: c.looked_up, failed_lookups: c.failed_lookups,
    resolved: c.resolved, with_stated_affiliation: c.with_stated_affiliation, institution_matches: c.institution_matches
  };
  const evidence = ev('openalex_api', pageUrl, observed, c.checked_at || now);
  const summary = `${c.institution_matches} of ${c.with_stated_affiliation} sampled members with a stated affiliation matched; ` +
    `${c.resolved} of ${c.looked_up} sampled names found in OpenAlex (${c.listed} listed).`;
  const caveat = ' This does not show that the committee is real or that these people agreed to serve.';
  if (c.looked_up >= COMMITTEE_RULES.minForPass && c.with_stated_affiliation >= COMMITTEE_RULES.minForPass &&
      c.institution_matches / c.with_stated_affiliation > COMMITTEE_RULES.passMatchFrac) {
    return check(id, 'tpc', label, 'pass',
      `Most sampled names correspond to real researchers at the stated institutions: ${summary}${caveat}`, evidence);
  }
  if (c.looked_up >= COMMITTEE_RULES.minForWarn && c.resolved / c.looked_up < COMMITTEE_RULES.warnResolvedFrac) {
    return check(id, 'tpc', label, 'warn',
      `Few sampled names correspond to researcher profiles: ${summary} This can also happen with name variants, ` +
      'transliteration or early-career researchers; treat it as a risk indicator and check the list manually.', evidence);
  }
  return { ...notChecked(id, 'tpc', label, `Inconclusive or too few lookups: ${summary}`), evidence };
}

const DBLP_LABEL = 'Indexed in DBLP (not Scopus / Web of Science)';
const RANK_SYSTEMS = ['CORE', 'CCF'];
const COMMUNITY_DATASET_RX = /^https:\/\/github\.com\/ccfddl\/ccf-deadlines\//;

/**
 * CORE/CCF rank as listed in a community-maintained dataset (ccfddl). A listing is evidence that the community
 * dataset records the rank; it is NOT verified against CORE's/CCF's own lists. Absent -> not_checked (neutral).
 */
function rankListingCheck(conf, now) {
  const label = 'CORE/CCF rank listed in a community dataset';
  const claims = (conf.ranking_claims || []).filter((r) => r && RANK_SYSTEMS.includes(String(r.system).toUpperCase())
    && r.value && COMMUNITY_DATASET_RX.test(String(r.source_url || '')));
  if (!claims.length) return notChecked('rank_listing', 'indexing', label, 'No CORE/CCF rank listed in the community dataset.');
  const listed = claims.map((r) => `${String(r.system).toUpperCase()} ${r.value}`).join(', ');
  return check('rank_listing', 'indexing', label, 'pass',
    `${listed}: listed in a community-maintained dataset, not verified against CORE's own site` +
    (claims.some((r) => String(r.system).toUpperCase() === 'CCF') ? " or CCF's own list." : '.'),
    ev('community_dataset', claims[0].source_url, listed, conf.scraped_at || now));
}

const RISK_FAIL = new Set(['guaranteed_acceptance', 'publish_in_days']);
const RISK_LABEL = {
  guaranteed_acceptance: 'guaranteed acceptance', publish_in_days: 'publication within days',
  fast_review: 'very short review period', fee_only: 'acceptance tied to payment', no_named_committee: 'committee not named'
};
const FEE_AMOUNT_RX = /([$€£¥₹]\s?\d)|(\b(usd|eur|gbp|cny|rmb|jpy|inr|cad|aud|chf|krw|sgd)\s?\d)|(\d[\d,.]*\s?(usd|eur|gbp|cny|rmb|jpy|inr|cad|aud|chf|krw|sgd|dollars|euros)\b)/i;
const quoteEv = (kind, q, checkedAt) => ev(kind, q.source_url, q.quote, checkedAt);

/** Pipeline-stored lookup ({ok, error, data, evidence_url, checked_at}) in the request-time lookup shape. */
function storedLookup(l, kind) {
  if (!l) return undefined;
  if (!l.ok) return { ok: false, error: l.error || 'lookup failed' };
  const d = l.data || {};
  if (kind === 'dblp') {
    return { ok: true, found: !!d.found, matched: d.title || null, years_with_publications: d.years_with_publications ?? null,
      first_year: d.first_year ?? null, last_year: d.last_year ?? null, evidence_url: l.evidence_url, checked_at: l.checked_at };
  }
  if (kind === 'rdap') {
    return { ok: true, registered_at: d.registered_at, age_days: d.age_days, evidence_url: l.evidence_url, checked_at: l.checked_at };
  }
  return { ok: true, ...d, checked_at: l.checked_at };
}

function historyChecks(conf, dblp, now) {
  const out = [];
  const label = 'Years with publications in DBLP';
  if (dblp && dblp.ok && dblp.found && Number.isInteger(dblp.years_with_publications)) {
    const n = dblp.years_with_publications;
    const span = dblp.first_year && dblp.last_year ? `${dblp.first_year}–${dblp.last_year}` : 'unknown span';
    out.push(n >= 5
      ? check('dblp_history', 'history', label, 'pass', `DBLP lists publications from this venue in ${n} distinct years (${span}).`,
        ev('dblp_sparql', dblp.evidence_url, { years_with_publications: n, first_year: dblp.first_year, last_year: dblp.last_year }, dblp.checked_at || now))
      : notChecked('dblp_history', 'history', label, `DBLP lists publications in only ${n} year(s) (${span}); a young series is neutral, not negative.`));
  } else {
    out.push(notChecked('dblp_history', 'history', label,
      dblp && dblp.ok ? 'Venue not found in DBLP, so no DBLP history.' : dblp && dblp.error ? `DBLP lookup failed: ${dblp.error}` : 'DBLP lookup not run.'));
  }
  const years = [...new Set((conf.evidence?.series_years || []).filter(Number.isInteger))].sort();
  const label2 = 'Editions listed in the ccfddl dataset';
  if (years.length >= 5) {
    out.push(check('dataset_history', 'history', label2, 'pass',
      `${years.length} editions listed (${years[0]}–${years[years.length - 1]}) in a community-maintained dataset; a lower bound, as the dataset only goes back so far.`,
      ev('community_dataset', conf.evidence.series_source_url, years, conf.scraped_at || now)));
  } else {
    out.push(notChecked('dataset_history', 'history', label2,
      years.length ? `Only ${years.length} edition(s) listed in the dataset; neutral, not negative.`
        : conf.evidence?.series_source_url
          ? 'This record comes from the ccfddl dataset but carries no edition list (written by an older pipeline version; re-run the pipeline).'
          : 'Not from the ccfddl dataset, so no edition list.'));
  }
  return out;
}

function riskPhraseCheck(conf, now) {
  const id = 'risk_phrases'; const label = 'Risk phrases on the conference pages';
  const e = conf.evidence || {};
  const phrases = e.risk_phrases || [];
  const pages = e.pages_read || [];
  if (phrases.length) {
    const fails = phrases.filter((p) => RISK_FAIL.has(p.category));
    const worst = fails[0] || phrases[0];
    const cats = [...new Set(phrases.map((p) => RISK_LABEL[p.category] || p.category))].join(', ');
    return check(id, 'editorial', label, fails.length ? 'fail' : 'warn',
      `Found ${phrases.length} risk phrase(s) (${cats}). Quoted verbatim from the page: "${worst.quote}"`,
      ev('page_quote', worst.source_url, phrases.map((p) => ({ category: p.category, quote: p.quote, source_url: p.source_url, method: p.method })),
        e.enrichment_checked_at || now));
  }
  if (pages.length) {
    return check(id, 'editorial', label, 'pass',
      `No guaranteed-acceptance, publish-in-days, very-short-review, pay-for-acceptance or unnamed-committee wording found by the pattern scan of ${pages.length} page(s). ` +
      'The scan reads the page text only, so wording in images or PDFs is not covered.',
      ev('page_scan', pages[0], pages, e.enrichment_checked_at || now));
  }
  return notChecked(id, 'editorial', label, 'The conference pages have not been read (enrichment not run for this record).');
}

function statementCheck(id, dim, label, q, passDetail, missing, now, conf) {
  if (q && q.quote) return check(id, dim, label, 'pass', `${passDetail}: "${q.quote}"`, quoteEv('page_quote', q, conf.evidence?.enrichment_checked_at || now));
  return notChecked(id, dim, label, missing);
}

export function evaluateConferenceCredibility(conf, lookups = {}) {
  const now = new Date().toISOString();
  const stored = conf.evidence?.lookups || {};
  lookups = {
    dblp: lookups.dblp ?? storedLookup(stored.dblp, 'dblp'),
    rdap: lookups.rdap ?? storedLookup(stored.rdap, 'rdap'),
    committee: lookups.committee ?? storedLookup(stored.committee, 'committee')
  };
  const pagesRead = (conf.evidence?.pages_read || []).length > 0;
  const notReadReason = 'The conference pages have not been read (enrichment not run for this record).';
  const checks = [];
  const officialUrl = conf.official_url || '';
  const sourceUrl = (conf.source_urls && conf.source_urls[0]) || null;
  const selfReported = (url) => ev('self_reported', url || officialUrl, null, now);

  // --- domain -------------------------------------------------------------------------------
  if (officialUrl) {
    // Information only: HTTPS is near-universal (free certificates) and says nothing about legitimacy, so it never
    // scores the domain dimension on its own. That dimension is scored only when domain age (RDAP) has run.
    const https = officialUrl.startsWith('https://');
    checks.push(check('https_transport', 'domain', 'Website uses HTTPS', 'info',
      https ? 'Official website is served over HTTPS (information only, not scored).' : 'Official website URL is not HTTPS (information only, not scored).',
      ev('observed_url', officialUrl, officialUrl, now)));
  } else {
    checks.push(notChecked('https_transport', 'domain', 'Website uses HTTPS', 'No official website URL on record.'));
  }
  const age = lookups.rdap;
  if (age && age.ok) {
    const days = age.age_days;
    const status = days >= 3 * 365 ? 'pass' : days >= 180 ? 'warn' : 'fail';
    checks.push(check('domain_age', 'domain', 'Domain registration age', status,
      `Domain registered ${age.registered_at.slice(0, 10)} (~${Math.floor(days / 30)} months ago).`,
      ev('rdap', age.evidence_url, age.registered_at, age.checked_at || now)));
  } else {
    checks.push(notChecked('domain_age', 'domain', 'Domain registration age',
      age && age.error ? `Lookup failed: ${age.error}` : 'Live RDAP lookup not run.'));
  }

  // --- organizer & sponsorship ------------------------------------------------------------------
  if (conf.organizer) {
    const known = includesAny(conf.organizer, LEARNED_SOCIETIES);
    checks.push(known
      ? check('organizer_society', 'organizer', 'Organizer is a recognised learned society', 'pass',
        `Organizer "${conf.organizer}" matches a recognised society (curated list; not proof this edition is genuine).`,
        ev('curated_list', null, conf.organizer, now))
      : notChecked('organizer_society', 'organizer', 'Organizer is a recognised learned society',
        `Organizer "${conf.organizer}" is not on the curated society list; this is neutral, not negative.`));
  } else {
    checks.push(notChecked('organizer_society', 'organizer', 'Organizer is a recognised learned society', 'No organizer on record.'));
  }
  checks.push(statementCheck('organizer_named', 'organizer', 'Organizer named on the conference site', conf.evidence?.organizer,
    'The site names its organiser', pagesRead ? 'The pages read do not name an organiser (or the statement could not be verified).' : notReadReason, now, conf));
  const claimed = (conf.sponsors_claimed || []).filter((s) => PUBLISHER_CLAIM_RX.test(s));
  if (claimed.length === 0) {
    checks.push(notChecked('sponsorship_claim', 'organizer', 'Publisher sponsorship claim', 'No IEEE/ACM/Springer sponsorship claimed.'));
  } else if (conf.sponsors_verified_source) {
    checks.push(check('sponsorship_claim', 'organizer', 'Publisher sponsorship claim', 'pass',
      'Claimed sponsorship appears in the publisher\'s own listing.',
      ev('publisher_listing', conf.sponsors_verified_source, claimed.slice(0, 2), conf.scraped_at || now)));
  } else {
    checks.push(check('sponsorship_claim', 'organizer', 'Publisher sponsorship claim', 'warn',
      'Sponsorship by IEEE/ACM/Springer is claimed but was not found in that publisher\'s listing in our crawl. ' +
      'This may only mean the listing was not crawled; confirm on the publisher\'s site.',
      ev('claim_text', sourceUrl || officialUrl, claimed.slice(0, 2), conf.scraped_at || now)));
  }

  // --- publisher --------------------------------------------------------------------------------
  if (conf.publisher) {
    const ok = includesAny(conf.publisher, RECOGNISED_PUBLISHERS);
    checks.push(ok
      ? check('publisher_recognised', 'publisher', 'Proceedings publisher is recognised', 'pass',
        `Publisher "${conf.publisher}" is a recognised academic publisher (curated list).`, ev('curated_list', null, conf.publisher, now))
      : notChecked('publisher_recognised', 'publisher', 'Proceedings publisher is recognised',
        `Publisher "${conf.publisher}" is not on the curated list; this is neutral, not negative.`));
  } else {
    checks.push(notChecked('publisher_recognised', 'publisher', 'Proceedings publisher is recognised', 'No publisher on record.'));
  }

  // --- indexing -----------------------------------------------------------------------------------
  const dblp = lookups.dblp;
  if (dblp && dblp.ok) {
    checks.push(dblp.found
      ? check('dblp_presence', 'indexing', DBLP_LABEL, 'pass',
        `DBLP (computer-science bibliography) indexes the venue series "${dblp.matched}". This is DBLP, not Scopus or Web of Science.`,
        ev('dblp_sparql', dblp.evidence_url, dblp.matched, dblp.checked_at || now))
      : check('dblp_presence', 'indexing', DBLP_LABEL, 'warn',
        'The venue key was not found in DBLP. New or niche venues are often absent, so this is a weak indicator.',
        ev('dblp_sparql', dblp.evidence_url, null, dblp.checked_at || now)));
  } else {
    checks.push(notChecked('dblp_presence', 'indexing', DBLP_LABEL,
      dblp && dblp.error ? `Lookup failed: ${dblp.error}` : 'DBLP lookup not run.'));
  }
  checks.push(rankListingCheck(conf, now));
  const ic = conf.indexing_claims || {};
  const claimedIdx = ['scopus', 'wos', 'dblp'].filter((k) => ic[k] === 'claimed');
  checks.push(notChecked('scopus_wos_verification', 'indexing', 'Scopus / Web of Science claims',
    claimedIdx.length
      ? `The site claims indexing in: ${claimedIdx.join(', ')}. Cannot be verified with free data; check the Scopus Sources list / Clarivate Master Journal List directly.`
      : 'No Scopus/WoS claim recorded and no free data source to verify one.'));

  // --- committee (OpenAlex, live only) / venue (not automated yet) ---------------------------------------
  checks.push(committeeCheck(lookups.committee ?? conf.committee_summary, sourceUrl || officialUrl, now));
  checks.push(statementCheck('peer_review_statement', 'editorial', 'Peer-review process stated', conf.evidence?.peer_review,
    'The site describes its review process', pagesRead ? 'The pages read do not describe the review process (or it could not be verified).' : notReadReason, now, conf));
  checks.push(notChecked('venue_verification', 'venue', 'Physical venue verification',
    'Not automated yet.'));

  // --- history ------------------------------------------------------------------------------------------
  checks.push(...historyChecks(conf, dblp, now));
  const editionNum = parseInt(conf.edition_number ?? conf.edition, 10);
  if (Number.isFinite(editionNum) && editionNum > 0 && editionNum < 200) {
    checks.push(editionNum >= 5
      ? check('edition_history', 'history', 'Established series', 'pass',
        `Edition number ${editionNum} is stated by the organisers (self-reported).`, selfReported())
      : notChecked('edition_history', 'history', 'Established series', `Edition number ${editionNum} is low; neutral, not negative.`));
  } else {
    checks.push(notChecked('edition_history', 'history', 'Established series', 'No edition number on record.'));
  }

  // --- fee transparency ---------------------------------------------------------------------------------
  const texts = claimTexts(conf);
  const hit = texts.find((t) => PAY_TO_PUBLISH_RX.some((rx) => rx.test(t)));
  if (hit) {
    checks.push(check('fee_red_flags', 'fee', 'Pay-to-publish / guaranteed-acceptance language', 'fail',
      'Page text contains language associated with pay-to-publish or guaranteed acceptance.',
      ev('page_text', sourceUrl || officialUrl, hit.slice(0, 240), conf.scraped_at || now)));
  } else if (texts.length) {
    checks.push(check('fee_red_flags', 'fee', 'Pay-to-publish / guaranteed-acceptance language', 'pass',
      'No pay-to-publish or guaranteed-acceptance language found in the text we hold.',
      ev('page_text', sourceUrl || officialUrl, null, conf.scraped_at || now)));
  } else {
    checks.push(notChecked('fee_red_flags', 'fee', 'Pay-to-publish / guaranteed-acceptance language', 'No fee or claim text on record.'));
  }

  const fee = conf.evidence?.fee_statement;
  if (fee && fee.quote && FEE_AMOUNT_RX.test(fee.quote)) {
    checks.push(check('fee_transparency', 'fee', 'Fees stated with amounts', 'pass',
      `The site states its fees: "${fee.quote}"`, quoteEv('page_quote', fee, conf.evidence?.enrichment_checked_at || now)));
  } else {
    checks.push(notChecked('fee_transparency', 'fee', 'Fees stated with amounts',
      fee && fee.quote ? `A fee statement was found but it states no amount: "${fee.quote}"`
        : pagesRead ? 'No fee amounts found on the pages read (fees are often published later on a registration page).' : notReadReason));
  }
  checks.push(riskPhraseCheck(conf, now));

  // --- submission channel --------------------------------------------------------------------------------
  const sub = conf.submission_url || '';
  const subHost = hostOf(sub);
  if (sub.startsWith('mailto:') || (subHost && WEBMAIL.includes(subHost))) {
    checks.push(check('submission_channel', 'editorial', 'Submission channel', 'fail',
      'Submissions go to a personal webmail address instead of a review system.', ev('observed_url', sub, sub, now)));
  } else if (subHost && REVIEW_PLATFORMS.some((p) => subHost === p || subHost.endsWith('.' + p))) {
    checks.push(check('submission_channel', 'editorial', 'Submission channel', 'pass',
      `Uses a recognised peer-review platform (${subHost}).`, ev('observed_url', sub, subHost, now)));
  } else {
    checks.push(notChecked('submission_channel', 'editorial', 'Submission channel',
      sub ? `Unrecognised submission platform (${subHost || 'unknown'}); neutral.` : 'No submission URL on record.'));
  }

  return buildAudit(conf, checks, now);
}

function buildAudit(conf, checks, now) {
  const dimScores = {};
  for (const d of DIMENSIONS) {
    const scored = checks.filter((c) => c.dimension === d.key && STATUS_SCORE[c.status] !== undefined);
    dimScores[d.key] = scored.length
      ? Math.round(scored.reduce((s, c) => s + STATUS_SCORE[c.status], 0) / scored.length)
      : null;
  }
  const checkedDims = DIMENSIONS.filter((d) => dimScores[d.key] !== null);
  const wChecked = checkedDims.reduce((s, d) => s + d.weight, 0);
  const coverage = Math.round(wChecked * 100) / 100;
  const computed = wChecked > 0
    ? Math.round(checkedDims.reduce((s, d) => s + dimScores[d.key] * d.weight, 0) / wChecked)
    : null;
  // Below the coverage threshold the number is NOT a result: overall_score is null and the figure is exposed only as
  // provisional_score, which every consumer must label as provisional.
  const enough = coverage >= MIN_COVERAGE;
  const overall = enough ? computed : null;
  const provisional = enough ? null : computed;

  const fails = checks.filter((c) => c.status === 'fail');
  const warns = checks.filter((c) => c.status === 'warn');
  let risk;
  if (fails.length > 0) risk = 'High';                     // a failed check is evidence on its own
  else if (overall === null) risk = 'Insufficient evidence';
  else if (overall < 50) risk = 'High';
  else if (overall >= 80 && coverage >= 0.45 && warns.length === 0) risk = 'Low';
  else risk = 'Medium';

  const line = (c) => `${c.label}: ${c.detail}`;
  return {
    conference_id: conf.id,
    engine_version: ENGINE_VERSION,
    overall_score: overall,
    provisional_score: provisional,
    risk_level: risk,
    coverage,
    domain_score: dimScores.domain,
    organizer_score: dimScores.organizer,
    publisher_score: dimScores.publisher,
    indexing_score: dimScores.indexing,
    tpc_score: dimScores.tpc,
    history_score: dimScores.history,
    venue_score: dimScores.venue,
    fee_score: dimScores.fee,
    editorial_score: dimScores.editorial,
    checks,
    positive_indicators: checks.filter((c) => c.status === 'pass').map(line),
    warning_indicators: warns.map(line),
    contradictions: fails.map(line),
    missing_information: checks.filter((c) => c.status === 'not_checked').map(line),
    limitations: [
      'Risk indicators, not a verdict. Absence from a crawl or database is not proof a venue is illegitimate.',
      'Scopus / Web of Science status and venue verification are not automated; confirm those directly. DBLP indexing is not Scopus indexing.',
      'Statements and risk phrases are quoted verbatim from pages we fetched. An AI model proposes quotes; code keeps a quote only if it ' +
      'appears word for word on the page. No score or risk level comes from the model.',
      'The committee check compares up to 10 sampled names with OpenAlex researcher profiles by name and stated ' +
      'affiliation. It never verifies a committee.',
      'Real researchers can be listed on a committee without their knowledge or consent; a name match does not mean ' +
      'they agreed to serve.'
    ],
    updated_at: now
  };
}
