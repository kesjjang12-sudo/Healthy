import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { PhoneOtpError, requestSmsOtp, verifySmsOtp } from '@/features/auth/phone-otp';
import {
  PHONE_MAX_DIGITS,
  formatPhoneNumber,
  isValidPhoneNumber,
  toDigits,
} from '@/features/auth/phone';

/** Auth 훅(send-sms)이 보내는 인증번호는 6자리다. */
const OTP_LENGTH = 6;

/**
 * 로그인 화면에서 "전화번호로 시작하기"를 고르면 오는 화면.
 * 번호를 넣으면 문자로 인증번호가 오고, 그걸 입력하면 로그인된다 — 키오스크
 * 없이 어디서든 되는 전화번호 로그인이다. 헬스장 태블릿 앞이라면 QR 페어링
 * (pair-scan)이 더 빠르므로 아래에 그 길도 열어 둔다.
 */
export default function PhoneLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser } = useAuthSession();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSend = useCallback(async () => {
    setIsSending(true);
    setErrorMessage(null);

    try {
      await requestSmsOtp(phone);
      setCode('');
      setStep('code');
    } catch (error) {
      setErrorMessage(
        error instanceof PhoneOtpError ? error.message : '인증번호를 보내지 못했습니다.',
      );
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  const handleVerify = useCallback(async () => {
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const user = await verifySmsOtp(phone, code);
      setUser(user);
      router.replace(user.profile_data?.onboarded_at ? '/workout' : '/onboarding');
    } catch (error) {
      setErrorMessage(
        error instanceof PhoneOtpError ? error.message : '인증하지 못했습니다. 다시 시도해 주세요.',
      );
      setCode('');
      setIsVerifying(false);
    }
  }, [phone, code, router, setUser]);

  const isBusy = isSending || isVerifying;

  const keypad = (
    <Keypad
      onDigit={(digit) => {
        setErrorMessage(null);
        if (step === 'phone') {
          setPhone((current) =>
            toDigits(current).length >= PHONE_MAX_DIGITS ? current : `${current}${digit}`,
          );
        } else {
          setCode((current) => (current.length >= OTP_LENGTH ? current : `${current}${digit}`));
        }
      }}
      onClear={() => {
        setErrorMessage(null);
        if (step === 'phone') setPhone('');
        else setCode('');
      }}
      onBackspace={() => {
        setErrorMessage(null);
        if (step === 'phone') setPhone((current) => toDigits(current).slice(0, -1));
        else setCode((current) => current.slice(0, -1));
      }}
      disabled={isBusy}
    />
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {step === 'phone' ? (
          <>
            <View style={styles.headings}>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                휴대폰 번호를{'\n'}입력해 주세요
              </Text>
              <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                문자로 인증번호를 보내드려요
              </Text>
            </View>

            <Text
              style={[styles.valueDisplay, !phone && styles.valuePlaceholder]}
              maxFontSizeMultiplier={1.2}>
              {phone ? formatPhoneNumber(phone) : '010-0000-0000'}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.headings}>
              <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                문자로 받은 번호를{'\n'}입력해 주세요
              </Text>
              <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
                {formatPhoneNumber(phone)} 으로 보냈어요
              </Text>
            </View>

            <Text style={styles.valueDisplay} maxFontSizeMultiplier={1.2}>
              {code.padEnd(OTP_LENGTH, '·')}
            </Text>
          </>
        )}

        {keypad}

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
        {step === 'phone' ? (
          <>
            <PrimaryButton
              label="인증번호 받기"
              onPress={() => void handleSend()}
              disabled={!isValidPhoneNumber(phone)}
              loading={isSending}
            />
            {/* 헬스장 태블릿 앞이면 문자 없이 QR 이 더 빠르다. 태블릿의 QR 안내를
                보고 온 사람이 길을 잃지 않도록 여기서도 이어준다. */}
            <PrimaryButton
              label="헬스장 QR로 연결하기"
              variant="secondary"
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
          </>
        ) : (
          <>
            <PrimaryButton
              label="확인"
              onPress={() => void handleVerify()}
              disabled={code.length < OTP_LENGTH}
              loading={isVerifying}
            />
            <PrimaryButton
              label="인증번호 다시 받기"
              variant="secondary"
              onPress={() => void handleSend()}
              loading={isSending}
              disabled={isVerifying}
            />
            <PrimaryButton
              label="번호 다시 입력하기"
              variant="quiet"
              size="compact"
              onPress={() => {
                setErrorMessage(null);
                setCode('');
                setStep('phone');
              }}
              disabled={isBusy}
            />
          </>
        )}
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
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
    textAlign: 'center',
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  valueDisplay: {
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: 4,
    color: Colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  valuePlaceholder: {
    color: Colors.textDisabled,
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
