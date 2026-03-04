import { useState, useEffect, useCallback } from 'react';
import type { VocWorkflow } from '@/types/workflow';
import { getWorkflow } from '@/api/workflows';
import { useSSE } from './useSSE';

export function useWorkflow(vocId: string) {
  const [workflow, setWorkflow] = useState<VocWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOne = useCallback(async () => {
    try {
      const data = await getWorkflow(vocId);
      setWorkflow(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflow');
    } finally {
      setLoading(false);
    }
  }, [vocId]);

  useEffect(() => {
    fetchOne();
  }, [fetchOne]);

  useSSE((event) => {
    if (event.vocId === vocId) {
      fetchOne();
    }
  });

  return { workflow, loading, error, refetch: fetchOne };
}
