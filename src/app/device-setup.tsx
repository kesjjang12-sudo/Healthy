import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useDeviceRole } from '@/features/device-role/context';
import { APT_ID } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** 관리자 PIN 은 길이를 강제하지 않지만, 화면이 끝없이 늘어나지 않게 상한만 둔다. */
const PIN_MAX_DIGITS = 8;

/**
 * 이 앱은 하나의 코드베이스가 헬스장 입구 태블릿(키오스크)과 개인 폰 양쪽에
 * 깔린다. 최초 실행 시 한 번만 "이 기기는 무엇인가요?"를 묻는다.
 *
 * 개인 폰 선택은 바로 통과시킨다 — 잘못 골라도 개인정보가 새는 방향이 아니다.
 * 키오스크 선택은 관리자 PIN을 확인한다 — 개인 폰이 실수로(혹은 장난으로)
 * 공용 체크인 화면으로 바뀌어버리면 안 되기 때문이다. PIN을 아직 안 정한
 * 단지는(시범 단계) verify_kiosk_pin 이 항상 통과시킨다.
 */
export default function DeviceSetupScreen() {
  const insets = useSafeAreaInsets();
  const { role, isLoading, setRole } = useDeviceRole();

  const [mode, setMode] = useState<'choose' | 'kiosk-pin'>('choose');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const choosePersonal = useCallback(() => {
    void setRole('personal');
  }, [setRole]);

  const submitPin = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('verify_kiosk_pin', {
        p_apt_id: APT_ID,
        p_pin: pin,
      });

      if (error) throw error;

      if (!data) {
        setErrorMessage('PIN이 올바르지 않습니다.');
        setPin('');
        return;
      }

      await setRole('kiosk');
    } catch {
      setErrorMessage('확인하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }, [pin, setRole]);

  // 이미 역할이 정해진 기기라면 이 화면을 볼 일이 없다. index.tsx 가 여기로
  // 보내는 건 role 이 아직 없을 때뿐이다.
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
            <PrimaryButton label="헬스장 입구 태블릿" onPress={() => setMode('kiosk-pin')} />
            <PrimaryButton label="제 휴대폰입니다" variant="secondary" onPress={choosePersonal} />
          </View>
        </ScrollView>
      </View>
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
            {errorMessage ?? '단지 관리사무소에서 정한 번호입니다.'}
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
        <PrimaryButton label="뒤로" variant="quiet" size="compact" onPress={() => setMode('choose')} />
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
