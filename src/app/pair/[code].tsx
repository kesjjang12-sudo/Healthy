import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { ensureSessionForPairing } from '@/features/auth/anonymous';
import { useAuthSession } from '@/features/auth/auth-session';
import { completePairing, PairingError } from '@/features/pairing/api';

/**
 * 시스템 카메라 앱으로 키오스크 QR 을 찍었을 때 열리는 딥링크 수신 화면
 * (fitroutine://pair/<code>). 앱 안의 스캐너(pair-scan.tsx)를 거치지 않고
 * 바로 코드를 받으므로, 세션만 만들고 곧장 페어링을 끝낸다 — 고를 게 없다.
 */
export default function PairCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser } = useAuthSession();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!code || hasStarted.current) return;
    hasStarted.current = true;

    void (async () => {
      try {
        await ensureSessionForPairing();
        const user = await completePairing(code);
        setUser(user);
        router.replace(user.profile_data?.onboarded_at ? '/workout' : '/onboarding');
      } catch (error) {
        setErrorMessage(error instanceof PairingError ? error.message : '연결하지 못했습니다.');
      }
    })();
  }, [code, router, setUser]);

  if (!code) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          잘못된 연결입니다.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.centered, { paddingTop: insets.top }]}>
      {errorMessage ? (
        <>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            연결하지 못했어요
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
          <PrimaryButton label="로그인 화면으로" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            연결하는 중입니다
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
