import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { AuthError } from '@/features/auth/api';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';

/** 가로가 이만큼 넓으면 태블릿 가로 모드로 보고 2단 배치로 바꾼다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

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
      setDigits((current) =>
        current.length >= PHONE_MAX_DIGITS ? current : `${current}${digit}`,
      );
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
      // 신규 회원은 프로필 설문(성별/연령대/운동목적)부터 받아야 AI 루틴을 만들 수 있다.
      router.replace(result.is_new_user ? '/onboarding' : '/home');
    } catch (error) {
      setErrorMessage(
        error instanceof AuthError ? error.message : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [digits, router, signIn, touch]);

  // 훅 호출 뒤에 리다이렉트를 판단한다.
  if (!isRestoring && user) return <Redirect href="/home" />;

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const canSubmit = isValidPhoneNumber(digits);

  const prompt = (
    <View style={styles.promptBlock}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        안녕하세요!
      </Text>
      <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
        전화번호를 눌러주세요
      </Text>

      <View style={[styles.display, errorMessage ? styles.displayError : null]}>
        <Text
          style={[styles.displayText, digits.length === 0 && styles.displayPlaceholder]}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {digits.length === 0 ? '010-0000-0000' : formatPhoneNumber(digits)}
        </Text>
      </View>

      <Text
        style={[styles.helper, errorMessage ? styles.helperError : null]}
        maxFontSizeMultiplier={1.3}
        accessibilityLiveRegion="polite">
        {errorMessage ?? '처음 오셨나요? 번호만 누르면 바로 등록됩니다.'}
      </Text>
    </View>
  );

  const inputBlock = (
    <View style={styles.inputBlock}>
      <Keypad
        onDigit={handleDigit}
        onClear={handleClear}
        onBackspace={handleBackspace}
        disabled={isSubmitting}
      />
      <PrimaryButton
        label="시작하기"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={isSubmitting}
        style={styles.submitButton}
      />
    </View>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        isWide && styles.contentWide,
        {
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        },
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={isWide ? styles.column : undefined}>{prompt}</View>
      <View style={isWide ? styles.column : undefined}>{inputBlock}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xl,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  contentWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxl,
  },
  column: {
    flex: 1,
    justifyContent: 'center',
  },
  promptBlock: {
    gap: Spacing.md,
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  display: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 3,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  displayError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerFaint,
  },
  displayText: {
    fontSize: FontSize.display,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    // 자리수가 바뀔 때 숫자 폭이 흔들리지 않게 고정폭 숫자를 쓴다.
    fontVariant: ['tabular-nums'],
  },
  displayPlaceholder: {
    color: Colors.textDisabled,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  helperError: {
    color: Colors.danger,
  },
  inputBlock: {
    gap: Spacing.lg,
    justifyContent: 'center',
  },
  submitButton: {
    minHeight: 96,
  },
});
