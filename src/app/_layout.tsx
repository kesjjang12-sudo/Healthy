import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SetupRequired } from '@/components/setup-required';
import { Colors } from '@/constants/theme';
import { AuthSessionProvider } from '@/features/auth/auth-session';
import { DeviceRoleProvider, useDeviceRole } from '@/features/device-role/context';
import { FontScaleProvider } from '@/features/settings/font-scale';
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
      {/* 글자 크기는 로그인 전(설문·로그인 화면)에도 적용돼야 해서 가장 바깥에 둔다.
          키오스크 태블릿도 같은 공급자를 쓰지만, 거기선 아무도 안 고르므로
          기본값('중간')으로 지금과 같은 화면이 나온다. */}
      <FontScaleProvider>
        <DeviceRoleProvider>
          <RoleAwareStack />
        </DeviceRoleProvider>
      </FontScaleProvider>
    </SafeAreaProvider>
  );
}

/**
 * 기기 역할에 따라 필요한 게 다르다.
 *
 * - 역할 미정/키오스크: 세션이 아예 필요 없다. 키오스크는 kiosk_check_in 을
 *   anon 키로 호출할 뿐, 어떤 개인의 로그인 상태도 기기에 들고 있지 않는다.
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

  return role === 'personal' ? <AuthSessionProvider>{stack}</AuthSessionProvider> : stack;
}
