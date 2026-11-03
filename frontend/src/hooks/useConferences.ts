import { useState, useEffect, useCallback } from 'react';
import { getConferences } from '../api/client';
import type { Conference, ConferenceFilters } from '../types';

export function useConferences(initialFilters: ConferenceFilters = {}) {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ConferenceFilters>(initialFilters);

  const fetchConferences = useCallback(async (currentFilters: ConferenceFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConferences(currentFilters);
      setConferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConferences(filters);
  }, [filters, fetchConferences]);

  const updateFilters = useCallback((updates: Partial<ConferenceFilters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return {
    conferences,
    loading,
    error,
    filters,
    updateFilters,
    resetFilters,
    refresh: () => fetchConferences(filters),
  };
}

