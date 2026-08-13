import { useCallback, useEffect, useRef, useState } from 'react';

import type { VisitStats } from '@/lib/database.types';

import { getVisitStats } from './api';

/**
 * 운동 탭 상단 "DAY_N" 배지용. 실패해도 화면을 막을 정도는 아니라 조용히 넘어간다.
 *
 * refresh 를 같이 돌려주는 건 태블릿 체크인 때문이다 — 방문 횟수는 체크인하는
 * 순간 서버에서 올라가므로, 그때 다시 불러와야 배지가 맞는 숫자를 보여준다.
 */
export function useVisitStats(userId: string) {
  const [stats, setStats] = useState<VisitStats | null>(null);
  // 언마운트 후 도착한 응답으로 상태를 건드리지 않도록.
  const cancelledRef = useRef(false);

  const refresh = useCallback(() => {
    void getVisitStats(userId)
      .then((result) => {
        if (!cancelledRef.current) setStats(result);
      })
      .catch(() => {
        // 배지 하나 못 보여주는 건 치명적이지 않다. 조용히 넘어간다.
      });
  }, [userId]);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();

    return () => {
      cancelledRef.current = true;
    };
  }, [refresh]);

  return { stats, refresh };
}
