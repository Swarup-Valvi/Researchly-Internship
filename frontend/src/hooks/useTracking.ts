import { useState, useEffect, useCallback } from 'react';
import {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
} from '../api/client';
import type { ApplicationRecord, ApplicationStatus } from '../types';

export function useTracking() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApplications();
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const track = useCallback(
    async (
      conferenceId: string,
      status: ApplicationStatus = 'Shortlisted',
      notes?: string,
      submittedAt?: string,
      decisionAt?: string
    ) => {
      setActionLoadingId(conferenceId);
      setError(null);
      try {
        const existing = applications.find(a => a.conference_id === conferenceId);
        if (existing) {
          // Already tracked -> update status
          const updated = await updateApplication(conferenceId, {
            status,
            notes: notes ?? existing.notes ?? undefined,
            submitted_at: submittedAt ?? existing.submitted_at ?? undefined,
            decision_at: decisionAt ?? existing.decision_at ?? undefined,
          });
          setApplications(prev =>
            prev.map(a => (a.conference_id === conferenceId ? updated : a))
          );
          showFeedback(`Updated status to "${status}"`);
          return updated;
        }

        const app = await createApplication(
          conferenceId,
          status,
          notes,
          submittedAt,
          decisionAt
        );
        setApplications(prev => [app, ...prev]);
        showFeedback(`Added to your shortlisted conferences!`);
        return app;
      } catch (err) {
        // If 409 conflict, sync state
        await fetchApplications();
        const msg = err instanceof Error ? err.message : 'Failed to track conference';
        setError(msg);
        throw err;
      } finally {
        setActionLoadingId(null);
      }
    },
    [applications, fetchApplications, showFeedback]
  );

  const update = useCallback(
    async (
      conferenceId: string,
      updates: {
        status?: ApplicationStatus;
        notes?: string;
        submitted_at?: string;
        decision_at?: string;
      }
    ) => {
      setActionLoadingId(conferenceId);
      setError(null);
      try {
        const updated = await updateApplication(conferenceId, updates);
        setApplications(prev =>
          prev.map(a => (a.conference_id === conferenceId ? updated : a))
        );
        if (updates.status) {
          showFeedback(`Application moved to "${updates.status}"`);
        } else {
          showFeedback('Application details saved');
        }
        return updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update application';
        setError(msg);
        throw err;
      } finally {
        setActionLoadingId(null);
      }
    },
    [showFeedback]
  );

  const remove = useCallback(
    async (conferenceId: string) => {
      setActionLoadingId(conferenceId);
      setError(null);
      try {
        await deleteApplication(conferenceId);
        setApplications(prev => prev.filter(a => a.conference_id !== conferenceId));
        showFeedback('Conference removed from tracking');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to remove conference';
        setError(msg);
        throw err;
      } finally {
        setActionLoadingId(null);
      }
    },
    [showFeedback]
  );

  const isTracked = useCallback(
    (conferenceId: string) => applications.some(a => a.conference_id === conferenceId),
    [applications]
  );

  const getApp = useCallback(
    (conferenceId: string) => applications.find(a => a.conference_id === conferenceId),
    [applications]
  );

  return {
    applications,
    loading,
    actionLoadingId,
    error,
    feedback,
    clearFeedback: () => setFeedback(null),
    refresh: fetchApplications,
    track,
    update,
    remove,
    isTracked,
    getApp,
  };
}
