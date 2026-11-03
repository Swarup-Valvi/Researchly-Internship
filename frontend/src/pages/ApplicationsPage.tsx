import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTracking } from '../hooks/useTracking';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSpinner, ErrorState, EmptyState } from '../components/States';
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationRecord } from '../types';

export function ApplicationsPage() {
  const { applications, loading, error, refresh, update, remove } = useTracking();
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states for in-card editing
  const [editStatus, setEditStatus] = useState<ApplicationStatus>('Interested');
  const [editNotes, setEditNotes] = useState('');
  const [editSubmittedAt, setEditSubmittedAt] = useState('');
  const [editDecisionAt, setEditDecisionAt] = useState('');

  // Status counts for pipeline tabs
  const getCount = (status: string) => applications.filter(a => a.status === status).length;

  const filteredApps = useMemo(() => {
    let result = applications;
    if (selectedFilter !== 'all') {
      result = result.filter(a => a.status === selectedFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        (a.conference_name ?? '').toLowerCase().includes(q) ||
        (a.conference_id ?? '').toLowerCase().includes(q) ||
        (a.conference_title ?? '').toLowerCase().includes(q) ||
        (a.notes ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [applications, selectedFilter, searchQuery]);

  if (loading) return <LoadingSpinner message="Loading applications pipeline..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const startEdit = (app: ApplicationRecord) => {
    setEditingId(app.conference_id);
    setEditStatus(app.status);
    setEditNotes(app.notes ?? '');
    setEditSubmittedAt(app.submitted_at?.slice(0, 10) ?? '');
    setEditDecisionAt(app.decision_at?.slice(0, 10) ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (conferenceId: string) => {
    await update(conferenceId, {
      status: editStatus,
      notes: editNotes || undefined,
      submitted_at: editSubmittedAt || undefined,
      decision_at: editDecisionAt || undefined,
    });
    setEditingId(null);
  };

  const getNextStage = (status: ApplicationStatus): ApplicationStatus | null => {
    switch (status) {
      case 'Interested':
        return 'Shortlisted';
      case 'Shortlisted':
        return 'Preparing';
      case 'Preparing':
        return 'Submitted';
      case 'Submitted':
        return 'Under Review';
      case 'Under Review':
        return 'Accepted';
      default:
        return null;
    }
  };

  const renderDeadlineUrgency = (app: ApplicationRecord) => {
    if (!app.submission_deadline) return 'TBD';
    const days = app.days_until_deadline;
    if (app.deadline_urgency === 'passed') {
      return `${app.submission_deadline} (Passed)`;
    }
    if (app.deadline_urgency === 'today') {
      return `${app.submission_deadline} (⚡ Due Today!)`;
    }
    if (app.deadline_urgency === 'urgent') {
      return `${app.submission_deadline} (🔥 ${days}d left)`;
    }
    if (app.deadline_urgency === 'approaching') {
      return `${app.submission_deadline} (⏳ ${days}d left)`;
    }
    return `${app.submission_deadline} (${days != null ? `${days}d left` : ''})`;
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Applications & Submission Pipeline
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track and manage your research papers from initial shortlisting through peer review to acceptance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/tracking" className="btn-secondary text-xs">
            📋 Table View
          </Link>
          <Link to="/conferences" className="btn-primary text-xs">
            + Add Conference
          </Link>
        </div>
      </div>

      {/* Pipeline Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 border-l-4 border-l-blue-500">
          <p className="text-[11px] uppercase font-bold text-slate-400">Planning & Prep</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {getCount('Interested') + getCount('Shortlisted') + getCount('Preparing')}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Interested, Shortlisted, Preparing</p>
        </div>

        <div className="card p-4 border-l-4 border-l-violet-500">
          <p className="text-[11px] uppercase font-bold text-slate-400">Under Review</p>
          <p className="text-2xl font-extrabold text-violet-600 mt-1">
            {getCount('Submitted') + getCount('Under Review')}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Submitted & In Review</p>
        </div>

        <div className="card p-4 border-l-4 border-l-emerald-500">
          <p className="text-[11px] uppercase font-bold text-slate-400">Accepted</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">
            {getCount('Accepted')}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Ready for publication</p>
        </div>

        <div className="card p-4 border-l-4 border-l-slate-400">
          <p className="text-[11px] uppercase font-bold text-slate-400">Concluded / Other</p>
          <p className="text-2xl font-extrabold text-slate-600 mt-1">
            {getCount('Rejected') + getCount('Withdrawn')}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Rejected or Withdrawn</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2 flex-1">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Applications ({applications.length})
            </button>

            {APPLICATION_STATUSES.map(s => {
              const count = getCount(s);
              return (
                <button
                  key={s}
                  onClick={() => setSelectedFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    selectedFilter === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {s} {count > 0 ? `(${count})` : ''}
                </button>
              );
            })}
          </div>

          <div className="sm:w-64">
            <input
              type="text"
              placeholder="Search applications..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input text-xs w-full"
            />
          </div>
        </div>
      </div>

      {/* Application Cards List */}
      {filteredApps.length === 0 ? (
        <EmptyState
          message={
            selectedFilter === 'all'
              ? 'No applications found. Track conferences to monitor your submissions.'
              : `No conference applications in status "${selectedFilter}".`
          }
          icon="🗂️"
          actionText={selectedFilter !== 'all' ? 'Show all applications' : 'Browse conferences'}
          onAction={() =>
            selectedFilter !== 'all'
              ? setSelectedFilter('all')
              : window.location.assign('/conferences')
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredApps.map(app => {
            const nextStage = getNextStage(app.status);
            return (
              <div
                key={app.conference_id}
                className="card p-5 hover:border-slate-300 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/conferences/${encodeURIComponent(app.conference_id)}`}
                        className="font-bold text-slate-900 text-base hover:text-blue-600 transition-colors"
                      >
                        {app.conference_name ?? app.conference_id}
                      </Link>
                      <StatusBadge status={app.status} />
                    </div>
                    {app.conference_title && (
                      <p className="text-xs text-slate-500 font-medium">
                        {app.conference_title}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {nextStage && (
                      <button
                        onClick={() =>
                          update(app.conference_id, {
                            status: nextStage,
                            submitted_at:
                              nextStage === 'Submitted' && !app.submitted_at
                                ? new Date().toISOString()
                                : undefined,
                          })
                        }
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold py-1 px-2.5 rounded-lg transition-colors"
                        title={`Advance status to ${nextStage}`}
                      >
                        ➜ Advance to {nextStage}
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(app)}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      ✏️ Edit Record
                    </button>
                    <Link
                      to={`/conferences/${encodeURIComponent(app.conference_id)}`}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      Details
                    </Link>
                    <button
                      onClick={() => remove(app.conference_id)}
                      className="btn-danger text-xs py-1 px-2.5"
                      title="Remove from tracking"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Status details line */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      CFP Deadline
                    </span>
                    <span className="font-semibold text-slate-800">
                      {renderDeadlineUrgency(app)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Event Dates
                    </span>
                    <span className="font-semibold text-slate-800">
                      {app.start_date ?? 'TBD'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Paper Submitted
                    </span>
                    <span className="font-semibold text-slate-800">
                      {app.submitted_at ? app.submitted_at.slice(0, 10) : 'Not submitted yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Decision Date
                    </span>
                    <span className="font-semibold text-slate-800">
                      {app.decision_at ? app.decision_at.slice(0, 10) : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {app.notes && (
                  <div className="p-2.5 bg-blue-50/50 rounded-lg border border-blue-100 text-xs text-slate-700">
                    <span className="font-semibold text-blue-900 block mb-0.5">Research & Tracking Notes:</span>
                    <p className="whitespace-pre-wrap">{app.notes}</p>
                  </div>
                )}

                {/* In-place editor */}
                {editingId === app.conference_id && (
                  <div className="p-4 bg-slate-100/70 rounded-xl border border-slate-200 space-y-3 mt-3 animate-fadeIn">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Edit Submission Record for {app.conference_name ?? app.conference_id}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="label">Status</label>
                        <select
                          className="select text-xs font-semibold"
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value as ApplicationStatus)}
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
                          value={editSubmittedAt}
                          onChange={e => setEditSubmittedAt(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Decision Notification Date</label>
                        <input
                          type="date"
                          className="input text-xs"
                          value={editDecisionAt}
                          onChange={e => setEditDecisionAt(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Notes / Working Paper Title / Review Feedback</label>
                      <textarea
                        rows={2}
                        className="input text-xs resize-y"
                        placeholder="Add submission tracking notes..."
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={cancelEdit} className="btn-secondary text-xs">
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(app.conference_id)}
                        className="btn-primary text-xs"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
