import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * 태블릿에서 체크인이 찍히는 순간 폰 앱이 반응하게 한다.
 *
 * 두 가지 경로를 같이 쓴다.
 *  1) Realtime 구독 — 앱을 켜 둔 채로 태블릿에 번호를 찍으면 즉시 알아챈다.
 *  2) 앱이 다시 앞으로 나올 때 한 번 더 확인 — 백그라운드에 있는 동안엔
 *     소켓이 끊길 수 있고, 끊긴 사이의 이벤트는 영영 안 온다. 태블릿에서
 *     찍고 폰을 꺼냈다 켜는 게 오히려 흔한 순서라 이쪽이 실제로 더 자주 쓰인다.
 *
 * 카카오/구글 로그인 여부와 무관하게 동작한다 — 익명 세션도 auth.uid() 를
 * 갖고 있어서 RLS 정책(본인 출석 행만 읽기)이 그대로 걸린다.
 */
export function useCheckInListener(userId: string, onCheckIn: () => void) {
  // 콜백이 매 렌더 새로 만들어져도 구독을 다시 맺지 않도록 ref 로 받는다.
  // 구독을 다시 맺으면 그 사이 이벤트를 놓친다.
  const handlerRef = useRef(onCheckIn);

  // 렌더 중에 ref 를 쓰면 안 되므로(React 규칙) 효과에서 갱신한다.
  useEffect(() => {
    handlerRef.current = onCheckIn;
  }, [onCheckIn]);

  useEffect(() => {
    const channel = supabase
      .channel(`attendance:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_logs',
          filter: `user_id=eq.${userId}`,
        },
        () => handlerRef.current(),
      )
      .subscribe();

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') handlerRef.current();
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
