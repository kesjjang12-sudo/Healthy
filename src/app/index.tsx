import { Redirect } from 'expo-router';

import { Splash } from '@/components/splash';
import { useDeviceRole } from '@/features/device-role/context';

/**
 * 순수 디스패처. 기기 역할에 따라 갈 곳이 다를 뿐, 이 화면 자체는 아무것도
 * 그리지 않는다.
 *
 * 예전엔 여기가 "전화번호 = 로그인"이던 화면이었다. 그 UI(키패드로 번호 받기)
 * 는 키오스크 쪽으로(kiosk/checkin.tsx) 옮겨 갔고, 개인 폰은 이제 카카오/구글/
 * QR 로그인이 있는 /login 으로 간다.
 */
export default function EntryDispatcher() {
  const { role, isLoading } = useDeviceRole();

  if (isLoading) return <Splash />;
  if (role === null) return <Redirect href="/device-setup" />;
  if (role === 'kiosk') return <Redirect href="/kiosk/checkin" />;
  return <Redirect href="/login" />;
}
