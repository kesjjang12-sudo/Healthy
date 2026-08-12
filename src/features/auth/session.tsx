import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { SignInResult, User } from '@/lib/database.types';

import { signInWithPhone } from './api';

const STORAGE_KEY = 'fitroutine.session.v1';

/**
 * 공용 태블릿이라 세션을 오래 들고 있으면 안 된다. 앞사람이 로그아웃을 안 하고
 * 가버려도 5분 뒤에는 번호 입력 화면으로 돌아간다.
 */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const IDLE_CHECK_INTERVAL_MS = 15 * 1000;

type StoredSession = {
  user: User;
  lastActiveAt: number;
};

type SessionContextValue = {
  user: User | null;
  /** AsyncStorage 복원이 끝났는지. 끝나기 전엔 라우팅 판단을 미룬다. */
  isRestoring: boolean;
  signIn: (phoneNumber: string) => Promise<SignInResult>;
  signOut: () => void;
  /** 서버에서 갱신된 유저 정보(프로필, 포인트 등)를 세션에 반영한다. */
  setUser: (user: User) => void;
  /** 사용자가 화면을 만졌음을 알려 자동 로그아웃 타이머를 미룬다. */
  touch: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const lastActiveAt = useRef(Date.now());

  const persist = useCallback((next: User | null) => {
    if (!next) {
      void AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: StoredSession = { user: next, lastActiveAt: lastActiveAt.current };
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  // 앱이 죽었다 살아나는 동안 운동하던 사람이 쫓겨나지 않도록 복원한다.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled || !raw) return;

        const stored = JSON.parse(raw) as StoredSession;
        if (Date.now() - stored.lastActiveAt < IDLE_TIMEOUT_MS) {
          lastActiveAt.current = stored.lastActiveAt;
          setUser(stored.user);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // 저장값이 깨졌으면 그냥 로그인 화면에서 시작한다.
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    persist(null);
  }, [persist]);

  const touch = useCallback(() => {
    lastActiveAt.current = Date.now();
  }, []);

  const setCurrentUser = useCallback(
    (next: User) => {
      lastActiveAt.current = Date.now();
      setUser(next);
      persist(next);
    },
    [persist],
  );

  const signIn = useCallback(
    async (phoneNumber: string) => {
      const result = await signInWithPhone(phoneNumber);
      lastActiveAt.current = Date.now();
      setUser(result.user);
      persist(result.user);
      return result;
    },
    [persist],
  );

  useEffect(() => {
    if (!user) return;

    const timer = setInterval(() => {
      if (Date.now() - lastActiveAt.current >= IDLE_TIMEOUT_MS) signOut();
    }, IDLE_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({ user, isRestoring, signIn, signOut, setUser: setCurrentUser, touch }),
    [user, isRestoring, signIn, signOut, setCurrentUser, touch],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession 은 SessionProvider 안에서만 사용할 수 있습니다.');
  return value;
}
