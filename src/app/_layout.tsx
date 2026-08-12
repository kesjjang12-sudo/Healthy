import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SetupRequired } from '@/components/setup-required';
import { Colors } from '@/constants/theme';
import { SessionProvider } from '@/features/auth/session';
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
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            // 공용 태블릿이라 뒤로가기로 앞사람 화면에 돌아갈 수 있으면 안 된다.
            gestureEnabled: false,
            animation: 'fade',
          }}
        />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
