import { useConferences } from '../hooks/useConferences';
import { useTracking } from '../hooks/useTracking';
import { FilterBar } from '../components/FilterBar';
import { ConferenceCard } from '../components/ConferenceCard';
import { LoadingSpinner, ErrorState, EmptyState } from '../components/States';

export function ConferencesPage() {
  const { conferences, loading, error, filters, updateFilters, resetFilters, refresh } =
    useConferences({ include_historical: false });
  const { isTracked, track, remove } = useTracking();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Conference Directory
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Explore peer-reviewed computer science, AI, and multidisciplinary academic conferences.
        </p>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        totalCount={conferences.length}
      />

      {/* Content State */}
      {loading ? (
        <LoadingSpinner message="Searching conference database..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : conferences.length === 0 ? (
        <EmptyState
          message="No conferences match your current filters. Try relaxing or resetting your filters, or check 'Include past / historical events'."
          icon="🔍"
          actionText="Reset all filters"
          onAction={resetFilters}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conferences.map(c => {
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
      )}
    </div>
  );
}
