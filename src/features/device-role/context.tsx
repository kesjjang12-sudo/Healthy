import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  clearStoredDeviceConfig,
  getStoredDeviceConfig,
  setStoredDeviceConfig,
} from './storage';
import type { DeviceConfig, DeviceRole } from './storage';

type State = {
  config: DeviceConfig | null;
  /** AsyncStorage 조회가 끝났는지. 끝나기 전엔 라우팅 판단을 미룬다. */
  isLoading: boolean;
};

type DeviceRoleContextValue = State & {
  role: DeviceRole | null;
  /** 이 태블릿이 속한 단지. 개인 폰이거나 아직 설정 전이면 null. */
  aptId: string | null;
  aptName: string | null;
  setPersonal: () => Promise<void>;
  setKiosk: (apartment: { aptId: string; aptName: string }) => Promise<void>;
  /** 기기 설정을 다시 하게 한다. 지금은 호출하는 화면이 없지만(설정 화면은
   * 다음 단계), 잘못 고른 경우를 위해 미리 열어 둔다. */
  reset: () => Promise<void>;
};

const DeviceRoleContext = createContext<DeviceRoleContextValue | null>(null);

export function DeviceRoleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ config: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    void getStoredDeviceConfig().then((config) => {
      if (!cancelled) setState({ config, isLoading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const store = useCallback(async (config: DeviceConfig) => {
    await setStoredDeviceConfig(config);
    setState({ config, isLoading: false });
  }, []);

  const setPersonal = useCallback(() => store({ role: 'personal' }), [store]);

  const setKiosk = useCallback(
    ({ aptId, aptName }: { aptId: string; aptName: string }) =>
      store({ role: 'kiosk', aptId, aptName }),
    [store],
  );

  const reset = useCallback(async () => {
    await clearStoredDeviceConfig();
    setState({ config: null, isLoading: false });
  }, []);

  const value = useMemo<DeviceRoleContextValue>(
    () => ({
      ...state,
      role: state.config?.role ?? null,
      aptId: state.config?.role === 'kiosk' ? state.config.aptId : null,
      aptName: state.config?.role === 'kiosk' ? state.config.aptName : null,
      setPersonal,
      setKiosk,
      reset,
    }),
    [state, setPersonal, setKiosk, reset],
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
