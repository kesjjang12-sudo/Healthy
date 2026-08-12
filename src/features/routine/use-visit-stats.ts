import { useEffect, useState } from 'react';

import type { VisitStats } from '@/lib/database.types';

import { getVisitStats } from './api';

/** 운동 탭 상단 "DAY_N" 배지용. 실패해도 화면을 막을 정도는 아니라 조용히 넘어간다. */
export function useVisitStats(userId: string) {
  const [stats, setStats] = useState<VisitStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getVisitStats(userId)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        // 배지 하나 못 보여주는 건 치명적이지 않다. 조용히 넘어간다.
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return stats;
}
