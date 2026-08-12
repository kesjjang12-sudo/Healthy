import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { SessionProvider } from '@/features/auth/session';

export default function RootLayout() {
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
