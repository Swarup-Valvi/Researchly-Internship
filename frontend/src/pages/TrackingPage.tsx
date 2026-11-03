import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTracking } from '../hooks/useTracking';
import { LoadingSpinner, ErrorState, EmptyState } from '../components/States';
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationRecord } from '../types';

export function TrackingPage() {
  const { applications, loading, error, refresh, update, remove } = useTracking();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'deadline' | 'name' | 'added'>('deadline');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredAndSortedApps = useMemo(() => {
    let result = [...applications];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(app => app.status === statusFilter);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(app =>
        (app.conference_name ?? '').toLowerCase().includes(q) ||
        (app.conference_id ?? '').toLowerCase().includes(q) ||
        (app.conference_title ?? '').toLowerCase().includes(q) ||
        (app.location ?? '').toLowerCase().includes(q) ||
        (app.notes ?? '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'deadline') {
        // null/unknown deadlines sort to bottom
        if (a.days_until_deadline == null && b.days_until_deadline == null) return 0;
        if (a.days_until_deadline == null) return 1;
        if (b.days_until_deadline == null) return -1;
        return a.days_until_deadline - b.days_until_deadline;
      } else if (sortBy === 'name') {
        const nameA = a.conference_name ?? a.conference_id;
        const nameB = b.conference_name ?? b.conference_id;
        return nameA.localeCompare(nameB);
      } else {
        // newest added first
        const dateA = a.added_at ?? '';
        const dateB = b.added_at ?? '';
        return dateB.localeCompare(dateA);
      }
    });

    return result;
  }, [applications, statusFilter, searchQuery, sortBy]);

  if (loading) return <LoadingSpinner message="Loading tracked conferences..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const renderDeadlineBadge = (app: ApplicationRecord) => {
    const days = app.days_until_deadline;
    const urgency = app.deadline_urgency;

    if (!app.submission_deadline) {
      return <span className="text-slate-400 text-xs italic">Deadline TBD</span>;
    }

    if (urgency === 'passed') {
      return (
        <div>
          <span className="text-slate-700 font-medium text-xs block">{app.submission_deadline}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
            Passed ({Math.abs(days ?? 0)}d ago)
          </span>
        </div>
      );
    }

    if (urgency === 'today') {
      return (
        <div>
          <span className="text-rose-700 font-bold text-xs block">{app.submission_deadline}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
            ⚡ Due Today!
          </span>
        </div>
      );
    }

    if (urgency === 'urgent') {
      return (
        <div>
          <span className="text-rose-700 font-bold text-xs block">{app.submission_deadline}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            🔥 {days} day{days === 1 ? '' : 's'} left
          </span>
        </div>
      );
    }

    if (urgency === 'approaching') {
      return (
        <div>
          <span className="text-amber-700 font-semibold text-xs block">{app.submission_deadline}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            ⏳ {days} days left
          </span>
        </div>
      );
    }

    return (
      <div>
        <span className="text-slate-700 font-medium text-xs block">{app.submission_deadline}</span>
        {days != null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            📅 {days} days left
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Shortlist & Tracking
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Keep track of conference deadlines and manage your paper submission targets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/applications" className="btn-secondary text-xs">
            📊 View Applications Pipeline
          </Link>
          <Link to="/conferences" className="btn-primary text-xs">
            + Browse More Conferences
          </Link>
        </div>
      </div>

      {/* Control Bar: Search, Status Filter, Sort */}
      {applications.length > 0 && (
        <div className="card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4 bg-slate-50/60">
          <div className="flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search tracked conferences or notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input text-xs w-full"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="select text-xs py-1 px-2 font-medium"
              >
                <option value="all">All ({applications.length})</option>
                {APPLICATION_STATUSES.map(s => {
                  const cnt = applications.filter(a => a.status === s).length;
                  return cnt > 0 ? (
                    <option key={s} value={s}>
                      {s} ({cnt})
                    </option>
                  ) : null;
                })}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-500">Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'deadline' | 'name' | 'added')}
                className="select text-xs py-1 px-2 font-medium"
              >
                <option value="deadline">Submission Deadline</option>
                <option value="added">Recently Added</option>
                <option value="name">Conference Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {applications.length === 0 ? (
        <EmptyState
          message="You haven't shortlisted or tracked any conferences yet. Browse conferences or run AI Match to add conferences to your tracking list."
          icon="📋"
          actionText="Browse Conferences"
          onAction={() => window.location.assign('/conferences')}
        />
      ) : filteredAndSortedApps.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <p className="text-slate-600 text-sm">No tracked conferences match your filters.</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
            }}
            className="btn-secondary text-xs"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Conference</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Submission Deadline</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Event Dates</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Location</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Tracking Status</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAndSortedApps.map(app => (
                  <tr key={app.conference_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs">
                      <Link
                        to={`/conferences/${encodeURIComponent(app.conference_id)}`}
                        className="text-blue-600 hover:text-blue-800 transition-colors font-bold block truncate"
                        title={app.conference_name ?? app.conference_id}
                      >
                        {app.conference_name ?? app.conference_id}
                      </Link>
                      {app.conference_title && (
                        <p className="text-[11px] text-slate-400 font-normal truncate mt-0.5">
                          {app.conference_title}
                        </p>
                      )}
                      {app.notes && (
                        <p className="text-[10px] text-blue-600 font-normal truncate mt-1 bg-blue-50/80 px-1.5 py-0.5 rounded inline-block max-w-full">
                          📝 {app.notes}
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {renderDeadlineBadge(app)}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {app.start_date ?? 'Dates TBD'}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {app.location ?? 'TBD'}
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        className="select py-1 px-2 text-xs font-semibold w-36"
                        value={app.status}
                        onChange={e =>
                          update(app.conference_id, {
                            status: e.target.value as ApplicationStatus,
                          })
                        }
                      >
                        {APPLICATION_STATUSES.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {confirmDeleteId === app.conference_id ? (
                        <div className="flex items-center justify-end gap-1.5 animate-fadeIn">
                          <span className="text-[11px] text-rose-600 font-semibold">Remove?</span>
                          <button
                            onClick={async () => {
                              await remove(app.conference_id);
                              setConfirmDeleteId(null);
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold py-1 px-2 rounded"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold py-1 px-2 rounded"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/conferences/${encodeURIComponent(app.conference_id)}`}
                            className="btn-secondary text-xs py-1 px-2.5"
                          >
                            Details
                          </Link>
                          {app.official_website_url && (
                            <a
                              href={app.official_website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                              title="Open official website"
                            >
                              🔗
                            </a>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(app.conference_id)}
                            className="text-slate-300 hover:text-rose-600 transition-colors p-1 text-sm"
                            title="Remove from tracking"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
