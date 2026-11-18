import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import ConferenceCard from '../components/ConferenceCard';
import { Search, RefreshCw, ShieldCheck, CheckCircle2, X, Compass, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { deadlineLabel } from '../lib/deadline';
import {
  TIMELINES, applyFilters, sortForDiscover, countryFacets, bannerCounts
} from '../lib/discover';

const PAGE_SIZE = 24;

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allConferences, setAllConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Filters live in the URL query string (shareable, survive reload / back button). Defaults are omitted from the URL.
  const param = (k, d) => searchParams.get(k) || d;
  const filters = {
    search: param('search', ''),
    field: param('field', 'All'),
    format: param('format', 'All'),
    event_type: param('event_type', 'All'),
    risk: param('risk', 'All'),
    timeline: TIMELINES[param('timeline', 'current')] ? param('timeline', 'current') : 'current',
    country: param('country', ''),
    city: param('city', ''),
  };
  const page = Math.max(1, parseInt(param('page', '1'), 10) || 1);
  const DEFAULTS = { search: '', field: 'All', format: 'All', event_type: 'All', risk: 'All', timeline: 'current', country: '', city: '', page: '1' };
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === undefined || value === null || value === '' || DEFAULTS[key] === String(value)) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');                 // any filter change returns to page 1
    setSearchParams(next, { replace: key === 'city' || key === 'search' });
  };
  const [search, setSearch] = useState(filters.search);
  useEffect(() => { setSearch(filters.search); }, [filters.search]);

  // ~950 records: fetched once, filtered + sorted client-side (the Supabase listing path does not apply
  // search/status/event_type filters server-side, so client-side keeps both store modes consistent).
  const now = useMemo(() => new Date(), [allConferences]);
  const conferences = useMemo(() => sortForDiscover(applyFilters(allConferences, filters, now), now),
    [allConferences, searchParams, now]);
  const countryOptions = useMemo(() => countryFacets(applyFilters(allConferences, filters, now, 'country')),
    [allConferences, searchParams, now]);
  const counts = bannerCounts(conferences, allConferences);
  const pageCount = Math.max(1, Math.ceil(conferences.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = conferences.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Track submission modal
  const [trackTarget, setTrackTarget] = useState(null);
  const [trackPaperTitle, setTrackPaperTitle] = useState('');
  const [trackStatus, setTrackStatus] = useState('Bookmarked');
  const [trackSuccess, setTrackSuccess] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Escape closes the track dialog and the mobile filter drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setTrackTarget(null); setShowFilters(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const fetchConferences = async () => {
    setLoading(true);
    try {
      const res = await api.getConferences({});
      if (res.success) setAllConferences(res.data);
      return res.success ? res.data : null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConferences();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setFilter('search', search.trim());
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage('Ingesting live CFPs & verifying deadlines...');
    try {
      const res = await api.syncEvents();
      if (res.success) {
        const data = await fetchConferences();
        setSyncMessage(data ? `✓ Synced: ${data.length} events in the catalogue` : '✓ Sync finished');
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage('Sync failed');
        setTimeout(() => setSyncMessage(null), 3000);
      }
    } catch (err) {
      setSyncMessage('Sync failed');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveToTracker = async (e) => {
    e.preventDefault();
    if (!trackTarget || !trackPaperTitle.trim()) return;

    try {
      await api.createApplication({
        conference_id: trackTarget.id || trackTarget.slug,
        conference_name: `${trackTarget.name} ${trackTarget.edition}`,
        paper_title: trackPaperTitle,
        status: trackStatus,
        target_deadline: trackTarget.submission_deadline
      });
      setTrackSuccess(true);
      setTimeout(() => {
        setTrackTarget(null);
        setTrackPaperTitle('');
        setTrackSuccess(false);
      }, 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSearchParams(new URLSearchParams());
  };

  const TYPE_LABELS = { Conference: 'Conferences', Webinar: 'Webinars & seminars', Workshop: 'Workshops & symposia' };
  const active = [
    filters.search && { key: 'search', label: `“${filters.search}”` },
    filters.event_type !== 'All' && { key: 'event_type', label: TYPE_LABELS[filters.event_type] || filters.event_type },
    filters.field !== 'All' && { key: 'field', label: filters.field },
    filters.format !== 'All' && { key: 'format', label: filters.format },
    filters.risk !== 'All' && { key: 'risk', label: filters.risk === 'Insufficient evidence' ? 'Not enough evidence' : `${filters.risk} risk` },
    filters.timeline !== 'current' && { key: 'timeline', label: TIMELINES[filters.timeline] },
    filters.country && { key: 'country', label: (countryOptions.find((o) => o.value === filters.country) || { label: filters.country }).label },
    filters.city && { key: 'city', label: `City/venue: ${filters.city}` }
  ].filter(Boolean);
  const first = conferences.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(currentPage * PAGE_SIZE, conferences.length);
  const goPage = (n) => { setFilter('page', n); window.scrollTo({ top: 0 }); };
  const fieldCls = 'w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink hover:border-line-strong focus:border-accent transition-colors duration-150';
  const labelCls = 'block text-xs font-semibold text-ink-soft mb-1.5';

  return (
    <div className="max-w-page w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Event Pipeline Sync Banner */}
      <div className="card p-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-3xl space-y-3">
          <p className="eyebrow flex items-center gap-1.5"><Compass aria-hidden="true" className="w-3.5 h-3.5" /> Conference catalogue</p>
          <h1 className="text-3xl sm:text-4xl">Real Academic Conferences, Webinars & CFP Catalog</h1>
          <p className="text-base text-ink-soft">
            Academic conference CFPs, seminars and webinars. Each venue is audited across 9 credibility dimensions;
            only checks with evidence are scored, and anything that could not be checked is shown as such.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="chip border-accent-200 bg-accent-50 text-accent-700 tabular-nums">
              {loading ? 'Loading…' : `${counts.shown} of ${counts.total} events shown`}
            </span>
            {!loading && (
              <span className="chip border-line bg-surface-muted text-ink-soft tabular-nums">{counts.assessed} with a risk assessment</span>
            )}
          </div>
        </div>

        {/* Real Event Pipeline Trigger */}
        <button
          type="button"
          onClick={handleManualSync}
          disabled={syncing}
          aria-live="polite"
          className="btn-secondary h-10 shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`w-4 h-4 ${syncing ? 'motion-safe:animate-spin' : ''}`} />
          <span>{syncMessage || 'Sync Real Events Pipeline'}</span>
        </button>
      </div>

      {/* Mobile: open the filter drawer */}
      <div className="lg:hidden flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          aria-expanded={showFilters}
          aria-controls="discover-filters"
          className="btn-secondary h-10 cursor-pointer"
        >
          <SlidersHorizontal aria-hidden="true" className="w-4 h-4" />
          Filters{active.length ? ` (${active.length})` : ''}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Drawer backdrop (mobile only) */}
        {showFilters && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden="true" onClick={() => setShowFilters(false)} />
        )}
        {/* Left Sidebar: Filters (a drawer below lg) */}
        <aside
          id="discover-filters"
          aria-label="Search and filters"
          className={`${showFilters ? 'fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm overflow-y-auto bg-canvas p-4 shadow-xl' : 'hidden'} lg:block lg:static lg:z-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none lg:col-span-1`}
        >
          <div className="space-y-4 lg:sticky lg:top-24">
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h2 className="font-sans text-xs font-semibold text-ink uppercase tracking-[0.08em] flex items-center gap-2">
                <SlidersHorizontal aria-hidden="true" className="w-4 h-4 text-ink-faint" />
                <span>Search & Filters</span>
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="btn-ghost px-2 py-1 text-xs cursor-pointer"
                  title="Reset all filters" aria-label="Reset all filters"
                >
                  <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="lg:hidden p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-sunken cursor-pointer"
                  aria-label="Close filters"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Keyword Search */}
            <form onSubmit={handleSearchSubmit} role="search">
              <label htmlFor="discover-search" className={labelCls}>Search Keywords</label>
              <div className="relative">
                <Search aria-hidden="true" className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="discover-search"
                  type="search"
                  placeholder="e.g. NeurIPS, Vision, Security..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${fieldCls} pl-9`}
                />
              </div>
            </form>

            {/* Event Type Filter */}
            <div>
              <label htmlFor="f-type" className={labelCls}>Event Type</label>
              <select id="f-type" value={filters.event_type} onChange={(e) => setFilter('event_type', e.target.value)} className={fieldCls}>
                <option value="All">All Types (Conferences & Webinars)</option>
                <option value="Conference">Conferences Only</option>
                <option value="Webinar">Webinars & Seminars</option>
                <option value="Workshop">Workshops & Symposiums</option>
              </select>
            </div>

            {/* Research Field */}
            <div>
              <label htmlFor="f-field" className={labelCls}>Research Field</label>
              <select id="f-field" value={filters.field} onChange={(e) => setFilter('field', e.target.value)} className={fieldCls}>
                <option value="All">All Research Fields</option>
                <option value="Machine Learning">Machine Learning & AI</option>
                <option value="Computer Vision">Computer Vision</option>
                <option value="Natural Language Processing">Natural Language Processing</option>
                <option value="Security">Security & Privacy</option>
                <option value="Systems">Systems & Cloud</option>
                <option value="Human-Computer Interaction">Human-Computer Interaction</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Robotics">Robotics & Autonomous Systems</option>
              </select>
            </div>

            {/* Event Format */}
            <div>
              <label htmlFor="f-format" className={labelCls}>Event Format</label>
              <select id="f-format" value={filters.format} onChange={(e) => setFilter('format', e.target.value)} className={fieldCls}>
                <option value="All">All Formats</option>
                <option value="In-Person">In-Person</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Virtual">Virtual</option>
                <option value="Webinar">Webinar Stream</option>
              </select>
            </div>

            {/* Credibility Risk */}
            <div>
              <label htmlFor="f-risk" className={labelCls}>Credibility Risk</label>
              <select id="f-risk" value={filters.risk} onChange={(e) => setFilter('risk', e.target.value)} className={fieldCls}>
                <option value="All">All Credibility Tiers</option>
                <option value="Low">Low risk indicators</option>
                <option value="Medium">Medium risk (review carefully)</option>
                <option value="High">High-risk indicators</option>
                <option value="Insufficient evidence">Not enough evidence</option>
              </select>
            </div>

            {/* Timeline (replaces the old Deadline Timeline filter) */}
            <div>
              <label htmlFor="f-timeline" className={labelCls}>Timeline</label>
              <select id="f-timeline" value={filters.timeline} onChange={(e) => setFilter('timeline', e.target.value)} className={fieldCls}>
                {Object.entries(TIMELINES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="text-2xs text-ink-muted mt-1.5">Events without dates are always shown, marked TBA.</p>
            </div>

            {/* Location */}
            <div>
              <label htmlFor="f-country" className={labelCls}>Location</label>
              <select id="f-country" value={filters.country} onChange={(e) => setFilter('country', e.target.value)} className={fieldCls}>
                <option value="">All locations</option>
                {countryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
              <div className="relative mt-2">
                <label htmlFor="f-city" className="sr-only">City or venue</label>
                <Search aria-hidden="true" className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="f-city"
                  type="text"
                  placeholder="City or venue"
                  value={filters.city}
                  onChange={(e) => setFilter('city', e.target.value)}
                  className={`${fieldCls} pl-9`}
                />
              </div>
            </div>
          </div>

          {/* 9-Dimension Intelligence Checklist (neutral panel; wording matches what is actually automated) */}
          <div className="card bg-surface-muted p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="w-4 h-4 text-ink-faint" />
              <h3 className="text-sm font-semibold text-ink">9-Dimension Verification</h3>
            </div>
            <p className="text-xs text-ink-soft">
              Each venue is checked against the evidence available: DBLP indexing, CORE/CCF listings, domain age and
              stated review process. Dimensions without evidence are not scored.
            </p>
            <ul className="space-y-1.5 pt-3 border-t border-line text-xs text-ink-soft">
              {['DBLP indexing (not Scopus)', 'CORE / CCF rank listing', 'Program committee affiliation check', 'Deadline drift & revision history'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 aria-hidden="true" className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          </div>
        </aside>

        {/* Right Main Grid: Conferences & Webinars */}
        <section className="lg:col-span-3 min-w-0 space-y-4" aria-labelledby="results-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 min-h-[1.75rem]">
            <h2 id="results-heading" className="font-sans text-sm font-semibold text-ink tabular-nums">
              {loading ? 'Loading conferences…' : conferences.length ? `Showing ${first}–${last} of ${conferences.length}` : 'No results'}
            </h2>
            {active.length > 0 && (
              <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
                {active.map((f) => (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => { if (f.key === 'search') setSearch(''); setFilter(f.key, ''); }}
                      className="chip border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100 transition-colors duration-150 cursor-pointer"
                      aria-label={`Remove filter: ${f.label}`}
                    >
                      {f.label}
                      <X aria-hidden="true" className="w-3 h-3" />
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={handleResetFilters} className="text-xs font-medium text-ink-muted hover:text-ink underline underline-offset-2 px-1 cursor-pointer">
                    Clear all
                  </button>
                </li>
              </ul>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="card p-5 space-y-4 motion-safe:animate-pulse">
                  <div className="flex gap-1.5"><div className="h-5 w-20 rounded-md bg-surface-sunken" /><div className="h-5 w-14 rounded-md bg-surface-sunken" /></div>
                  <div className="h-5 w-2/3 rounded bg-surface-sunken" />
                  <div className="h-4 w-full rounded bg-surface-sunken" />
                  <div className="space-y-2"><div className="h-4 w-5/6 rounded bg-surface-sunken" /><div className="h-4 w-4/6 rounded bg-surface-sunken" /><div className="h-4 w-3/6 rounded bg-surface-sunken" /></div>
                  <div className="h-8 rounded bg-surface-sunken" />
                </div>
              ))}
            </div>
          ) : conferences.length === 0 ? (
            <div className="card px-6 py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-sunken text-ink-faint flex items-center justify-center mx-auto">
                <Compass aria-hidden="true" className="w-6 h-6" />
              </div>
              <p className="mt-4 text-base font-semibold text-ink">No events match your selected filters</p>
              <p className="mt-1 text-sm text-ink-muted max-w-sm mx-auto">
                {filters.timeline === 'current'
                  ? 'Try clearing your search terms, or include past events in the Timeline filter.'
                  : 'Try clearing your search terms or resetting filters.'}
              </p>
              <button type="button" onClick={handleResetFilters} className="btn-primary mt-6 cursor-pointer">
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pageItems.map((conf) => (
                <ConferenceCard
                  key={conf.id || conf.slug}
                  conference={conf}
                  onTrack={(target) => setTrackTarget(target)}
                />
              ))}
            </div>
          )}
          {!loading && pageCount > 1 && (
            <nav className="flex flex-wrap items-center justify-center gap-3 pt-4 text-sm" aria-label="Pagination">
              <button
                type="button"
                onClick={() => goPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="btn-secondary h-9 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-ink-soft tabular-nums" aria-live="polite">
                Page {currentPage} of {pageCount} · {conferences.length} events
              </span>
              <button
                type="button"
                onClick={() => goPage(currentPage + 1)}
                disabled={currentPage >= pageCount}
                className="btn-secondary h-9 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>

      {/* Track Submission Modal */}
      {trackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setTrackTarget(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="track-title" onClick={(e) => e.stopPropagation()} className="card shadow-xl w-full max-w-lg p-6 space-y-4 animate-modal-in">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
              <h3 id="track-title" className="font-serif text-xl font-semibold text-ink">
                Track Paper for {trackTarget.name} {trackTarget.edition}
              </h3>
              <button
                onClick={() => setTrackTarget(null)}
                aria-label="Close" className="text-ink-muted hover:text-ink p-1.5 rounded-lg hover:bg-surface-sunken transition-colors duration-150 cursor-pointer"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            {trackSuccess ? (
              <div role="status" className="p-4 bg-risk-low-soft border border-risk-low-line text-risk-low rounded-lg text-center text-sm font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 aria-hidden="true" className="w-4 h-4" />
                <span>Added to your Kanban Submission Tracker!</span>
              </div>
            ) : (
              <form onSubmit={handleSaveToTracker} className="space-y-4">
                <div>
                  <label htmlFor="track-paper" className="block text-sm font-medium text-ink-soft mb-1.5">
                    Paper Title / Working Draft Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Scalable Graph Transformers for Protein Folding"
                    value={trackPaperTitle}
                    onChange={(e) => setTrackPaperTitle(e.target.value)}
                    id="track-paper" autoFocus className="input-base text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="track-stage" className="block text-sm font-medium text-ink-soft mb-1.5">
                    Target Pipeline Stage
                  </label>
                  <select
                    value={trackStatus}
                    onChange={(e) => setTrackStatus(e.target.value)}
                    id="track-stage" className="input-base text-sm"
                  >
                    <option value="Bookmarked">Bookmarked</option>
                    <option value="Drafting">Drafting</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Accepted">Accepted</option>
                  </select>
                </div>

                <div className="p-3 bg-surface-muted border border-line rounded-lg text-xs text-ink-soft space-y-1">
                  <div><strong>Venue:</strong> {trackTarget.name} ({trackTarget.field})</div>
                  <div><strong>Official Deadline:</strong> {deadlineLabel(trackTarget, 'Open / TBA')}</div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setTrackTarget(null)}
                    className="btn-ghost cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary cursor-pointer"
                  >
                    Save to Tracker
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
