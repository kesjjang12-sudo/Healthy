import { useCallback, useEffect, useState } from 'react';

import type { GenerateRoutineResult } from '@/lib/database.types';

import { loadDailyRoutine } from './api';

type State = {
  result: GenerateRoutineResult | null;
  isLoading: boolean;
  errorMessage: string | null;
};

export function useDailyRoutine(userId: string) {
  const [state, setState] = useState<State>({
    result: null,
    isLoading: true,
    errorMessage: null,
  });

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setState((current) => ({ ...current, isLoading: true, errorMessage: null }));

      try {
        const result = await loadDailyRoutine(userId);
        if (signal?.cancelled) return;
        setState({ result, isLoading: false, errorMessage: null });
      } catch (error) {
        if (signal?.cancelled) return;
        setState({
          result: null,
          isLoading: false,
          errorMessage: error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        });
      }
    },
    [userId],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  return { ...state, retry: useCallback(() => void load(), [load]) };
}
