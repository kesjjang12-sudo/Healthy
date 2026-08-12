import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { clearStoredDeviceRole, getStoredDeviceRole, setStoredDeviceRole } from './storage';
import type { DeviceRole } from './storage';

type State = {
  role: DeviceRole | null;
  /** AsyncStorage 조회가 끝났는지. 끝나기 전엔 라우팅 판단을 미룬다. */
  isLoading: boolean;
};

type DeviceRoleContextValue = State & {
  setRole: (role: DeviceRole) => Promise<void>;
  /** 기기 역할을 다시 고르게 한다. 지금은 호출하는 화면이 없지만(설정 화면은
   * 다음 단계), 잘못 고른 경우를 위해 미리 열어 둔다. */
  resetRole: () => Promise<void>;
};

const DeviceRoleContext = createContext<DeviceRoleContextValue | null>(null);

export function DeviceRoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ role: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    void getStoredDeviceRole().then((role) => {
      if (!cancelled) setState({ role, isLoading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setRole = useCallback(async (role: DeviceRole) => {
    await setStoredDeviceRole(role);
    setState({ role, isLoading: false });
  }, []);

  const resetRole = useCallback(async () => {
    await clearStoredDeviceRole();
    setState({ role: null, isLoading: false });
  }, []);

  const value = useMemo<DeviceRoleContextValue>(
    () => ({ ...state, setRole, resetRole }),
    [state, setRole, resetRole],
  );

  return <DeviceRoleContext.Provider value={value}>{children}</DeviceRoleContext.Provider>;
}

export function useDeviceRole(): DeviceRoleContextValue {
  const value = useContext(DeviceRoleContext);
  if (!value) {
    throw new Error('useDeviceRole 은 DeviceRoleProvider 안에서만 사용할 수 있습니다.');
  }
  return value;
}
