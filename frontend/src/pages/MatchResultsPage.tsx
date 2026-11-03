import { useLocation, Link, useNavigate } from 'react-router-dom';
import type { MatchingResult, ConferenceRecommendation } from '../types';
import { useTracking } from '../hooks/useTracking';
import { CredibilityBadge } from '../components/CredibilityBadge';

function RecommendationCard({
  rec,
  isTracked,
  isLoading,
  onTrackToggle,
}: {
  rec: ConferenceRecommendation;
  isTracked: boolean;
  isLoading: boolean;
  onTrackToggle: () => void;
}) {
  const scorePercent = (rec.relevance_score * 100).toFixed(1);

  return (
    <div className="card p-5 hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between gap-4">
      <div className="space-y-3">
        {/* Header: Rank, Score, and Title */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                #{rec.relevance_rank}
              </span>
              <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                {scorePercent}% match
              </span>
              {rec.location_match && (
                <span className="badge bg-teal-50 text-teal-700 border border-teal-200 text-[10px]">
                  📍 Location match
                </span>
              )}
            </div>

            <Link
              to={`/conferences/${encodeURIComponent(rec.conference_id)}`}
              className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1"
            >
              {rec.conference_name} {rec.edition_or_year}
            </Link>
            {rec.title && (
              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                {rec.title}
              </p>
            )}
          </div>

          <CredibilityBadge riskLevel={rec.credibility.risk_level} size="sm" />
        </div>

        {/* Temporal & Location Info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
              Deadline
            </span>
            <span className="font-medium text-slate-800">
              {rec.submission_deadline ?? 'Unannounced'}
            </span>
            {rec.days_until_deadline != null && (
              <span className="block text-[11px] text-slate-500">
                {rec.days_until_deadline >= 0
                  ? `(${rec.days_until_deadline} days remaining)`
                  : `(${Math.abs(rec.days_until_deadline)} days ago)`}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">
              Location
            </span>
            <span className="font-medium text-slate-800 truncate block">
              {rec.location ?? 'TBD'}
            </span>
          </div>
        </div>

        {/* Explainable Match Reasoning */}
        <p className="text-xs text-slate-600 leading-relaxed italic bg-white border-l-2 border-blue-400 pl-2.5 py-0.5">
          "{rec.match_explanation}"
        </p>

        {/* Matched keywords / topics */}
        {rec.topic_overlap && (
          <div className="space-y-1">
            {rec.topic_overlap.matched_conference_topics.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mr-1">
                  Topics:
                </span>
                {rec.topic_overlap.matched_conference_topics.map(t => (
                  <span
                    key={t}
                    className="badge bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.2"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {rec.topic_overlap.common_terms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mr-1">
                  Terms:
                </span>
                {rec.topic_overlap.common_terms.slice(0, 5).map(term => (
                  <span
                    key={term}
                    className="badge bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.2"
                  >
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Link
          to={`/conferences/${encodeURIComponent(rec.conference_id)}`}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          View assessment & CFP →
        </Link>

        <button
          onClick={onTrackToggle}
          disabled={isLoading}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
            isTracked
              ? 'bg-blue-50 text-blue-700 border border-blue-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
              : 'btn-primary text-xs'
          }`}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              Saving...
            </span>
          ) : isTracked ? (
            '✓ Shortlisted'
          ) : (
            '+ Shortlist'
          )}
        </button>
      </div>
    </div>
  );
}

export function MatchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isTracked, track, remove, actionLoadingId, feedback, applications } = useTracking();

  const state = location.state as { result?: MatchingResult; paperTitle?: string } | undefined;
  const result = state?.result;
  const paperTitle = state?.paperTitle ?? result?.paper_title ?? 'Untitled Paper';

  if (!result) {
    return (
      <div className="card p-12 text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="text-4xl">📄</div>
        <h2 className="text-lg font-bold text-slate-800">No match results available</h2>
        <p className="text-sm text-slate-500">
          Please submit a research paper abstract on the AI Match page to generate recommendations.
        </p>
        <Link to="/match" className="btn-primary text-xs inline-flex">
          Go to AI Match
        </Link>
      </div>
    );
  }

  const openCount = result.upcoming_open_deadline.length;
  const passedCount = result.upcoming_passed_deadline.length;
  const unknownCount = result.upcoming_unknown_deadline.length;
  const historicalCount = result.historical_completed.length;
  const totalMatches = openCount + passedCount + unknownCount + historicalCount + result.date_unknown.length;

  return (
    <div className="space-y-8 animate-fadeIn max-w-6xl mx-auto relative">
      {/* Toast Feedback */}
      {feedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>{feedback}</span>
          <Link to="/tracking" className="text-blue-400 hover:underline ml-2">
            View Tracking ({applications.length}) →
          </Link>
        </div>
      )}

      {/* Results Header Banner */}
      <div className="card p-6 sm:p-8 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs uppercase font-bold tracking-wider text-blue-300">
              Match Intelligence Results
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              "{paperTitle}"
            </h1>
            <p className="text-xs sm:text-sm text-blue-100">
              Evaluated against <span className="font-bold">{result.total_conferences_evaluated}</span> conferences • Found <span className="font-bold">{totalMatches}</span> relevant matches
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              to="/tracking"
              className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-700/60 hover:bg-blue-600/60 text-white border border-blue-400/40 transition-colors"
            >
              📋 My Shortlist ({applications.length})
            </Link>
            <button
              onClick={() => navigate('/match')}
              className="btn-secondary text-xs bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              ← Match Another Paper
            </button>
          </div>
        </div>
      </div>

      {/* Category 1: Upcoming with Open Deadlines */}
      {openCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>📩</span> Open Submission Opportunities
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  {openCount}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Conferences where you can currently submit your research
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.upcoming_open_deadline.map(rec => {
              const tracked = isTracked(rec.conference_id);
              return (
                <RecommendationCard
                  key={rec.conference_id}
                  rec={rec}
                  isTracked={tracked}
                  isLoading={actionLoadingId === rec.conference_id}
                  onTrackToggle={() =>
                    tracked ? remove(rec.conference_id) : track(rec.conference_id, 'Shortlisted')
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Category 2: Upcoming but Deadline Passed */}
      {passedCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>⏳</span> Upcoming Events — Submission Deadline Passed
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                {passedCount}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Conferences taking place in the future, but standard paper submission has closed
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.upcoming_passed_deadline.map(rec => {
              const tracked = isTracked(rec.conference_id);
              return (
                <RecommendationCard
                  key={rec.conference_id}
                  rec={rec}
                  isTracked={tracked}
                  isLoading={actionLoadingId === rec.conference_id}
                  onTrackToggle={() =>
                    tracked ? remove(rec.conference_id) : track(rec.conference_id, 'Shortlisted')
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Category 3: Upcoming with Unknown Deadline */}
      {unknownCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>❓</span> Upcoming Events — Deadline Unannounced
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                {unknownCount}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Upcoming academic events where CFP submission dates have not yet been posted
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.upcoming_unknown_deadline.map(rec => {
              const tracked = isTracked(rec.conference_id);
              return (
                <RecommendationCard
                  key={rec.conference_id}
                  rec={rec}
                  isTracked={tracked}
                  isLoading={actionLoadingId === rec.conference_id}
                  onTrackToggle={() =>
                    tracked ? remove(rec.conference_id) : track(rec.conference_id, 'Shortlisted')
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Category 4: Historical Completed Conferences */}
      {historicalCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
              <span>📚</span> Historical / Completed Editions (Reference Only)
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                {historicalCount}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Conferences that have already concluded; inspect for future edition planning and topic fit
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.historical_completed.map(rec => {
              const tracked = isTracked(rec.conference_id);
              return (
                <RecommendationCard
                  key={rec.conference_id}
                  rec={rec}
                  isTracked={tracked}
                  isLoading={actionLoadingId === rec.conference_id}
                  onTrackToggle={() =>
                    tracked ? remove(rec.conference_id) : track(rec.conference_id, 'Shortlisted')
                  }
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
