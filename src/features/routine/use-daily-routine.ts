import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

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
    async (signal?: { cancelled: boolean }, options?: { quiet?: boolean }) => {
      // quiet 는 화면에 이미 목록이 떠 있는 상태로 새로 고칠 때 쓴다. 이때
      // 로딩 스피너로 갈아치우면 방금 본 목록이 사라졌다 돌아와 깜빡인다.
      if (!options?.quiet) {
        setState((current) => ({ ...current, isLoading: true, errorMessage: null }));
      }

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

  // 이 화면으로 돌아올 때마다 조용히 다시 읽는다.
  //
  // 운동을 하나 마치고 목록으로 돌아오면 완료 표시가 바로 보여야 한다.
  // 목록 화면은 상세로 들어가도 그대로 살아 있어서(스택), 이게 없으면 방금
  // 마친 운동이 아직 안 한 것처럼 남는다 — 앱을 껐다 켜야 반영됐다.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // 처음 들어올 때는 위 useEffect 가 이미 부른다. 두 번 부르지 않는다.
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      void load(undefined, { quiet: true });
    }, [load]),
  );

  return {
    ...state,
    /**
     * 화면을 비우고 처음부터 다시 읽는다. 목록이 아예 없는 상태(첫 진입 실패)의
     * "다시 시도" 전용이다 — 이미 목록이 떠 있을 때 쓰면 통째로 사라졌다 돌아온다.
     */
    retry: useCallback(() => void load(), [load]),
    /**
     * 떠 있는 목록은 그대로 두고 새 값으로 갈아 끼운다. 코스를 바꾸거나
     * 체크인이 찍혔을 때처럼, 화면에 이미 내용이 있는 상태의 갱신은 전부 이쪽이다.
     * 끝나는 시점을 알아야 하는 쪽이 있어서 Promise 를 돌려준다.
     */
    refresh: useCallback(() => load(undefined, { quiet: true }), [load]),
  };
}
