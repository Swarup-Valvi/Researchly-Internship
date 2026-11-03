import { Link } from 'react-router-dom';
import type { Conference } from '../types';

function EventLifecycleBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Upcoming: 'bg-blue-50 text-blue-700 border border-blue-200',
    'In progress': 'bg-purple-50 text-purple-700 border border-purple-200',
    Completed: 'bg-slate-100 text-slate-600 border border-slate-200',
    Postponed: 'bg-amber-50 text-amber-700 border border-amber-200',
    Cancelled: 'bg-rose-50 text-rose-700 border border-rose-200',
    'Date unknown': 'bg-slate-50 text-slate-500 border border-slate-200',
  };
  return (
    <span className={`badge ${map[status] ?? 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
      {status}
    </span>
  );
}

function SubmissionDeadlineBadge({
  submissionStatus,
  deadline,
}: {
  submissionStatus: string;
  deadline?: string | null;
}) {
  if (submissionStatus === 'Open') {
    return (
      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
        Open {deadline ? `• ${deadline}` : ''}
      </span>
    );
  }
  if (submissionStatus === 'Deadline passed') {
    return (
      <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
        Deadline passed {deadline ? `• ${deadline}` : ''}
      </span>
    );
  }
  return (
    <span className="badge bg-slate-100 text-slate-600 border border-slate-200">
      {submissionStatus}
    </span>
  );
}

interface Props {
  conference: Conference;
  isTracked?: boolean;
  onTrackToggle?: () => void;
  trackingDisabled?: boolean;
}

export function ConferenceCard({
  conference: c,
  isTracked,
  onTrackToggle,
  trackingDisabled,
}: Props) {
  return (
    <div className="card p-5 hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between gap-4 group">
      <div>
        {/* Header: Title and Status */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <Link
              to={`/conferences/${encodeURIComponent(c.id)}`}
              className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-base line-clamp-1"
            >
              {c.name} {c.edition_or_year}
            </Link>
            {c.title && (
              <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                {c.title}
              </p>
            )}
          </div>
          <EventLifecycleBadge status={c.event_status} />
        </div>

        {/* Status badges row */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <SubmissionDeadlineBadge
            submissionStatus={c.submission_status}
            deadline={c.submission_deadline}
          />
          {c.event_type && c.event_type !== 'conference' && (
            <span className="badge bg-slate-100 text-slate-700 border border-slate-200 capitalize">
              {c.event_type}
            </span>
          )}
          {c.format && (
            <span className="badge bg-sky-50 text-sky-700 border border-sky-200">
              {c.format}
            </span>
          )}
          {!c.has_paper_submission && (
            <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
              Attendance-only
            </span>
          )}
        </div>

        {/* Details snippet */}
        <div className="space-y-1 text-xs text-slate-600 mb-3">
          {c.location && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">📍</span>
              <span className="truncate">{c.location}</span>
            </div>
          )}
          {c.start_date && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">📅</span>
              <span>
                {c.start_date}
                {c.end_date ? ` to ${c.end_date}` : ''}
              </span>
            </div>
          )}
          {c.organizer && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">🏢</span>
              <span className="truncate">{c.organizer}</span>
            </div>
          )}
        </div>

        {/* Topics */}
        {c.topics && c.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {c.topics.slice(0, 3).map(t => (
              <span
                key={t}
                className="badge bg-blue-50/70 text-blue-700 text-[11px] px-2 py-0.5 font-normal"
              >
                {t}
              </span>
            ))}
            {c.topics.length > 3 && (
              <span className="text-[11px] text-slate-400 px-1 py-0.5 self-center">
                +{c.topics.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Link
          to={`/conferences/${encodeURIComponent(c.id)}`}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          View assessment & details →
        </Link>

        {onTrackToggle && (
          <button
            onClick={onTrackToggle}
            disabled={trackingDisabled}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
              isTracked
                ? 'bg-blue-50 text-blue-700 border border-blue-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {isTracked ? '✓ Shortlisted' : '+ Track'}
          </button>
        )}
      </div>
    </div>
  );
}
