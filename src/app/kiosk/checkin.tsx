import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { CheckInError, kioskCheckIn } from '@/features/auth/kiosk-api';
import { recordKioskConsent } from '@/features/legal/api';
import { KIOSK_CONSENT_NOTICE } from '@/features/legal/consent-items';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS } from '@/features/auth/phone';
import { useDeviceRole } from '@/features/device-role/context';
import type { KioskCheckInResult } from '@/lib/database.types';

/** 가로가 이만큼 넓으면 태블릿 가로 모드로 보고 2단 배치로 바꾼다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

/** 아직 안 누른 자리를 옅게 깔아 둔다. */
const DIGIT_MASK = '010-0000-0000';

/**
 * 체크인 완료 화면을 보여주는 시간. 줄 서 있는 다음 사람을 오래 기다리게 하면
 * 안 되지만, 앱이 로그아웃된 사람에게는 이 화면의 "다시 연결" 안내를 읽고
 * 누를 시간이기도 하다 — 6초로는 읽다가 화면이 사라진다.
 */
const RESULT_DISPLAY_MS = 12_000;

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
  // aptId 는 이 태블릿이 최초 설정 때 받아 둔 단지다. 주민은 번호만 누르고,
  // 그 사람이 어느 단지 사람인지는 이 값이 정한다.
  const { role, aptId, aptName, isLoading: isRoleLoading } = useDeviceRole();

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

    // 아래 가드가 이미 걸러내지만, 단지 없이 체크인을 쏘면 엉뚱한 곳에 출석이
    // 남는 게 아니라 조용히 실패하는 편이 낫다.
    if (!aptId) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const checkIn = await kioskCheckIn(aptId, digits);
      setDigits('');

      // 화면에 상시로 떠 있는 수집 고지에 대한 동의를 남긴다. 태블릿 앞에 줄이
      // 서 있으므로 기록이 실패해도 체크인을 막지 않는다 — 기록이 목적이지
      // 관문이 아니다.
      void recordKioskConsent(checkIn.user_id).catch(() => {});

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
          params: { userId: checkIn.user_id, aptId },
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
  }, [aptId, digits, reset, router]);

  useEffect(() => reset, [reset]);

  // 단지가 없는 키오스크는 있을 수 없다(설정 화면이 둘을 같이 정한다). 그래도
  // 저장값이 손상된 경우엔 엉뚱한 단지로 체크인하느니 설정을 다시 받는다.
  if (!isRoleLoading && (role !== 'kiosk' || !aptId)) {
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
              문구가 "휴대폰을 바꾸셨나요?"뿐이면 앱이 로그아웃됐을 뿐인 사람은
              자기 얘기인 줄 모르고 지나친다 — 실제로 그렇게 갇힌 보고가 있었다.
              그래서 조건을 먼저 적어 주고, 버튼은 할 일을 그대로 쓴다. */}
          {result.pairing_code ? (
            <>
              <Text style={styles.resultHint} maxFontSizeMultiplier={1.3}>
                폰을 바꾸셨거나 앱이 로그아웃됐다면
              </Text>
              <PrimaryButton
                label="폰에 다시 연결하기"
                variant="secondary"
                size="compact"
                onPress={() => {
                  if (resetTimer.current) clearTimeout(resetTimer.current);
                  router.push({
                    pathname: '/kiosk/pairing',
                    params: { code: result.pairing_code!, mode: 'relink' },
                  });
                }}
              />
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const typed = formatPhoneNumber(digits);

  const prompt = (
    <View style={styles.promptBlock}>
      <View style={styles.titleBlock}>
        {/* 관리사무소가 태블릿이 옳은 단지로 설정됐는지 눈으로 확인할 수 있게
            둔다. 예전 방식으로 설정된 기기는 단지 이름을 모르므로 비어 있다. */}
        {aptName ? (
          <Text style={styles.aptName} maxFontSizeMultiplier={1.3}>
            {aptName}
          </Text>
        ) : null}
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          안녕하세요{'\n'}전화번호를 눌러주세요
        </Text>
      </View>

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
        {/* 수집 고지는 버튼 바로 위에 상시로 둔다. 공용 태블릿에서 약관 전문을
            스크롤하게 하는 건 줄을 세우는 일이라, 받는 항목이 전화번호 하나뿐인
            이 화면에서는 그 한 줄을 늘 보이게 하는 편이 실제로 읽힌다. */}
        <Text style={styles.notice} maxFontSizeMultiplier={1.3}>
          {KIOSK_CONSENT_NOTICE}
        </Text>
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
  notice: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'center',
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
  titleBlock: {
    gap: Spacing.sm,
  },
  aptName: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
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
  resultHint: {
    marginTop: Spacing.xl,
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
