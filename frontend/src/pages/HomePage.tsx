import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConferences } from '../hooks/useConferences';
import { useTracking } from '../hooks/useTracking';
import { getHealth } from '../api/client';
import { ConferenceCard } from '../components/ConferenceCard';
import { LoadingSpinner, ErrorState } from '../components/States';

export function HomePage() {
  const { conferences, loading, error, refresh } = useConferences({ include_historical: true });
  const { isTracked, track, remove } = useTracking();
  const [stats, setStats] = useState<{
    conferences: number;
    assessments: number;
    tracked_applications: number;
  } | null>(null);

  useEffect(() => {
    getHealth()
      .then(res => setStats(res))
      .catch(() => null);
  }, []);

  if (loading) return <LoadingSpinner message="Loading live conference data..." />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  const upcomingConferences = conferences.filter(c => c.event_status === 'Upcoming');
  const openSubmissions = conferences.filter(c => c.submission_status === 'Open');
  const paperTrackEvents = conferences.filter(c => c.has_paper_submission);

  return (
    <div className="space-y-10 animate-fadeIn">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-8 sm:p-12 shadow-xl border border-blue-900/40">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            AI-Powered Research Intelligence
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4">
            Discover, Verify & Match <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              Academic Conferences
            </span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8 max-w-xl">
            Never miss a CFP deadline. Verify publisher and organizer credibility with transparent evidence citations, and find best-fit venues for your research.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to="/conferences" className="btn-primary text-sm font-semibold px-5 py-2.5 shadow-md">
              Browse All Conferences
            </Link>
            <Link
              to="/match"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/20 transition-colors shadow-sm"
            >
              ✨ Match Paper with AI
            </Link>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 -mb-16 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Live Dashboard Metrics */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 border-l-4 border-l-blue-500 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
                Conferences Indexed
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {stats?.conferences ?? conferences.length}
              </p>
            </div>
            <span className="text-2xl p-2 bg-blue-50 rounded-xl text-blue-600 select-none">📚</span>
          </div>

          <div className="card p-5 border-l-4 border-l-emerald-500 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
                Open CFP Deadlines
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
                {openSubmissions.length}
              </p>
            </div>
            <span className="text-2xl p-2 bg-emerald-50 rounded-xl text-emerald-600 select-none">📩</span>
          </div>

          <div className="card p-5 border-l-4 border-l-indigo-500 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
                Upcoming Events
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-indigo-600">
                {upcomingConferences.length}
              </p>
            </div>
            <span className="text-2xl p-2 bg-indigo-50 rounded-xl text-indigo-600 select-none">📅</span>
          </div>

          <div className="card p-5 border-l-4 border-l-purple-500 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold tracking-wider text-slate-500 mb-1">
                Paper Track Venues
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-600">
                {paperTrackEvents.length}
              </p>
            </div>
            <span className="text-2xl p-2 bg-purple-50 rounded-xl text-purple-600 select-none">📄</span>
          </div>
        </div>
      </section>

      {/* Section: Open Submissions */}
      {openSubmissions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <span>📩</span> Open Call for Papers
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active submission windows currently open for papers
              </p>
            </div>
            <Link to="/conferences" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              View all conferences →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openSubmissions.map(c => {
              const tracked = isTracked(c.id);
              return (
                <ConferenceCard
                  key={c.id}
                  conference={c}
                  isTracked={tracked}
                  onTrackToggle={() => (tracked ? remove(c.id) : track(c.id))}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Section: Featured Upcoming Conferences */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>🌟</span> Featured Upcoming Conferences
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified top academic venues with scheduled dates
            </p>
          </div>
          <Link to="/conferences" className="text-xs font-semibold text-blue-600 hover:text-blue-800">
            Explore {conferences.length} events →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conferences.slice(0, 6).map(c => {
            const tracked = isTracked(c.id);
            return (
              <ConferenceCard
                key={c.id}
                conference={c}
                isTracked={tracked}
                onTrackToggle={() => (tracked ? remove(c.id) : track(c.id))}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
