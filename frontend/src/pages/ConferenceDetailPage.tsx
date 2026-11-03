import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useConferenceDetail } from '../hooks/useCredibility';
import { useTracking } from '../hooks/useTracking';
import { CredibilityPanel } from '../components/CredibilityPanel';
import { CredibilityBadge } from '../components/CredibilityBadge';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSpinner, ErrorState } from '../components/States';
import { APPLICATION_STATUSES, type ApplicationStatus } from '../types';

export function ConferenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    conference: c,
    credibility,
    loading,
    assessing,
    error,
    refresh,
    triggerAssessment,
  } = useConferenceDetail(id ?? '');

  const { isTracked, getApp, track, update, remove } = useTracking();
  const [editingTracking, setEditingTracking] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus>('Interested');
  const [notes, setNotes] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');
  const [decisionAt, setDecisionAt] = useState('');

  if (loading) return <LoadingSpinner message="Loading conference profile & credibility..." />;
  if (error || !c) {
    return (
      <div className="space-y-4">
        <Link to="/conferences" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
          ← Back to conference directory
        </Link>
        <ErrorState message={error ?? 'Conference record not found'} onRetry={refresh} />
      </div>
    );
  }

  const tracked = isTracked(c.id);
  const currentApp = getApp(c.id);

  const handleStartTracking = async () => {
    await track(c.id, 'Shortlisted');
  };

  const handleSaveTracking = async () => {
    if (!currentApp) return;
    await update(c.id, {
      status: selectedStatus,
      notes: notes || undefined,
      submitted_at: submittedAt || undefined,
      decision_at: decisionAt || undefined,
    });
    setEditingTracking(false);
  };

  const openEditTracking = () => {
    if (currentApp) {
      setSelectedStatus(currentApp.status);
      setNotes(currentApp.notes ?? '');
      setSubmittedAt(currentApp.submitted_at?.slice(0, 10) ?? '');
      setDecisionAt(currentApp.decision_at?.slice(0, 10) ?? '');
      setEditingTracking(true);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/conferences" className="hover:text-slate-800 transition-colors">
          Conferences
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800 truncate">
          {c.name} {c.edition_or_year}
        </span>
      </nav>

      {/* Main Conference Header Card */}
      <div className="card p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {c.name} {c.edition_or_year}
              </h1>
              <span className="badge bg-slate-100 text-slate-700 border border-slate-200 capitalize text-xs">
                {c.event_type}
              </span>
              <span className="badge bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                {c.event_status}
              </span>
            </div>

            {c.title && (
              <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-3xl">
                {c.title}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 self-start shrink-0">
            {credibility && <CredibilityBadge riskLevel={credibility.risk_level} size="lg" />}
          </div>
        </div>

        {/* Primary Meta Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Submission Deadline
            </span>
            <p className="text-sm font-bold text-slate-800">
              {c.submission_deadline ?? 'Unannounced / Unknown'}
            </p>
            {c.raw_submission_deadline_str && (
              <p className="text-xs text-slate-400 italic">
                Source: "{c.raw_submission_deadline_str}"
              </p>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Conference Dates
            </span>
            <p className="text-sm font-semibold text-slate-800">
              {c.start_date ? `${c.start_date} ${c.end_date ? `to ${c.end_date}` : ''}` : 'Dates TBD'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Location & Format
            </span>
            <p className="text-sm font-semibold text-slate-800">
              {c.location ?? 'Location TBD'}
              {c.format ? ` (${c.format})` : ''}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Publisher / Proceedings
            </span>
            <p className="text-sm text-slate-700 font-medium">
              {c.publisher ?? 'Independent / Not specified'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Organizing Society
            </span>
            <p className="text-sm text-slate-700 font-medium">
              {c.organizer ?? 'Independent Program Committee'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Registration Fees
            </span>
            <p className="text-sm text-slate-700 font-medium">
              {c.registration_fees ?? 'Not published'}
            </p>
          </div>
        </div>

        {/* Topics */}
        {c.topics && c.topics.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Subject Areas & Keywords
            </span>
            <div className="flex flex-wrap gap-1.5">
              {c.topics.map(topic => (
                <span
                  key={topic}
                  className="badge bg-blue-50 text-blue-700 border border-blue-200/60 font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {c.warnings && c.warnings.length > 0 && (
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1">
              Data Quality Warnings
            </h4>
            <ul className="space-y-1">
              {c.warnings.map((w, idx) => (
                <li key={idx} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span>⚠️</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions & Links Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap gap-3">
            {c.official_website_url && (
              <a
                href={c.official_website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                🌐 Official Website ↗
              </a>
            )}
            {c.submission_url && (
              <a
                href={c.submission_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs"
              >
                📤 Submit Paper Portal ↗
              </a>
            )}
          </div>

          {/* Tracking controls */}
          <div>
            {!tracked ? (
              <button onClick={handleStartTracking} className="btn-primary text-xs">
                + Shortlist / Track this Conference
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <StatusBadge status={currentApp?.status ?? 'Interested'} />
                <button onClick={openEditTracking} className="btn-secondary text-xs">
                  ✏️ Edit Application Status
                </button>
                <button onClick={() => remove(c.id)} className="btn-danger text-xs">
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Application Editor Modal / Drawer */}
        {editingTracking && currentApp && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mt-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Update Submission Tracking
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Submission Status</label>
                <select
                  className="select text-xs"
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value as ApplicationStatus)}
                >
                  {APPLICATION_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Paper Submitted Date</label>
                <input
                  type="date"
                  className="input text-xs"
                  value={submittedAt}
                  onChange={e => setSubmittedAt(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Decision Notification Date</label>
                <input
                  type="date"
                  className="input text-xs"
                  value={decisionAt}
                  onChange={e => setDecisionAt(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Notes / Paper Title / Co-authors</label>
              <textarea
                className="input text-xs min-h-[60px] resize-y"
                placeholder="Track submission details, reviewer feedback, or deadlines..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingTracking(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button onClick={handleSaveTracking} className="btn-primary text-xs">
                Save Tracking Record
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Credibility Intelligence Panel */}
      {credibility ? (
        <CredibilityPanel
          assessment={credibility}
          onReassess={triggerAssessment}
          assessing={assessing}
        />
      ) : (
        <div className="card p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">
            No credibility assessment has been generated yet for this conference.
          </p>
          <button
            onClick={triggerAssessment}
            disabled={assessing}
            className="btn-primary text-xs"
          >
            {assessing ? 'Evaluating credibility...' : 'Run Credibility Assessment Now'}
          </button>
        </div>
      )}
    </div>
  );
}
