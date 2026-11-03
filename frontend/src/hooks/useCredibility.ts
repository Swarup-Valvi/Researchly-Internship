import { useState, useEffect, useCallback } from 'react';
import { getConference, getCredibility, runAssessment } from '../api/client';
import type { Conference, CredibilityAssessment } from '../types';

export function useConferenceDetail(conferenceId: string) {
  const [conference, setConference] = useState<Conference | null>(null);
  const [credibility, setCredibility] = useState<CredibilityAssessment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [assessing, setAssessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [confData, credData] = await Promise.all([
        getConference(id),
        getCredibility(id).catch(() => null),
      ]);
      setConference(confData);
      setCredibility(credData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conference details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(conferenceId);
  }, [conferenceId, loadData]);

  const triggerAssessment = useCallback(async () => {
    if (!conferenceId) return;
    setAssessing(true);
    try {
      const freshCred = await runAssessment(conferenceId);
      setCredibility(freshCred);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assessment failed');
    } finally {
      setAssessing(false);
    }
  }, [conferenceId]);

  return {
    conference,
    credibility,
    loading,
    assessing,
    error,
    refresh: () => loadData(conferenceId),
    triggerAssessment,
  };
}

