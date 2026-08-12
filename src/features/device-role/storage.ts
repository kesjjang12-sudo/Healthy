import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'fitroutine.device_role.v1';

/**
 * 하나의 코드베이스가 헬스장 입구 태블릿(키오스크)과 개인 폰 양쪽에 깔린다.
 * 이 값이 그 기기가 어느 쪽인지를 기억한다 — 앱 최초 실행 시 한 번만 고르고,
 * 그 뒤로는 기기에 저장된 값을 그대로 따른다.
 */
export type DeviceRole = 'kiosk' | 'personal';

function isDeviceRole(value: string | null): value is DeviceRole {
  return value === 'kiosk' || value === 'personal';
}

export async function getStoredDeviceRole(): Promise<DeviceRole | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return isDeviceRole(raw) ? raw : null;
}

export async function setStoredDeviceRole(role: DeviceRole): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, role);
}

export async function clearStoredDeviceRole(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
