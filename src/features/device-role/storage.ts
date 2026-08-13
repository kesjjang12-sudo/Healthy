import AsyncStorage from '@react-native-async-storage/async-storage';

import { LEGACY_APT_ID } from '@/lib/env';

const STORAGE_KEY = 'fitroutine.device.v1';

/**
 * v0 은 역할 문자열("kiosk"/"personal") 하나만 저장했다. 그때는 단지가 빌드
 * 시점 환경변수로 정해져 있어서 기기가 기억할 게 역할뿐이었다.
 */
const LEGACY_ROLE_KEY = 'fitroutine.device_role.v1';

/**
 * 하나의 코드베이스가 헬스장 입구 태블릿(키오스크)과 개인 폰 양쪽에 깔린다.
 * 이 값이 그 기기가 어느 쪽인지를 기억한다 — 앱 최초 실행 시 한 번만 고르고,
 * 그 뒤로는 기기에 저장된 값을 그대로 따른다.
 */
export type DeviceRole = 'kiosk' | 'personal';

/**
 * 키오스크는 역할만으로는 부족하다. "어느 단지의 태블릿인지"를 같이 기억해야
 * 주민이 번호를 눌렀을 때 그 사람을 옳은 단지로 체크인시킬 수 있다. 이 값이
 * 곧 태블릿의 고유값이고, 관리사무소가 최초 설정 때 등록 코드로 받아 온다.
 *
 * 개인 폰에는 단지가 없다 — 주민의 소속은 기기가 아니라 키오스크 체크인 이력
 * (user_gym_memberships)이 정한다. 주민이 직접 고르지 않는 게 요점이다.
 */
export type DeviceConfig =
  | { role: 'personal' }
  | { role: 'kiosk'; aptId: string; aptName: string };

function parse(raw: string | null): DeviceConfig | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const value = parsed as Record<string, unknown>;
    if (value.role === 'personal') return { role: 'personal' };
    if (value.role === 'kiosk' && typeof value.aptId === 'string' && value.aptId) {
      return {
        role: 'kiosk',
        aptId: value.aptId,
        aptName: typeof value.aptName === 'string' ? value.aptName : '',
      };
    }
  } catch {
    /* 손상된 값은 "설정 안 됨"으로 본다 — 기기가 다시 물어보면 그만이다. */
  }

  return null;
}

/**
 * 이미 깔려 있는 기기를 새 형식으로 옮긴다.
 *
 * 키오스크였던 태블릿은 단지를 모른다. 그 기기가 쓰던 빌드 시점 환경변수를
 * 그대로 단지로 삼는다 — 지금까지 실제로 그 값으로 체크인해 왔으니 옳은 값이다.
 * 환경변수마저 비어 있으면 옮길 근거가 없으므로 설정 화면으로 되돌린다.
 */
async function migrateLegacy(): Promise<DeviceConfig | null> {
  const legacyRole = await AsyncStorage.getItem(LEGACY_ROLE_KEY);
  if (legacyRole !== 'kiosk' && legacyRole !== 'personal') return null;

  const migrated: DeviceConfig | null =
    legacyRole === 'personal'
      ? { role: 'personal' }
      : LEGACY_APT_ID
        ? { role: 'kiosk', aptId: LEGACY_APT_ID, aptName: '' }
        : null;

  if (migrated) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(LEGACY_ROLE_KEY);

  return migrated;
}

export async function getStoredDeviceConfig(): Promise<DeviceConfig | null> {
  const stored = parse(await AsyncStorage.getItem(STORAGE_KEY));
  if (stored) return stored;

  return migrateLegacy();
}

export async function setStoredDeviceConfig(config: DeviceConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function clearStoredDeviceConfig(): Promise<void> {
  await AsyncStorage.multiRemove([STORAGE_KEY, LEGACY_ROLE_KEY]);
}
