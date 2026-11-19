import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  CalendarDays, MapPin, ExternalLink, Clock, ArrowLeft, Sparkles, Layers, CheckCircle2, XCircle, AlertTriangle,
  CircleDashed, History, Quote, Info
} from 'lucide-react';
import { deadlineLabel } from '../lib/deadline';
import { eventDatesLabel } from '../lib/discover';
import { coverageSummary, MIN_COVERAGE, DIMENSIONS } from '../lib/coverage';
import RiskBadge from '../components/RiskBadge';
import ReminderBell from '../components/ReminderBell';

const STATUS = {
  pass: { label: 'Pass', Icon: CheckCircle2, dot: 'bg-risk-low-soft text-risk-low border-risk-low-line', text: 'text-risk-low' },
  warn: { label: 'Warning', Icon: AlertTriangle, dot: 'bg-risk-medium-soft text-risk-medium border-risk-medium-line', text: 'text-risk-medium' },
  fail: { label: 'Fail', Icon: XCircle, dot: 'bg-risk-high-soft text-risk-high border-risk-high-line', text: 'text-risk-high' },
  info: { label: 'Info (not scored)', Icon: Info, dot: 'bg-surface text-ink-muted border-line', text: 'text-ink-muted' },
  not_checked: { label: 'Not checked', Icon: CircleDashed, dot: 'bg-surface text-ink-faint border-line border-dashed', text: 'text-ink-muted' }
};
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const KIND = {
  page_quote: 'Quote from the conference site', page_scan: 'Pattern scan of pages read', dblp_sparql: 'DBLP (SPARQL)',
  dblp_api: 'DBLP', rdap: 'RDAP domain registry', community_dataset: 'Community dataset (ccfddl)', openalex_api: 'OpenAlex',
  curated_list: 'Curated list', observed_url: 'Observed URL', self_reported: 'Self-reported by organisers',
  publisher_listing: "Publisher's own listing", claim_text: 'Claim text', page_text: 'Page text'
};

/** Render whatever the engine recorded as `observed`: a quote, a list of quotes, years, or key/value facts. */
function Observed({ value }) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    return (
      <blockquote className="mt-2 pl-3 border-l-2 border-line-strong text-sm text-ink-soft italic">
        <Quote aria-hidden="true" className="inline w-3 h-3 mr-1 -mt-1 text-ink-faint" />{value}
      </blockquote>
    );
  }
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === 'object' && x && x.quote)) {
      return (
        <ul className="mt-2 space-y-1.5">
          {value.map((x, i) => (
            <li key={i} className="pl-3 border-l-2 border-line-strong text-sm text-ink-soft">
              <span className="italic">“{x.quote}”</span>
              <span className="block text-2xs text-ink-muted not-italic mt-0.5">
                {String(x.category || '').replace(/_/g, ' ')}{x.method ? ` · found by ${x.method === 'pattern' ? 'pattern scan' : 'verified AI quote'}` : ''}
                {x.source_url && <> · <a className="underline hover:text-ink" href={x.source_url} target="_blank" rel="noopener noreferrer">{hostOf(x.source_url)}</a></>}
              </span>
            </li>
          ))}
        </ul>
      );
    }
    const flat = value.filter((x) => typeof x !== 'object');
    return flat.length ? <p className="mt-1.5 text-xs text-ink-muted font-mono">{flat.join(', ')}</p> : null;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
    return entries.length ? (
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
        {entries.map(([k, v]) => <div key={k}><dt className="inline">{k.replace(/_/g, ' ')}:</dt> <dd className="inline font-mono text-ink-soft">{String(v)}</dd></div>)}
      </dl>
    ) : null;
  }
  return <p className="mt-1.5 text-xs font-mono text-ink-muted">{String(value)}</p>;
}

