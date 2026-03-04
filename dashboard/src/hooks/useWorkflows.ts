import { useState, useEffect, useCallback } from 'react';
import type { VocWorkflow } from '@/types/workflow';
import { getWorkflows } from '@/api/workflows';
import { useSSE } from './useSSE';

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<VocWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const data = await getWorkflows();
      setWorkflows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useSSE(() => {
    fetchAll();
  });

  return { workflows, loading, error, refetch: fetchAll };
}
