import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { StrengthHookBanner } from '@/components/strength-hook-banner';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { signInAsTestUser } from '@/features/auth/anonymous';
import { useAuthSession } from '@/features/auth/auth-session';
import { OAuthError, signInWithGoogle, signInWithKakao } from '@/features/auth/oauth';
import { pickHookMessage } from '@/features/content/hooking-copy';

type Provider = 'kakao' | 'google';

/**
 * 개인 폰 앱의 첫 화면. 로그인 수단 3가지 — 전화번호(QR)는 카카오/구글이 못
 * 주는 전화번호를 QR 페어링으로 잇는 별도의 완전한 로그인 경로다(부속 기능이
 * 아니다). 근력운동 후킹 카피를 여기 크게 한 번 두는 건, 로그인 전 진입
 * 장벽에서 "왜 필요한지"부터 설득하기 위해서다.
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isRestoring } = useAuthSession();

  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [isTestSigningIn, setIsTestSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const message = useMemo(() => pickHookMessage(), []);

  const handleOAuth = useCallback(async (provider: Provider) => {
    setPendingProvider(provider);
    setErrorMessage(null);

    try {
      const outcome = provider === 'kakao' ? await signInWithKakao() : await signInWithGoogle();
      // 취소했으면 세션이 안 생겼을 뿐이니 이 화면에 그대로 남는다. 오류가 아니다.
      if (outcome === 'cancelled') return;
    } catch (error) {
      setErrorMessage(error instanceof OAuthError ? error.message : '로그인에 실패했습니다.');
    } finally {
      setPendingProvider(null);
    }
  }, []);

  // 카카오/구글은 대시보드에 OAuth 앱을 등록해야 뜨고, 전화번호는 옆에 페어링해
  // 줄 키오스크가 있어야 한다 — 그 전까지 개인 앱을 테스트할 방법이 없어서
  // 만든 임시 경로다. 세션이 생기면 이 화면의 아래 Redirect 가 알아서 처리한다.
  const handleTestSignIn = useCallback(async () => {
    setIsTestSigningIn(true);
    setErrorMessage(null);

    try {
      await signInAsTestUser();
    } catch {
      setErrorMessage('테스트 로그인에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setIsTestSigningIn(false);
    }
  }, []);

  // 로그인 성공 시 auth-session 이 세션 변화를 감지해 프로필을 가져오면 여기로 반영된다.
  if (!isRestoring && user) {
    return <Redirect href={user.profile_data?.onboarded_at ? '/workout' : '/onboarding'} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            핏루틴
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
            로그인하고 오늘의 운동을 시작하세요
          </Text>
        </View>

        <StrengthHookBanner message={message} size="large" />

        {errorMessage ? (
          <Text
            style={styles.errorText}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="카카오로 시작하기"
          onPress={() => void handleOAuth('kakao')}
          loading={pendingProvider === 'kakao'}
          disabled={pendingProvider !== null}
        />
        <PrimaryButton
          label="구글로 시작하기"
          variant="secondary"
          onPress={() => void handleOAuth('google')}
          loading={pendingProvider === 'google'}
          disabled={pendingProvider !== null}
        />
        <PrimaryButton
          label="전화번호로 시작하기"
          variant="quiet"
          size="compact"
          onPress={() => router.push('/pair-scan')}
          disabled={pendingProvider !== null || isTestSigningIn}
        />
        {/* 카카오/구글 심사 전, 페어링할 키오스크가 없을 때 쓰는 임시 테스트
            경로. 실제 출시 전에 빼야 한다. */}
        <PrimaryButton
          label="테스트 계정으로 시작하기"
          variant="quiet"
          size="compact"
          onPress={() => void handleTestSignIn()}
          loading={isTestSigningIn}
          disabled={pendingProvider !== null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
    textAlign: 'center',
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
