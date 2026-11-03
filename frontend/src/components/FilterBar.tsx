import type { ConferenceFilters } from '../types';

interface Props {
  filters: ConferenceFilters;
  onChange: (updates: Partial<ConferenceFilters>) => void;
  onReset: () => void;
  totalCount: number;
}

const EVENT_TYPES = [
  { value: 'conference', label: 'Conferences' },
  { value: 'workshop', label: 'Workshops' },
  { value: 'symposium', label: 'Symposia' },
  { value: 'summit', label: 'Summits' },
  { value: 'seminar', label: 'Seminars' },
];

const EVENT_STATUSES = [
  'Upcoming',
  'In progress',
  'Completed',
  'Postponed',
  'Cancelled',
];

const SUBMISSION_STATUSES = [
  'Open',
  'Deadline passed',
  'Deadline unknown',
  'Not accepting submissions',
];

const FORMATS = ['In-Person', 'Hybrid', 'Virtual'];

export function FilterBar({ filters, onChange, onReset, totalCount }: Props) {
  const hasActiveFilters = Boolean(
    filters.event_type ||
      filters.event_status ||
      filters.submission_status ||
      filters.format_type ||
      filters.topic ||
      filters.country_or_city ||
      filters.include_historical
  );

  return (
    <div className="card p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Filter Conferences</h2>
          <p className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-800">{totalCount}</span> matching academic events
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <span>✕</span> Reset filters
            </button>
          )}

          {/* Historical checkbox toggle */}
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors select-none">
            <input
              type="checkbox"
              checked={Boolean(filters.include_historical)}
              onChange={e => onChange({ include_historical: e.target.checked || undefined })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            Include past / historical events
          </label>
        </div>
      </div>

      {/* Filter Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Event Type Filter */}
        <div>
          <label className="label" htmlFor="filter-event-type">Event Type</label>
          <select
            id="filter-event-type"
            className="select"
            value={filters.event_type ?? ''}
            onChange={e => onChange({ event_type: e.target.value || undefined })}
          >
            <option value="">All Event Types</option>
            {EVENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Event Lifecycle Status */}
        <div>
          <label className="label" htmlFor="filter-event-status">Event Lifecycle</label>
          <select
            id="filter-event-status"
            className="select"
            value={filters.event_status ?? ''}
            onChange={e => onChange({ event_status: e.target.value || undefined })}
          >
            <option value="">All Event Statuses</option>
            {EVENT_STATUSES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Submission Status */}
        <div>
          <label className="label" htmlFor="filter-submission-status">Submissions</label>
          <select
            id="filter-submission-status"
            className="select"
            value={filters.submission_status ?? ''}
            onChange={e => onChange({ submission_status: e.target.value || undefined })}
          >
            <option value="">All Submission States</option>
            {SUBMISSION_STATUSES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Attendance Format */}
        <div>
          <label className="label" htmlFor="filter-format">Format</label>
          <select
            id="filter-format"
            className="select"
            value={filters.format_type ?? ''}
            onChange={e => onChange({ format_type: e.target.value || undefined })}
          >
            <option value="">All Formats</option>
            {FORMATS.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Topic Search */}
        <div>
          <label className="label" htmlFor="filter-topic">Topic or Area</label>
          <input
            id="filter-topic"
            type="text"
            className="input"
            placeholder="e.g. Vision, NLP, AI"
            value={filters.topic ?? ''}
            onChange={e => onChange({ topic: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  );
}