export default function ConferenceDetailPage() {
  const { id } = useParams();
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDetail() {
      try {
        const res = await api.getConferenceDetail(id);
        if (res.success && res.data) {
          setConference(res.data);
        }
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 motion-safe:animate-pulse" aria-busy="true" aria-label="Loading conference">
        <div className="h-5 w-32 bg-surface-sunken rounded"></div>
        <div className="h-48 bg-surface-sunken rounded-xl"></div>
        <div className="h-64 bg-surface-sunken rounded-xl"></div>
      </div>
    );
  }

  if (!conference) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl">Conference not found</h1>
        <p className="text-sm text-ink-muted mt-2">No conference has this id or slug.</p>
        <Link to="/discover" className="btn-secondary mt-5">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back to Discover
        </Link>
      </div>
    );
  }

  const audit = conference.credibility_audit || {};
  const deadlineHistory = conference.deadline_history || [];

  const cov = coverageSummary(audit);
  const checks = audit.checks || [];
  const counts = ['pass', 'warn', 'fail', 'not_checked'].map((k) => [k, checks.filter((c) => c.status === k).length]);
  const score = conference.credibility_score;
  const covPct = Math.round((typeof audit.coverage === 'number' ? audit.coverage : cov.covered) * 100);
  const originLabel = conference.data_origin === 'pipeline'
    ? `Pipeline record from ${conference.source_primary} (extraction confidence ${conference.pipeline_confidence})`
    : 'Developer-curated seed entry, not machine-verified. Confirm dates and links on the official site.';

  return (
    <div className="max-w-page mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <Link to="/discover" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink rounded">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back to Discover
      </Link>

      {/* Header + score panel */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6" aria-labelledby="conf-title">
        <div className="card p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {conference.ranking && <span className="chip border-line bg-surface-muted text-ink-soft font-mono">{conference.ranking}</span>}
            {conference.format && <span className="chip border-line bg-surface-muted text-ink-soft">{conference.format}</span>}
            {conference.is_extended && <span className="chip border-line bg-surface-muted text-ink-soft">Deadline extended</span>}
          </div>
          <div>
            <h1 id="conf-title" className="text-3xl sm:text-4xl">
              {conference.name} <span className="text-ink-muted font-normal">{conference.edition}</span>
            </h1>
            {conference.title && <p className="text-lg text-ink-soft mt-1">{conference.title}</p>}
            {conference.field && <p className="text-sm text-ink-muted mt-1">{conference.field}</p>}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm pt-2 border-t border-line">
            {[
              [CalendarDays, 'Submission deadline', deadlineLabel(conference, 'TBA')],
              [Clock, 'Event dates', eventDatesLabel(conference)],
              [MapPin, 'Location', [conference.location || conference.venue || 'Location not stated', conference.venue && conference.location ? conference.venue : null].filter(Boolean).join(' · ')],
              [Layers, 'Publisher', conference.publisher || 'Not stated']
            ].map(([Icon, label, value]) => (
              <div key={label} className="flex gap-2.5 pt-3">
                <Icon aria-hidden="true" className="w-4 h-4 mt-0.5 text-ink-faint shrink-0" />
                <div className="min-w-0">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="text-ink font-medium break-words">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            {conference.official_url && (
              <a href={conference.official_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                Official website <ExternalLink aria-hidden="true" className="w-4 h-4" /><span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            <Link to={`/ai-match?target=${encodeURIComponent(conference.name)}`} className="btn-secondary">
              <Sparkles aria-hidden="true" className="w-4 h-4" /> Match my paper
            </Link>
            <ReminderBell conference={conference} variant="button" />
          </div>
          {conference.topics?.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
              {conference.topics.map((t) => <li key={t} className="text-xs text-ink-soft px-2 py-0.5 rounded-md bg-surface-sunken">{t}</li>)}
            </ul>
          )}
        </div>

        <aside className="card p-6 space-y-5" aria-label="Risk assessment summary">
          <div>
            <p className="eyebrow">Evidence score</p>
            {typeof score === 'number' ? (
              <p className="mt-1 font-serif text-5xl font-semibold text-ink tabular-nums">
                {score}<span className="text-base font-sans font-normal text-ink-muted">/100</span>
              </p>
            ) : (
              <>
                <p className="mt-1 font-serif text-2xl font-semibold text-ink">
                  {conference.risk_level === 'High' ? 'Score withheld' : 'Not enough evidence'}
                </p>
                {typeof audit.provisional_score === 'number' && (
                  <p className="text-xs text-ink-muted mt-1">
                    Provisional figure, not a result: <span className="font-mono">{audit.provisional_score}/100</span> from
                    {' '}{cov.ranCount} of {cov.dims.length} dimensions ({covPct}% of the audit weight; {Math.round(MIN_COVERAGE * 100)}% needed).
                  </p>
                )}
              </>
            )}
            {(typeof score === 'number' || conference.risk_level === 'High') && (
              <div className="mt-2"><RiskBadge risk={conference.risk_level} score={null} size="lg" /></div>
            )}
          </div>
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span id="cov-label" className="flex items-center gap-1.5 font-semibold text-ink-soft">
                {cov.enough ? <CheckCircle2 aria-hidden="true" className="w-3.5 h-3.5" /> : <CircleDashed aria-hidden="true" className="w-3.5 h-3.5" />}
                Evidence coverage
              </span>
              <span className="font-mono tabular-nums text-ink">{covPct}%</span>
            </div>
            <div role="meter" aria-labelledby="cov-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={covPct}
              aria-valuetext={`${covPct}% of the audit weight has evidence; minimum ${Math.round(MIN_COVERAGE * 100)}%`}
              className="relative mt-1.5 h-2 rounded-full bg-surface-sunken overflow-visible">
              <div className={`h-full rounded-full ${cov.enough ? 'bg-accent' : 'bg-slate-400'}`} style={{ width: `${Math.min(100, covPct)}%` }} />
              <div className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: `${MIN_COVERAGE * 100}%` }} aria-hidden="true" />
            </div>
            <p className="mt-1.5 text-2xs text-ink-muted">
              {cov.ranCount} of {cov.dims.length} dimensions had evidence. Marker = {Math.round(MIN_COVERAGE * 100)}% minimum for a risk tier.
            </p>
          </div>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {counts.map(([k, n]) => {
              const S = STATUS[k];
              return (
                <div key={k} className="rounded-lg border border-line py-2">
                  <dd className={`font-mono text-lg font-semibold tabular-nums ${n ? S.text : 'text-ink-faint'}`}>{n}</dd>
                  <dt className="text-2xs text-ink-muted">{S.label}</dt>
                </div>
              );
            })}
          </dl>
          <p className="text-2xs text-ink-muted">
            Risk indicators, not a verdict. Absence from a database is not proof a venue is illegitimate.
          </p>
        </aside>
      </section>

      <p className="text-xs text-ink-muted">
        <span className="font-semibold text-ink-soft">Data origin:</span> {originLabel}
        {conference.source_urls?.length > 0 && (
          <> · Sources: {conference.source_urls.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink mr-2">{hostOf(u)}</a>
          ))}</>
        )}
      </p>

      {/* Coverage by dimension */}
      <section aria-labelledby="cov-heading" className="space-y-3">
        <h2 id="cov-heading" className="text-2xl">Coverage by dimension</h2>
        <p className="text-sm text-ink-muted max-w-3xl">
          Only checks that could be performed are scored. A dimension without evidence does not count toward the score,
          and its reasons are listed.
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cov.dims.map((d) => (
            <li key={d.key} className={`rounded-xl border p-4 space-y-2 ${d.ran ? 'bg-surface border-line' : 'bg-surface-muted border-dashed border-line-strong'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {d.ran
                    ? <CheckCircle2 aria-hidden="true" className="w-4 h-4 shrink-0 text-ink-soft" />
                    : <CircleDashed aria-hidden="true" className="w-4 h-4 shrink-0 text-ink-faint" />}
                  <span>{d.label} <span className="font-normal text-ink-muted">· {Math.round(d.weight * 100)}%</span></span>
                </p>
                {/* Below the coverage threshold no number is shown, not even per dimension. */}
                <span className={`chip shrink-0 tabular-nums ${d.ran ? 'border-line bg-surface-sunken text-ink' : 'border-line border-dashed bg-transparent text-ink-muted'}`}>
                  {d.ran ? (cov.enough && typeof d.score === 'number' ? `Ran · ${d.score}/100` : 'Ran') : 'Did not run'}
                </span>
              </div>
              {d.checksRun.length > 0 && (
                <p className="text-xs text-ink-soft">Ran: {d.checksRun.map((c) => `${c.label} (${STATUS[c.status].label.toLowerCase()})`).join('; ')}</p>
              )}
              {d.info.length > 0 && (
                <p className="text-xs text-ink-muted">Info, not scored: {d.info.map((c) => c.label).join('; ')}</p>
              )}
              {d.reasons.length > 0 && (
                <ul className="text-xs text-ink-muted space-y-0.5">
                  {d.reasons.map((r, i) => <li key={i}><span className="text-ink-soft">{d.ran ? 'Also not run' : 'Not run'}: {r.label}.</span> {r.reason}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Evidence timeline */}
      {checks.length > 0 && (
        <section aria-labelledby="ev-heading" className="space-y-4">
          <h2 id="ev-heading" className="text-2xl">Evidence per check</h2>
          {DIMENSIONS.map((d) => {
            const mine = checks.filter((c) => c.dimension === d.key);
            if (!mine.length) return null;
            return (
              <div key={d.key} className="card p-5">
                <h3 className="eyebrow mb-3">{d.label}</h3>
                <ol className="relative border-l border-line ml-3 space-y-5">
                  {mine.map((c) => {
                    const S = STATUS[c.status] || STATUS.not_checked;
                    const e = c.evidence;
                    return (
                      <li key={c.id} className="pl-6 relative">
                        <span className={`absolute -left-3 top-0 w-6 h-6 rounded-full border flex items-center justify-center ${S.dot}`}>
                          <S.Icon aria-hidden="true" className="w-3.5 h-3.5" />
                        </span>
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-semibold text-ink">{c.label}</p>
                          <p className={`text-xs font-semibold ${S.text}`}>{S.label}</p>
                        </div>
                        <p className="text-sm text-ink-soft mt-0.5">{c.detail}</p>
                        {e && (
                          <>
                            <Observed value={e.observed} />
                            <p className="mt-1.5 text-2xs text-ink-muted">
                              {KIND[e.kind] || String(e.kind || '').replace(/_/g, ' ')}
                              {e.url && <> · <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{hostOf(e.url) || 'source'}<span className="sr-only"> (opens in a new tab)</span></a></>}
                              {e.checked_at && <> · checked <time dateTime={e.checked_at}>{new Date(e.checked_at).toLocaleDateString()}</time></>}
                            </p>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
          {audit.limitations?.length > 0 && (
            <ul className="text-xs text-ink-muted space-y-1 list-disc pl-5">
              {audit.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* Deadline history */}
      <section aria-labelledby="dh-heading" className="card p-6 space-y-4">
        <h2 id="dh-heading" className="text-xl flex items-center gap-2">
          <History aria-hidden="true" className="w-5 h-5 text-ink-faint" /> Deadline changes
        </h2>
        {deadlineHistory.length > 0 ? (
          <ol className="relative border-l border-line ml-2 space-y-4">
            {deadlineHistory.map((dh, i) => (
              <li key={i} className="pl-5 relative text-sm">
                <span aria-hidden="true" className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent" />
                <p className="text-ink">
                  Moved from <span className="line-through text-ink-muted">{dh.raw_previous_deadline || dh.previous_deadline}</span> to{' '}
                  <span className="font-semibold">{dh.raw_new_deadline || dh.new_deadline}</span>
                  <span className="text-xs text-ink-muted"> · detected <time dateTime={dh.detected_at}>{new Date(dh.detected_at).toLocaleDateString()}</time></span>
                </p>
                <p className="text-ink-muted text-xs mt-0.5">{dh.change_reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No deadline changes detected between pipeline runs.</p>
        )}
      </section>
    </div>
  );
}
