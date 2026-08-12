import { Redirect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceButton } from '@/components/choice-button';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/session';
import { updateProfileData } from '@/features/onboarding/api';
import { findFirstUnansweredIndex, PROFILE_QUESTIONS } from '@/features/onboarding/questions';
import type { ProfileData } from '@/lib/database.types';

/** 가로가 이만큼 넓으면 선택지를 2열로 편다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

/**
 * 신규 회원 프로필 설문. 성별 / 연령대 / 운동목적 3문항이고,
 * 여기서 모은 값이 AI 루틴 생성의 입력이 된다.
 *
 * 선택하면 바로 다음 문항으로 넘어간다. "다음" 버튼을 한 번 더 누르게 하면
 * 탭 수가 두 배가 되는데, 입구 태블릿 한 대에 줄이 서는 구조라 그만큼이 아깝다.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, isRestoring, setUser, touch } = useSession();

  // 지난번에 중간에 나갔다면 남은 문항부터 이어서 묻는다.
  const [stepIndex, setStepIndex] = useState(() => findFirstUnansweredIndex(user?.profile_data));
  const [answers, setAnswers] = useState<Partial<ProfileData>>(() => ({ ...user?.profile_data }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingAnswers = useRef<Partial<ProfileData>>({});

  const submit = useCallback(
    async (patch: Partial<ProfileData>) => {
      if (!user) return;

      setIsSubmitting(true);
      setErrorMessage(null);

      try {
        const updated = await updateProfileData(user.id, {
          ...patch,
          onboarded_at: new Date().toISOString(),
        });
        setUser(updated);
        router.replace('/home');
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [router, setUser, user],
  );

  const handleSelect = useCallback(
    (key: keyof ProfileData, value: ProfileData[keyof ProfileData]) => {
      touch();

      const nextAnswers = { ...answers, [key]: value };
      setAnswers(nextAnswers);
      pendingAnswers.current = nextAnswers;

      const isLastStep = stepIndex === PROFILE_QUESTIONS.length - 1;

      if (isLastStep) {
        void submit(nextAnswers);
        return;
      }

      // 중간 답도 바로 저장해 둔다. 화면을 막지 않으려고 응답은 기다리지 않는다 —
      // 실패해도 마지막 저장이 전체 값을 다시 보내므로 손실되지 않는다.
      if (user) {
        void updateProfileData(user.id, { [key]: value }).catch(() => {});
      }

      setStepIndex((current) => current + 1);
    },
    [answers, stepIndex, submit, touch, user],
  );

  const handleBack = useCallback(() => {
    touch();
    setErrorMessage(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }, [touch]);

  // 훅 호출 뒤에 리다이렉트를 판단한다.
  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;
  if (user.profile_data?.onboarded_at) return <Redirect href="/home" />;

  const question = PROFILE_QUESTIONS[stepIndex];
  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;

  if (isSubmitting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText} maxFontSizeMultiplier={1.3}>
          맞춤 운동을 준비하고 있어요
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <View style={styles.progress} accessibilityLabel={`전체 ${PROFILE_QUESTIONS.length}문항 중 ${stepIndex + 1}번째`}>
        {PROFILE_QUESTIONS.map((item, index) => (
          <View
            key={item.key}
            style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentActive]}
          />
        ))}
      </View>

      {stepIndex === 0 ? (
        <Text style={styles.intro} maxFontSizeMultiplier={1.3}>
          등록이 끝났습니다! 딱 세 가지만 여쭐게요.
        </Text>
      ) : null}

      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        {question.title}
      </Text>

      <View style={styles.options} accessibilityRole="radiogroup">
        {question.options.map((option) => (
          <ChoiceButton
            key={String(option.value)}
            label={option.label}
            caption={option.caption}
            selected={answers[question.key] === option.value}
            onPress={() => handleSelect(question.key, option.value)}
            style={isWide ? styles.optionWide : styles.optionNarrow}
          />
        ))}
      </View>

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
          <PrimaryButton label="다시 시도" onPress={() => void submit(pendingAnswers.current)} />
        </View>
      ) : null}

      {stepIndex > 0 ? (
        <PrimaryButton label="이전" variant="ghost" onPress={handleBack} style={styles.backButton} />
      ) : null}
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
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.background,
  },
  loadingText: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  progress: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  progressSegment: {
    flex: 1,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfacePressed,
  },
  progressSegmentActive: {
    backgroundColor: Colors.primary,
  },
  intro: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  optionNarrow: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  optionWide: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  errorBox: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerFaint,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.danger,
    textAlign: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.xxl,
  },
});
