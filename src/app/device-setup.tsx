import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { EnrollmentError, resolveApartmentForKiosk } from '@/features/apartment/api';
import { useDeviceRole } from '@/features/device-role/context';

/** 관리자 PIN 은 길이를 강제하지 않지만, 화면이 끝없이 늘어나지 않게 상한만 둔다. */
const PIN_MAX_DIGITS = 8;

/** 단지 등록 코드는 6자리다. 구분용 하이픈·공백은 세지 않는다. */
const ENROLL_CODE_LENGTH = 6;

/** 관리사무소가 'test-24' 로 적어 와도 통하게 한다. 정규화는 서버도 똑같이 한다. */
function normalizeEnrollCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, ENROLL_CODE_LENGTH);
}

/**
 * 이 앱은 하나의 코드베이스가 헬스장 입구 태블릿(키오스크)과 개인 폰 양쪽에
 * 깔린다. 최초 실행 시 한 번만 "이 기기는 무엇인가요?"를 묻는다.
 *
 * 개인 폰 선택은 바로 통과시킨다 — 잘못 골라도 개인정보가 새는 방향이 아니다.
 *
 * 태블릿 선택은 단지 등록 코드와 관리자 PIN 을 받는다. 두 가지를 한꺼번에
 * 하는 셈인데, 둘 다 같은 이유에서 필요하다. 코드는 이 태블릿이 어느 단지인지
 * 정하고(그래야 여기서 번호를 누른 주민이 옳은 단지로 체크인된다), PIN 은
 * 아무나 그 단지의 태블릿을 자처하지 못하게 막는다. 이 값이 정해지고 나면
 * 기기에 저장돼서 다시 묻지 않는다.
 */
export default function DeviceSetupScreen() {
  const insets = useSafeAreaInsets();
  const { role, isLoading, setPersonal, setKiosk } = useDeviceRole();

  const [mode, setMode] = useState<'choose' | 'enroll-code' | 'kiosk-pin'>('choose');
  const [enrollCode, setEnrollCode] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const choosePersonal = useCallback(() => {
    void setPersonal();
  }, [setPersonal]);

  const submitPin = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const apartment = await resolveApartmentForKiosk(enrollCode, pin);
      await setKiosk({ aptId: apartment.apt_id, aptName: apartment.apt_name });
    } catch (error) {
      setErrorMessage(
        error instanceof EnrollmentError ? error.message : '확인하지 못했습니다. 다시 시도해 주세요.',
      );
      setPin('');

      // 코드 자체가 틀렸을 수도 있으니 코드 입력으로 되돌린다. 잠긴 경우엔
      // 되돌려 봐야 소용없으므로 PIN 화면에 그대로 둔다.
      if (error instanceof EnrollmentError && error.code === 'INVALID') {
        setMode('enroll-code');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [enrollCode, pin, setKiosk]);

  // 이미 설정이 끝난 기기라면 이 화면을 볼 일이 없다. index.tsx 가 여기로
  // 보내는 건 설정이 아직 없을 때뿐이다.
  if (!isLoading && role) {
    return <Redirect href={role === 'kiosk' ? '/kiosk/checkin' : '/'} />;
  }

  if (mode === 'choose') {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
          <View style={styles.headings}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              이 기기는{'\n'}무엇인가요?
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              처음 한 번만 물어봅니다.
            </Text>
          </View>

          <View style={styles.choices}>
            <PrimaryButton
              label="헬스장 입구 태블릿"
              onPress={() => {
                setErrorMessage(null);
                setMode('enroll-code');
              }}
            />
            <PrimaryButton label="제 휴대폰입니다" variant="secondary" onPress={choosePersonal} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (mode === 'enroll-code') {
    const isComplete = enrollCode.length === ENROLL_CODE_LENGTH;

    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.headings}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              단지 코드를{'\n'}입력해 주세요
            </Text>
            <Text
              style={[styles.helper, errorMessage ? styles.helperError : null]}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {errorMessage ?? '관리사무소에서 받은 6자리 코드입니다.'}
            </Text>
          </View>

          <TextField
            label="단지 코드"
            value={enrollCode}
            onChangeText={(text) => {
              setErrorMessage(null);
              setEnrollCode(normalizeEnrollCode(text));
            }}
            placeholder="예: TEST24"
            autoCapitalize="characters"
            returnKeyType="next"
            onSubmitEditing={() => {
              if (isComplete) setMode('kiosk-pin');
            }}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <PrimaryButton label="다음" onPress={() => setMode('kiosk-pin')} disabled={!isComplete} />
          <PrimaryButton
            label="뒤로"
            variant="quiet"
            size="compact"
            onPress={() => setMode('choose')}
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  const dots = Array.from({ length: Math.max(pin.length, 1) }, (_, index) => index < pin.length);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            관리자 PIN을{'\n'}입력해 주세요
          </Text>
          <Text
            style={[styles.helper, errorMessage ? styles.helperError : null]}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {errorMessage ?? `단지 코드 ${enrollCode} · 관리사무소에서 정한 번호입니다.`}
          </Text>
        </View>

        <View style={styles.pinDots} accessibilityLabel={`${pin.length}자리 입력됨`}>
          {dots.map((filled, index) => (
            <View key={index} style={[styles.pinDot, filled && styles.pinDotFilled]} />
          ))}
        </View>

        <Keypad
          onDigit={(digit) => {
            setErrorMessage(null);
            setPin((current) => (current.length >= PIN_MAX_DIGITS ? current : `${current}${digit}`));
          }}
          onClear={() => {
            setErrorMessage(null);
            setPin('');
          }}
          onBackspace={() => {
            setErrorMessage(null);
            setPin((current) => current.slice(0, -1));
          }}
          disabled={isSubmitting}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton
          label="확인"
          onPress={() => void submitPin()}
          disabled={pin.length === 0}
          loading={isSubmitting}
        />
        <PrimaryButton
          label="뒤로"
          variant="quiet"
          size="compact"
          onPress={() => setMode('enroll-code')}
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
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
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
  choices: {
    gap: Spacing.md,
  },
  pinDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  pinDotFilled: {
    backgroundColor: Colors.primary,
  },
  footer: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
});
