import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConsentCheckbox } from '@/components/consent-checkbox';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import {
  BIRTH_DATE_LENGTH,
  formatBirthDate,
  isValidBirthDate,
  toAgeGroup,
  toIsoDate,
} from '@/features/auth/birth-date';
import { formatPhoneNumber, isValidPhoneNumber, PHONE_MAX_DIGITS, toDigits } from '@/features/auth/phone';
import { PhoneOtpError, sendPhoneOtp, verifyPhoneOtp } from '@/features/auth/phone-otp';
import { updateProfileData } from '@/features/onboarding/api';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/database.types';

/** GoTrue 가 보내는 SMS 인증번호 자릿수. */
const CODE_LENGTH = 6;

const CONSENT_LABEL = '개인정보 수집·이용에 동의합니다 (필수)';
const CONSENT_DETAIL =
  '이름·전화번호·생년월일을 회원 확인과 운동 기록 관리에 사용합니다. 탈퇴하시면 지웁니다.';

/**
 * 전화번호 가입/로그인 화면.
 *
 * 예전에는 이 버튼이 곧장 QR 스캐너로 보냈다. 이미 가입한 사람이 앱을 지웠을 때
 * "번호를 넣게 해주지 않고 왜 QR부터 찍으라 하냐"에 답할 수가 없었다.
 *
 * 지금은 가입에 필요한 것을 한 화면에서 다 받는다. 다만 이미 있는 회원에게
 * 이름·생년월일을 또 받지는 않는다 — 문자 인증이 끝나는 순간 서버가 그 번호의
 * 계정을 찾아 주므로(bootstrap_oauth_profile), 기존 회원이면 나머지를 묻지 않고
 * 그대로 들여보낸다. 같은 화면이 신규에게는 가입 폼, 기존 회원에게는 로그인이 된다.
 */
