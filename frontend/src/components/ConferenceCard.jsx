import React from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Clock,
  Layers,
  Award,
  BookmarkPlus,
  Video
} from 'lucide-react';

export default function ConferenceCard({ conference, onTrack }) {
  const getRiskBadge = (risk, score) => {
    if (risk === 'Low' || score >= 80) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Low Risk ({score}/100)</span>
        </span>
      );
    }
    if (risk === 'Medium' || score >= 50) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Medium Risk ({score}/100)</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
        <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
        <span>Predatory Alert ({score}/100)</span>
      </span>
    );
  };

  const getDeadlinePill = (deadlineStr) => {
    if (!deadlineStr) return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <Video className="w-3 h-3 text-indigo-500" />
        Open Stream
      </span>
    );
    const now = new Date();
    const d = new Date(deadlineStr);
    const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          <Clock className="w-3 h-3 text-slate-400" />
          Passed
        </span>
      );
    }
    if (diffDays <= 14) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <Clock className="w-3 h-3 text-rose-600" />
          {diffDays}d left
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
        <Clock className="w-3 h-3 text-blue-500" />
        {diffDays}d left
      </span>
    );
  };

  const isWebinar = conference.event_type === 'Webinar' || conference.format === 'Webinar';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-300 hover:shadow-lg transition-all duration-200 p-6 flex flex-col justify-between group">
      <div>
        {/* Top Header: Risk badge & Deadline */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          {getRiskBadge(conference.risk_level, conference.credibility_score)}
          <div className="flex items-center gap-1.5">
            {conference.is_extended && (
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Extended
              </span>
            )}
            {getDeadlinePill(conference.submission_deadline)}
          </div>
        </div>

        {/* Title and Edition */}
        <div className="mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition">
              <Link to={`/conferences/${conference.id || conference.slug}`}>
                {conference.name} {conference.edition}
              </Link>
            </h3>
            {conference.ranking && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                {conference.ranking}
              </span>
            )}
            {isWebinar && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                Webinar
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 font-medium line-clamp-1 mt-1">
            {conference.title || conference.field}
          </p>
        </div>

        {/* Metadata Details */}
        <div className="space-y-2.5 my-3.5 text-sm text-slate-600 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="truncate">
              <strong className="text-slate-800 font-semibold">{isWebinar ? 'Schedule:' : 'Deadline:'}</strong> {conference.raw_deadline || conference.submission_deadline || 'TBA'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">
              {conference.location || 'Location TBA'} •{' '}
              <span className="text-slate-700 font-semibold">{conference.format || 'In-Person'}</span>
            </span>
          </div>
          {conference.publisher && (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="truncate text-slate-500">Publisher: <span className="font-medium text-slate-700">{conference.publisher}</span></span>
            </div>
          )}
        </div>

        {/* Topics Chips */}
        {conference.topics && conference.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
            {conference.topics.slice(0, 3).map((topic, i) => (
              <span
                key={i}
                className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200/60"
              >
                #{topic}
              </span>
            ))}
            {conference.topics.length > 3 && (
              <span className="text-xs text-slate-400 px-1 py-1 font-medium">
                +{conference.topics.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <Link
          to={`/conferences/${conference.id || conference.slug}`}
          className="text-sm font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group/btn"
        >
          <span>Credibility Audit</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition" />
        </Link>

        <div className="flex items-center gap-1.5">
          <Link
            to={`/ai-match?target=${encodeURIComponent(conference.name)}`}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition"
            title="Match my research paper against this venue"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </Link>
          {conference.official_url && (
            <a
              href={conference.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              title="Official portal"
            >
              <ExternalLink className="w-4 h-4 text-slate-500" />
            </a>
          )}
          {onTrack && (
            <button
              onClick={() => onTrack(conference)}
              className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-blue-600 text-white rounded-xl shadow-xs transition cursor-pointer"
              title="Track in Kanban Pipeline"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Track</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
