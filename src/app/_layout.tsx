import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SetupRequired } from '@/components/setup-required';
import { Colors } from '@/constants/theme';
import { AuthSessionProvider } from '@/features/auth/auth-session';
import { SessionProvider } from '@/features/auth/session';
import { DeviceRoleProvider, useDeviceRole } from '@/features/device-role/context';
import { MISSING_ENV } from '@/lib/env';

export default function RootLayout() {
  // Supabase 설정이 없으면 화면들이 전부 실패하므로 여기서 먼저 걸러 안내한다.
  if (MISSING_ENV.length > 0) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SetupRequired missing={MISSING_ENV} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DeviceRoleProvider>
        <RoleAwareStack />
      </DeviceRoleProvider>
    </SafeAreaProvider>
  );
}

/**
 * 기기 역할에 따라 세션 공급자가 달라진다.
 *
 * - 역할 미정: 아직 아무 세션도 필요 없다. device-setup 화면이 알아서 뜬다
 *   (index.tsx 와 각 화면의 역할 체크가 그리로 보낸다).
 * - 키오스크: 예전부터 있던 kiosk-session(5분 idle 로그아웃)을 그대로 쓴다 —
 *   출입 체크인 자체엔 Supabase Auth 세션이 필요 없다(anon RPC 호출뿐).
 * - 개인: 진짜 Supabase Auth 세션(카카오/구글/익명)을 따라가는 auth-session.
 *   앱을 껐다 켜도 로그인이 유지돼야 하니 idle 타임아웃이 없다.
 */
function RoleAwareStack() {
  const { role, isLoading } = useDeviceRole();

  // AsyncStorage 조회가 끝나기 전엔 아무 화면도 그리지 않는다. 짧은 순간이라
  // 스플래시 화면이 대신 보인다.
  if (isLoading) return null;

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        // 키오스크는 공용 기기라 뒤로가기로 앞사람 화면에 돌아가면 안 된다.
        // 개인 폰은 막을 이유가 없다.
        gestureEnabled: role === 'personal',
        animation: 'fade',
      }}
    />
  );

  if (role === 'personal') {
    return <AuthSessionProvider>{stack}</AuthSessionProvider>;
  }

  // role === 'kiosk' | null. 역할 미정 상태에서도 index.tsx 가 곧장
  // device-setup 으로 보내므로, 이 컨텍스트가 잠깐 없어도 문제없다.
  return <SessionProvider>{stack}</SessionProvider>;
}
