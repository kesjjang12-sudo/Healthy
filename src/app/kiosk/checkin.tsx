import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { CheckInError, kioskCheckIn } from '@/features/auth/kiosk-api';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS } from '@/features/auth/phone';
import { useDeviceRole } from '@/features/device-role/context';
import type { KioskCheckInResult } from '@/lib/database.types';
import { APT_ID } from '@/lib/env';

/** 가로가 이만큼 넓으면 태블릿 가로 모드로 보고 2단 배치로 바꾼다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

/** 아직 안 누른 자리를 옅게 깔아 둔다. */
const DIGIT_MASK = '010-0000-0000';

/** 체크인 완료 화면을 보여주는 시간. 줄 서 있는 다음 사람을 오래 기다리게 하면 안 된다. */
const RESULT_DISPLAY_MS = 6_000;

/**
 * 헬스장 입구 태블릿 전용 체크인 화면. 예전 index.tsx 의 키패드 UI를 그대로
 * 가져오되, 로그인이 아니라 출입 체크인만 한다 — 개인 홈 화면으로 넘어가지
 * 않고, 이 화면 안에서 결과만 잠깐 보여준 뒤 다음 사람을 위해 저절로
 * 초기화된다.
 */
export default function KioskCheckinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { role, isLoading: isRoleLoading } = useDeviceRole();

  const [digits, setDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<KioskCheckInResult | null>(null);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResult(null);
    setDigits('');
    setErrorMessage(null);
  }, []);

  const handleDigit = useCallback((digit: string) => {
    setErrorMessage(null);
    setDigits((current) => (current.length >= PHONE_MAX_DIGITS ? current : `${current}${digit}`));
  }, []);

  const handleBackspace = useCallback(() => {
    setErrorMessage(null);
    setDigits((current) => current.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setErrorMessage(null);
    setDigits('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isValidPhoneNumber(digits)) {
      setErrorMessage('전화번호 11자리를 모두 눌러주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const checkIn = await kioskCheckIn(digits);
      setDigits('');

      if (checkIn.needs_pairing && checkIn.pairing_code) {
        // 처음 오신 분(또는 아직 폰 앱과 연결 안 된 분)은 바로 QR 화면으로.
        // 이 경우엔 주 소속 전환 프롬프트를 띄우지 않는다 — 한 번에 물어볼 건
        // 하나씩만. 나중에 프로필 탭에서도 바꿀 수 있다.
        router.push({
          pathname: '/kiosk/pairing',
          params: { code: checkIn.pairing_code },
        });
        return;
      }

      if (checkIn.prompt_gym_switch) {
        // 이미 폰 앱과 연결된 분이 다른 단지가 주 소속인 채로 여기 처음 왔다.
        // "이 헬스장으로 옮기셨나요?" 를 바로 물어본다 — 미루면 다음에 안 물어보게 된다.
        router.push({
          pathname: '/kiosk/membership-prompt',
          params: { userId: checkIn.user_id, aptId: APT_ID },
        });
        return;
      }

      // 이미 연결되어 있고 소속 전환도 필요 없는 분. 담백한 완료 화면만 잠깐 보여주고 저절로 돌아간다.
      setResult(checkIn);
      resetTimer.current = setTimeout(reset, RESULT_DISPLAY_MS);
    } catch (error) {
      setErrorMessage(error instanceof CheckInError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }, [digits, reset, router]);

  useEffect(() => reset, [reset]);

  if (!isRoleLoading && role !== 'kiosk') {
    return <Redirect href="/device-setup" />;
  }

  if (result) {
    return (
      <View style={styles.screen}>
        <View style={[styles.resultContent, { paddingTop: insets.top }]}>
          <Text style={styles.resultTitle} maxFontSizeMultiplier={1.2}>
            체크인 완료
          </Text>
          <Text style={styles.resultSub} maxFontSizeMultiplier={1.3}>
            {result.visit_count}번째 방문이시네요
          </Text>

          {/* 폰을 바꾸거나 앱을 지운 분은 여기서 다시 연결해야 한다. 예전엔 이
              경로가 없어서, 이미 연결된 적 있는 사람은 계정에 영영 못 돌아왔다.
              평소엔 눈에 잘 안 띄는 보조 버튼으로 두고, 필요한 사람만 누른다. */}
          {result.pairing_code ? (
            <PrimaryButton
              label="휴대폰을 바꾸셨나요?"
              variant="quiet"
              size="compact"
              onPress={() => {
                if (resetTimer.current) clearTimeout(resetTimer.current);
                router.push({
                  pathname: '/kiosk/pairing',
                  params: { code: result.pairing_code! },
                });
              }}
            />
          ) : null}
        </View>
      </View>
    );
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
        {errorMessage ?? '번호를 누르면 출석이 기록됩니다.'}
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="체크인"
          onPress={() => void handleSubmit()}
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
  resultContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  resultTitle: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
  },
  resultSub: {
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textSecondary,
  },
});
