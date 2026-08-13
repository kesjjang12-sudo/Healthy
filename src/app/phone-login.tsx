import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS } from '@/features/auth/phone';
import { PhoneOtpError, sendPhoneOtp, verifyPhoneOtp } from '@/features/auth/phone-otp';

/** GoTrue 가 보내는 SMS 인증번호 자릿수. */
const CODE_LENGTH = 6;

/** 아직 안 누른 자리를 옅게 깔아 둔다. */
const DIGIT_MASK = '010-0000-0000';

type Step = 'phone' | 'code';

/**
 * "전화번호로 시작하기"의 본 화면.
 *
 * 예전에는 이 버튼이 곧장 QR 스캐너(/pair-scan)로 보냈다. 이미 가입한 사람이
 * 앱을 지웠을 때 "번호를 넣게 해주지 않고 왜 QR부터 찍으라 하냐"에 답할 수가
 * 없었고, 태블릿 앞이 아니면 아예 진행이 불가능했다.
 *
 * 이제 번호를 먼저 받는다. 문자 인증을 통과하면 그 번호로 쓰던 계정을 그대로
 * 잇는다(bootstrap_oauth_profile 이 JWT 의 검증된 번호로 찾아 준다).
 * 문자 인증이 아직 준비 안 됐거나 문자를 못 받는 상황이면 기존 QR 경로로
 * 넘어갈 수 있게 아래에 길을 남겨 둔다.
 */
export default function PhoneLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const activeMax = step === 'phone' ? PHONE_MAX_DIGITS : CODE_LENGTH;
  const setActiveValue = step === 'phone' ? setDigits : setCode;

  const handleSend = useCallback(async () => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await sendPhoneOtp(digits);
      setStep('code');
    } catch (error) {
      setErrorMessage(
        error instanceof PhoneOtpError ? error.message : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsBusy(false);
    }
  }, [digits]);

  const handleVerify = useCallback(async () => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await verifyPhoneOtp(digits, code);
      // 세션이 생기면 auth-session 이 프로필을 가져오고, 로그인 화면의
      // Redirect 가 설문/운동 중 맞는 곳으로 보낸다. 여기서 목적지를 또
      // 판단하면 두 곳이 서로 다른 규칙을 갖게 된다.
      router.replace('/login');
    } catch (error) {
      setErrorMessage(
        error instanceof PhoneOtpError ? error.message : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsBusy(false);
    }
  }, [digits, code, router]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        {step === 'phone' ? (
          <>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              전화번호를{'\n'}입력해 주세요
            </Text>
            <Text style={styles.display} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
              {formatPhoneNumber(digits)}
              <Text style={styles.displayRest}>
                {DIGIT_MASK.slice(formatPhoneNumber(digits).length)}
              </Text>
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              가입한 번호면 쓰던 기록 그대로 로그인됩니다.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              문자로 보낸{'\n'}인증번호를 넣어주세요
            </Text>
            <Text style={styles.display} maxFontSizeMultiplier={1.2}>
              {code.padEnd(CODE_LENGTH, '·')}
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              {formatPhoneNumber(digits)} 로 보냈습니다.
            </Text>
          </>
        )}

        <Keypad
          onDigit={(digit) => {
            setErrorMessage(null);
            setActiveValue((current) =>
              current.length >= activeMax ? current : `${current}${digit}`,
            );
          }}
          onClear={() => {
            setErrorMessage(null);
            setActiveValue('');
          }}
          onBackspace={() => {
            setErrorMessage(null);
            setActiveValue((current) => current.slice(0, -1));
          }}
          disabled={isBusy}
        />

        {errorMessage ? (
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {step === 'phone' ? (
          <PrimaryButton
            label="인증번호 받기"
            onPress={() => void handleSend()}
            disabled={!isValidPhoneNumber(digits)}
            loading={isBusy}
          />
        ) : (
          <>
            <PrimaryButton
              label="확인"
              onPress={() => void handleVerify()}
              disabled={code.length < CODE_LENGTH}
              loading={isBusy}
            />
            <PrimaryButton
              label="번호 다시 입력"
              variant="secondary"
              size="compact"
              onPress={() => {
                setStep('phone');
                setCode('');
                setErrorMessage(null);
              }}
              disabled={isBusy}
            />
          </>
        )}

        {/* 문자 인증이 아직 안 켜졌거나 문자를 못 받는 경우의 우회로.
            헬스장 태블릿 앞이라면 이쪽이 더 빠르기도 하다. */}
        <PrimaryButton
          label="헬스장 태블릿 QR로 연결하기"
          variant="quiet"
          size="compact"
          onPress={() => router.replace('/pair-scan')}
          disabled={isBusy}
        />
        <PrimaryButton
          label="뒤로"
          variant="quiet"
          size="compact"
          onPress={() => router.back()}
          disabled={isBusy}
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
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
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
