import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { isEmptyProfile } from '@/features/auth/anonymous';
import type { User } from '@/lib/database.types';
import { GENERIC_ERROR_MESSAGE, isNetworkError, NETWORK_ERROR_MESSAGE } from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

/**
 * 개인 폰 앱 전용 세션.
 *
 * 키오스크 쪽 session.tsx 와 이름이 비슷해 보이지만 근본적으로 다르다 — 저건
 * "5분 안 만지면 로그아웃"하는 공용 기기용이고, 이건 진짜 Supabase Auth 세션
 * (카카오/구글/익명)을 따라간다. 앱을 껐다 켜도 로그인이 유지돼야 하는 개인
 * 기기라 유휴 타임아웃이 없다.
 *
 * user(=public.users 행)는 auth 세션이 생길 때마다 bootstrap_oauth_profile 로
 * 가져온다 — 카카오로 막 로그인했을 수도, 페어링으로 이미 프로필이 있을 수도
 * 있어서, 매번 서버가 "지금 auth.uid() 에 연결된 게 뭔지"를 확정하게 둔다.
 */
type State = {
  user: User | null;
  isRestoring: boolean;
  errorMessage: string | null;
  /** 지금 세션이 익명(전화번호 페어링용 임시 신원)인지. */
  isAnonymous: boolean;
};

type AuthSessionContextValue = State & {
  /** 로그인 직후(페어링 등)로 이미 알고 있는 유저를 즉시 반영한다. */
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
  /** 프로필 수정 등으로 서버 값을 다시 가져와야 할 때. */
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const SIGNED_OUT_STATE: State = {
  user: null,
  isRestoring: false,
  errorMessage: null,
  isAnonymous: false,
};

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    user: null,
    isRestoring: true,
    errorMessage: null,
    isAnonymous: false,
  });

  const loadProfile = useCallback(async (isAnonymous: boolean) => {
    const { data, error } = await supabase.rpc('bootstrap_oauth_profile');

    if (error) {
      setState({
        user: null,
        isRestoring: false,
        errorMessage: isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
        isAnonymous,
      });
      return;
    }

    setState({
      user: data?.user ?? null,
      isRestoring: false,
      errorMessage: null,
      isAnonymous,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 앱을 켰을 때 이미 세션이 있으면(전에 로그인해 둔 상태) 바로 이어간다.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        setState(SIGNED_OUT_STATE);
        return;
      }

      // 껍데기만 남은 익명 세션은 여기서 버린다.
      //
      // 페어링을 중간에 그만두거나 실패 후 정리(signOut)가 네트워크 문제로
      // 못 끝나면, 로그인한 적 없는 사람에게 익명 세션이 남는다. 그대로 두면
      // 앱을 켤 때마다 bootstrap_oauth_profile 이 빈 프로필을 되살리고,
      // 로그인 화면은 그걸 로그인으로 착각해 설문으로 넘겨버린다 — 실제로
      // "전화번호 가입 눌렀다가 뒤로 나오면 성별·나이를 묻는다"는 보고가 있었다.
      //
      // 앱을 켜는 이 순간에만 정리한다. 페어링 도중에 만들어지는 익명 세션까지
      // 건드리면 페어링 자체가 끊긴다.
      if (data.session.user.is_anonymous) {
        const { data: profile } = await supabase.rpc('bootstrap_oauth_profile');
        if (cancelled) return;

        if (isEmptyProfile(profile?.user ?? null)) {
          await supabase.auth.signOut().catch(() => {});
          if (!cancelled) setState(SIGNED_OUT_STATE);
          return;
        }

        setState({
          user: profile?.user ?? null,
          isRestoring: false,
          errorMessage: null,
          isAnonymous: true,
        });
        return;
      }

      void loadProfile(false);
    });

    // 로그인/로그아웃/토큰 갱신 등 세션이 바뀔 때마다 따라간다. 앱을 켤 때의
    // 껍데기 정리는 위에서만 한다 — 여기서까지 하면 페어링 중에 방금 만든
    // 익명 세션을 스스로 지워버린다.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) void loadProfile(session.user.is_anonymous === true);
      else setState(SIGNED_OUT_STATE);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const setUser = useCallback((user: User) => {
    // 페어링이 막 끝난 경우다. 세션이 익명이든 아니든 전화번호가 붙은 실제
    // 계정이므로 익명 표시는 내린다.
    setState({ user, isRestoring: false, errorMessage: null, isAnonymous: false });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState(SIGNED_OUT_STATE);
  }, []);

  const refresh = useCallback(() => loadProfile(state.isAnonymous), [loadProfile, state.isAnonymous]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({ ...state, setUser, signOut, refresh }),
    [state, setUser, signOut, refresh],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) {
    throw new Error('useAuthSession 은 AuthSessionProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
