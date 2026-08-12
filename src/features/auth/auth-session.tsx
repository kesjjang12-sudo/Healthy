import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

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
};

type AuthSessionContextValue = State & {
  /** 로그인 직후(페어링 등)로 이미 알고 있는 유저를 즉시 반영한다. */
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
  /** 프로필 수정 등으로 서버 값을 다시 가져와야 할 때. */
  refresh: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ user: null, isRestoring: true, errorMessage: null });

  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase.rpc('bootstrap_oauth_profile');

    if (error) {
      setState({
        user: null,
        isRestoring: false,
        errorMessage: isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
      });
      return;
    }

    setState({ user: data?.user ?? null, isRestoring: false, errorMessage: null });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 앱을 켰을 때 이미 세션이 있으면(전에 로그인해 둔 상태) 바로 이어간다.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void loadProfile();
      else setState({ user: null, isRestoring: false, errorMessage: null });
    });

    // 로그인/로그아웃/토큰 갱신 등 세션이 바뀔 때마다 따라간다.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) void loadProfile();
      else setState({ user: null, isRestoring: false, errorMessage: null });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const setUser = useCallback((user: User) => {
    setState({ user, isRestoring: false, errorMessage: null });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, isRestoring: false, errorMessage: null });
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({ ...state, setUser, signOut, refresh: loadProfile }),
    [state, setUser, signOut, loadProfile],
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
