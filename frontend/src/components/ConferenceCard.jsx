import React from 'react';
import { Link } from 'react-router-dom';
import { daysLeft, deadlineLabel } from '../lib/deadline';
import { eventDatesLabel } from '../lib/discover';
import ReminderBell from './ReminderBell';
import { CalendarDays, MapPin, Clock, Sparkles, ExternalLink, BookmarkPlus, Layers } from 'lucide-react';
import RiskBadge from './RiskBadge';

/** Deadline countdown. Urgency is not a risk state, so it uses the accent / neutral tones only. */
function Countdown({ conference }) {
  if (!conference?.submission_deadline) {
    return <span className="chip border-line bg-surface-muted text-ink-muted">No deadline listed</span>;
  }
  const d = daysLeft(conference);
  if (d < 0) return <span className="chip border-line bg-surface-muted text-ink-muted">Deadline passed</span>;
  const label = d === 0 ? 'Due today' : d === 1 ? '1 day left' : `${d} days left`;
  return (
    <span className={`chip tabular-nums ${d <= 14 ? 'border-accent bg-accent text-accent-fg' : 'border-accent-200 bg-accent-50 text-accent-700'}`}>
      <Clock aria-hidden="true" className="w-3 h-3" />
      {label}
    </span>
  );
}

export default function ConferenceCard({ conference, onTrack }) {
  const href = `/conferences/${conference.id || conference.slug}`;
  const isWebinar = conference.event_type === 'Webinar' || conference.format === 'Webinar';
  const place = conference.location || conference.venue || 'Location not stated';

  return (
    <article className="relative w-full min-w-0 card p-5 flex flex-col gap-4 transition duration-150 hover:border-line-strong hover:shadow-md focus-within:border-accent-300 focus-within:shadow-focus">
      <header className="space-y-2">
        {/* Meta row: countdown first (most time-sensitive), then classification chips. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Countdown conference={conference} />
          {conference.ranking && (
            <span className="chip border-line bg-surface-muted text-ink-soft font-mono">{conference.ranking}</span>
          )}
          {isWebinar && <span className="chip border-line bg-surface-muted text-ink-soft">Webinar</span>}
          {conference.is_extended && <span className="chip border-line bg-surface-muted text-ink-soft">Extended</span>}
        </div>
        <h3 className="text-lg font-semibold text-ink leading-6">
          {/* Stretched link: the whole card is clickable, but it is ONE tab stop. */}
          <Link to={href} className="after:absolute after:inset-0 after:rounded-xl hover:text-accent-700 transition-colors duration-150">
            {conference.name} <span className="text-ink-muted font-normal">{conference.edition}</span>
          </Link>
        </h3>
        <p className="text-sm text-ink-muted line-clamp-2">{conference.title || conference.field}</p>
      </header>

      <dl className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 text-sm leading-5">
        <dt className="sr-only">Submission deadline</dt>
        <CalendarDays aria-hidden="true" className="w-4 h-4 text-ink-faint" />
        <dd className="text-ink-soft min-w-0 truncate">
          <span className="text-ink-muted">{isWebinar ? 'Schedule' : 'Deadline'}</span>{' '}
          <span className="font-medium text-ink">{deadlineLabel(conference)}</span>
        </dd>
        <dt className="sr-only">Event dates</dt>
        <Clock aria-hidden="true" className="w-4 h-4 text-ink-faint" />
        <dd className="text-ink-soft truncate"><span className="text-ink-muted">Dates</span> <span className="tabular-nums">{eventDatesLabel(conference)}</span></dd>
        <dt className="sr-only">Location</dt>
        <MapPin aria-hidden="true" className="w-4 h-4 text-ink-faint" />
        <dd className="text-ink-soft truncate">{place}{conference.format ? <span className="text-ink-muted"> · {conference.format}</span> : null}</dd>
        {conference.publisher && (
          <>
            <dt className="sr-only">Publisher</dt>
            <Layers aria-hidden="true" className="w-4 h-4 text-ink-faint" />
            <dd className="text-ink-muted truncate">{conference.publisher}</dd>
          </>
        )}
      </dl>

      {conference.topics?.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
          {conference.topics.slice(0, 3).map((t) => (
            <li key={t} className="text-xs leading-5 text-ink-soft px-2 rounded-md bg-surface-sunken">{t}</li>
          ))}
          {conference.topics.length > 3 && <li className="text-xs text-ink-muted px-1 py-0.5">+{conference.topics.length - 3}</li>}
        </ul>
      )}

      <footer className="mt-auto pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
        <RiskBadge risk={conference.risk_level} score={conference.credibility_score} />
        {/* relative z-10: actions sit above the stretched card link */}
        <div className="relative z-10 ml-auto flex items-center gap-1">
          <ReminderBell conference={conference} />
          <Link
            to={`/ai-match?target=${encodeURIComponent(conference.name)}`}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors duration-150"
            aria-label={`Match my paper against ${conference.name}`}
            title="Match my paper against this venue"
          >
            <Sparkles aria-hidden="true" className="w-4 h-4" />
          </Link>
          {conference.official_url && (
            <a
              href={conference.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-sunken transition-colors duration-150"
              aria-label={`${conference.name} official website (opens in a new tab)`}
              title="Official website"
            >
              <ExternalLink aria-hidden="true" className="w-4 h-4" />
            </a>
          )}
          {onTrack && (
            <button
              type="button"
              onClick={() => onTrack(conference)}
              className="btn-secondary px-3 py-1.5 text-xs cursor-pointer"
              aria-label={`Track a paper for ${conference.name} ${conference.edition || ''}`}
            >
              <BookmarkPlus aria-hidden="true" className="w-3.5 h-3.5" />
              Track
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