export default function PhoneLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser } = useAuthSession();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [busy, setBusy] = useState<'sending' | 'verifying' | 'signing' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phoneReady = isValidPhoneNumber(phone);
  const canSignUp = isVerified && name.trim().length > 0 && isValidBirthDate(birthDate) && agreed;

  const handleSend = useCallback(async () => {
    setBusy('sending');
    setErrorMessage(null);

    try {
      await sendPhoneOtp(phone);
      setIsCodeSent(true);
    } catch (error) {
      setErrorMessage(error instanceof PhoneOtpError ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }, [phone]);

  const handleVerify = useCallback(async () => {
    setBusy('verifying');
    setErrorMessage(null);

    try {
      await verifyPhoneOtp(phone, code);

      // 인증이 끝나면 세션이 생긴다. 서버가 이 번호로 쓰던 계정을 찾아 잇는다.
      const { data } = await supabase.rpc('bootstrap_oauth_profile');
      const user = (data?.user ?? null) as User | null;

      // 이미 가입을 마친 분이다. 이름·생년월일을 또 받을 이유가 없다.
      // QR 페어링으로만 만든 예전 계정은 이 값들이 없어서 폼이 그대로 남는데,
      // 그건 맞다 — 그때는 받은 적이 없는 정보다. 기록은 서버가 번호로 찾아
      // 이어 주므로 다시 묻는다고 잃는 것은 없다.
      if (user?.profile_data?.real_name && user.profile_data.privacy_consent_at) {
        setUser(user);
        router.replace(user.profile_data?.onboarded_at ? '/workout' : '/onboarding');
        return;
      }

      setIsVerified(true);
    } catch (error) {
      setErrorMessage(error instanceof PhoneOtpError ? error.message : '인증을 마치지 못했어요.');
    } finally {
      setBusy(null);
    }
  }, [phone, code, router, setUser]);

  const handleSignUp = useCallback(async () => {
    setBusy('signing');
    setErrorMessage(null);

    try {
      const { data } = await supabase.rpc('bootstrap_oauth_profile');
      const user = (data?.user ?? null) as User | null;
      if (!user) throw new Error('profile missing');

      const updated = await updateProfileData(user.id, {
        // nickname 이 아니라 real_name 이다. nickname 은 랭킹에 그대로 노출되는
        // 값이라 실명을 넣으면 안 된다. 랭킹에는 계속 "회원xxxx" 로 나가고,
        // 보이는 이름은 프로필 탭에서 따로 정한다.
        real_name: name.trim(),
        birth_date: toIsoDate(birthDate),
        // 설문이 묻는 연령대를 여기서 채워 두면 그 질문을 한 번 덜 묻는다.
        age_group: toAgeGroup(birthDate),
        // 동의는 "했다"는 사실만이 아니라 시점이 남아야 기록으로 쓸 수 있다.
        privacy_consent_at: new Date().toISOString(),
      });

      setUser(updated);
      router.replace(updated.profile_data?.onboarded_at ? '/workout' : '/onboarding');
    } catch {
      setErrorMessage('가입을 마치지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }, [name, birthDate, router, setUser]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          전화번호로 시작하기
        </Text>

        <TextField
          label="이름"
          value={name}
          onChangeText={setName}
          placeholder="홍길동"
          maxLength={20}
        />

        <View style={styles.fieldRow}>
          <View style={styles.fieldGrow}>
            <TextField
              label="전화번호"
              value={formatPhoneNumber(phone)}
              onChangeText={(text) => setPhone(toDigits(text).slice(0, PHONE_MAX_DIGITS))}
              placeholder="010-1234-5678"
              keyboardType="number-pad"
            />
          </View>
          <PrimaryButton
            label={isCodeSent ? '다시 받기' : '인증번호 받기'}
            variant="secondary"
            size="compact"
            style={styles.fieldButton}
            disabled={!phoneReady || busy !== null || isVerified}
            loading={busy === 'sending'}
            onPress={() => void handleSend()}
          />
        </View>

        {/* 인증번호 칸은 문자를 보낸 뒤에만 띄운다. 처음부터 비어 있는 칸이
            보이면 뭘 먼저 눌러야 하는지 헷갈린다. */}
        {isCodeSent && !isVerified ? (
          <View style={styles.fieldRow}>
            <View style={styles.fieldGrow}>
              <TextField
                label="인증번호"
                value={code}
                onChangeText={(text) => setCode(toDigits(text).slice(0, CODE_LENGTH))}
                placeholder="6자리"
                keyboardType="number-pad"
              />
            </View>
            <PrimaryButton
              label="확인"
              size="compact"
              style={styles.fieldButton}
              disabled={code.length < CODE_LENGTH || busy !== null}
              loading={busy === 'verifying'}
              onPress={() => void handleVerify()}
            />
          </View>
        ) : null}

        {isVerified ? (
          <View style={styles.verifiedBox}>
            <Text style={styles.verifiedText} maxFontSizeMultiplier={1.3}>
              전화번호 인증이 끝났어요.
            </Text>
          </View>
        ) : null}

        <TextField
          label="생년월일"
          value={formatBirthDate(birthDate)}
          onChangeText={(text) => setBirthDate(toDigits(text).slice(0, BIRTH_DATE_LENGTH))}
          placeholder="1985.03.12"
          keyboardType="number-pad"
        />

        <ConsentCheckbox
          checked={agreed}
          onChange={setAgreed}
          label={CONSENT_LABEL}
          detail={CONSENT_DETAIL}
        />

        {errorMessage ? (
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="가입하고 시작하기"
          disabled={!canSignUp || busy !== null}
          loading={busy === 'signing'}
          onPress={() => void handleSignUp()}
        />
        {/* 문자가 안 오거나 문자 인증이 아직 준비 안 된 경우의 우회로.
            헬스장 태블릿 앞이라면 이쪽이 더 빠르기도 하다. */}
        <PrimaryButton
          label="헬스장 태블릿 QR로 연결하기"
          variant="quiet"
          size="compact"
          disabled={busy !== null}
          onPress={() => router.replace('/pair-scan')}
        />
        <PrimaryButton
          label="뒤로"
          variant="quiet"
          size="compact"
          disabled={busy !== null}
          onPress={() => router.back()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  fieldGrow: {
    flex: 1,
  },
  fieldButton: {
    minWidth: 116,
  },
  verifiedBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.successFaint,
  },
  verifiedText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
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
