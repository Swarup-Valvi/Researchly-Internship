import { useState, useCallback } from 'react';
import { matchPaper } from '../api/client';
import type { MatchingResult, PaperMatchRequest } from '../types';

export function useMatch() {
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const performMatch = useCallback(async (request: PaperMatchRequest) => {
    setLoading(true);
    setError(null);
    try {
      const data = await matchPaper(request);
      setResult(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Paper matching failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    loading,
    error,
    match: performMatch,
    reset,
  };
}

