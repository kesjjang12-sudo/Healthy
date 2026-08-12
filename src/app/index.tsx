import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { AuthError } from '@/features/auth/api';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';

/** 가로가 이만큼 넓으면 태블릿 가로 모드로 보고 2단 배치로 바꾼다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

/** 아직 안 누른 자리를 옅게 깔아 둔다. 누를수록 회색이 줄어드는 게 보인다. */
const DIGIT_MASK = '010-0000-0000';

export default function PhoneAuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, isRestoring, signIn, touch } = useSession();

  const [digits, setDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDigit = useCallback(
    (digit: string) => {
      touch();
      setErrorMessage(null);
      setDigits((current) => (current.length >= PHONE_MAX_DIGITS ? current : `${current}${digit}`));
    },
    [touch],
  );

  const handleBackspace = useCallback(() => {
    touch();
    setErrorMessage(null);
    setDigits((current) => current.slice(0, -1));
  }, [touch]);

  const handleClear = useCallback(() => {
    touch();
    setErrorMessage(null);
    setDigits('');
  }, [touch]);

  const handleSubmit = useCallback(async () => {
    touch();

    if (!isValidPhoneNumber(digits)) {
      setErrorMessage('전화번호 11자리를 모두 눌러주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signIn(digits);
      setDigits('');
      // 설문을 끝내야 AI 루틴을 만들 수 있다. is_new_user 가 아니라 onboarded_at 으로
      // 판단해야 지난번에 설문 도중 나간 사람도 남은 문항부터 이어서 받는다.
      router.replace(result.user.profile_data?.onboarded_at ? '/home' : '/onboarding');
    } catch (error) {
      setErrorMessage(error instanceof AuthError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }, [digits, router, signIn, touch]);

  // 훅 호출 뒤에 리다이렉트를 판단한다.
  if (!isRestoring && user) {
    return <Redirect href={user.profile_data?.onboarded_at ? '/home' : '/onboarding'} />;
  }

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const typed = formatPhoneNumber(digits);

  const prompt = (
    <View style={styles.promptBlock}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        안녕하세요{'\n'}전화번호를 눌러주세요
      </Text>

      <Text style={styles.display} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {typed}
        <Text style={styles.displayRest}>{DIGIT_MASK.slice(typed.length)}</Text>
      </Text>

      <Text
        style={[styles.helper, errorMessage ? styles.helperError : null]}
        maxFontSizeMultiplier={1.3}
        accessibilityLiveRegion="polite">
        {errorMessage ?? '처음 오셨나요? 번호만 누르면 바로 등록됩니다.'}
      </Text>
    </View>
  );

  const keypad = (
    <Keypad
      onDigit={handleDigit}
      onClear={handleClear}
      onBackspace={handleBackspace}
      disabled={isSubmitting}
    />
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isWide && styles.contentWide,
          { paddingTop: insets.top + Spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled">
        {isWide ? (
          <>
            <View style={styles.column}>{prompt}</View>
            <View style={styles.column}>{keypad}</View>
          </>
        ) : (
          <>
            {prompt}
            {keypad}
          </>
        )}
      </ScrollView>

      {/* 주 버튼은 항상 화면 아래 같은 자리에 있다. 스크롤과 무관하게 손이 기억한다. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="시작하기"
          onPress={handleSubmit}
          disabled={!isValidPhoneNumber(digits)}
          loading={isSubmitting}
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
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxxl,
  },
  column: {
    flex: 1,
    justifyContent: 'center',
  },
  promptBlock: {
    gap: Spacing.xl,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.35,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  display: {
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
    // 자리수가 바뀔 때 숫자 폭이 흔들리지 않게 고정폭 숫자를 쓴다.
    fontVariant: ['tabular-nums'],
  },
  displayRest: {
    color: Colors.textDisabled,
  },
  helper: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  helperError: {
    color: Colors.danger,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center',
  },
});
