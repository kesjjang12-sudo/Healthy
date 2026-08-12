import { Redirect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { updateProfileData } from '@/features/onboarding/api';
import {
  CONFIRM_STEP_INDEX,
  findFirstUnansweredIndex,
  formatAnswer,
  isAnswered,
  PROFILE_QUESTIONS,
  type ProfileQuestion,
} from '@/features/onboarding/questions';
import type { ProfileData, User } from '@/lib/database.types';

/** 가로가 이만큼 넓으면 선택지를 2열로 편다. */
const WIDE_LAYOUT_MIN_WIDTH = 900;

/** 다중 선택 문항의 현재 값 (아직 안 고른 상태는 undefined) */
function selectedValues(
  question: ProfileQuestion,
  values: Partial<ProfileData>,
): readonly string[] | undefined {
  const value = values[question.key];
  return Array.isArray(value) ? (value as readonly string[]) : undefined;
}

/**
 * 세션 복원이 끝나기 전에는 설문 본체를 띄우지 않는다.
 * 저장된 답변으로 시작 문항을 정해야 하는데, 복원 전에는 user 가 아직 null 이라
 * 여기서 걸러내지 않으면 항상 1번 문항부터 다시 묻게 된다.
 */
export default function OnboardingScreen() {
  const { user, isRestoring } = useAuthSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/login" />;
  if (user.profile_data?.onboarded_at) return <Redirect href="/workout" />;

  return <OnboardingFlow user={user} />;
}

/**
 * 신규 회원 프로필 설문. 성별 / 연령대 / 운동목적 / 아픈 곳 4문항에
 * 최종 확인 화면이 붙는다. 여기서 모은 값이 AI 루틴 생성의 입력이 된다.
 *
 * 단일 선택 문항은 고르면 바로 넘어간다. 입구 태블릿 한 대에 줄이 서는 구조라
 * "다음"을 한 번 더 누르게 하면 탭 수가 두 배가 된다. 대신 잘못 눌러도 마지막
 * 확인 화면에서 되돌릴 수 있게 했다.
 */
function OnboardingFlow({ user }: { user: User }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { setUser } = useAuthSession();

  // 지난번에 중간에 나갔다면 남은 문항부터 이어서 묻는다.
  const [stepIndex, setStepIndex] = useState(() => findFirstUnansweredIndex(user.profile_data));
  const [answers, setAnswers] = useState<Partial<ProfileData>>(() => ({ ...user.profile_data }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** 화면을 막지 않으려고 응답은 기다리지 않는다. 실패해도 최종 저장이 전체 값을 다시 보낸다. */
  const saveInBackground = useCallback(
    (patch: Partial<ProfileData>) => {
      void updateProfileData(user.id, patch).catch(() => {});
    },
    [user.id],
  );

  // 값은 문항 정의에서 키와 짝지어 오므로 여기서는 원시값으로만 받는다.
  const handleSingleSelect = useCallback(
    (key: 'gender' | 'age_group', value: string | number) => {
      setAnswers((current) => ({ ...current, [key]: value }));
      saveInBackground({ [key]: value });
      setStepIndex((current) => current + 1);
    },
    [saveInBackground],
  );

  const handleMultiToggle = useCallback(
    (question: ProfileQuestion, value: string) => {
      setAnswers((current) => {
        const list = selectedValues(question, current) ?? [];
        const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
        return { ...current, [question.key]: next };
      });
    },
    [],
  );

  /** "없습니다" 는 다른 선택지와 같이 고를 수 없다. 빈 배열로 저장한다. */
  const handleSelectNone = useCallback(
    (question: ProfileQuestion) => {
      setAnswers((current) => ({ ...current, [question.key]: [] }));
    },
    [],
  );

  const handleNext = useCallback(
    (question: ProfileQuestion) => {
      saveInBackground({ [question.key]: answers[question.key] });
      setStepIndex((current) => current + 1);
    },
    [answers, saveInBackground],
  );

  const handleBack = useCallback(() => {
    setErrorMessage(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await updateProfileData(user.id, {
        ...answers,
        onboarded_at: new Date().toISOString(),
      });
      setUser(updated);
      router.replace('/workout');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, router, setUser, user.id]);

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const isConfirmStep = stepIndex >= CONFIRM_STEP_INDEX;

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

  const progress = (
    <View
      style={styles.progress}
      accessibilityLabel={`전체 ${CONFIRM_STEP_INDEX + 1}단계 중 ${Math.min(stepIndex, CONFIRM_STEP_INDEX) + 1}번째`}>
      {[...PROFILE_QUESTIONS, null].map((item, index) => (
        <View
          key={item?.key ?? 'confirm'}
          style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentActive]}
        />
      ))}
    </View>
  );

  const errorBox = errorMessage ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
        {errorMessage}
      </Text>
    </View>
  ) : null;

  if (isConfirmStep) {
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
          {progress}

          <View style={styles.headings}>
            <Text style={styles.title} maxFontSizeMultiplier={1.2}>
              이대로 시작할까요?
            </Text>
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              잘못 누르신 곳이 있으면 고치기를 눌러주세요.
            </Text>
          </View>

          <View style={styles.summary}>
            {PROFILE_QUESTIONS.map((question, index) => (
              <View key={question.key} style={styles.summaryRow}>
                <View style={styles.summaryTexts}>
                  <Text style={styles.summaryLabel} maxFontSizeMultiplier={1.3}>
                    {question.summaryLabel}
                  </Text>
                  <Text style={styles.summaryValue} maxFontSizeMultiplier={1.3}>
                    {formatAnswer(question, answers)}
                  </Text>
                </View>
                <PrimaryButton
                  label="고치기"
                  accessibilityLabel={`${question.summaryLabel} 고치기`}
                  variant="quiet"
                  size="compact"
                  onPress={() => {
                    setErrorMessage(null);
                    setStepIndex(index);
                  }}
                />
              </View>
            ))}
          </View>

          {errorBox}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <PrimaryButton label="네, 시작할게요" onPress={() => void handleConfirm()} />
        </View>
      </View>
    );
  }

  const question = PROFILE_QUESTIONS[stepIndex];
  const multiValues = question.mode === 'multi' ? selectedValues(question, answers) : undefined;
  const isNoneSelected = multiValues?.length === 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {progress}

        <View style={styles.headings}>
          {stepIndex === 0 ? (
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
              등록이 끝났습니다
            </Text>
          ) : null}
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {question.title}
          </Text>
          {question.mode === 'multi' ? (
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              {question.helper}
            </Text>
          ) : null}
        </View>

        <View style={styles.options} accessibilityRole="radiogroup">
          {question.mode === 'multi' && question.noneLabel ? (
            <ChoiceButton
              label={question.noneLabel}
              role="checkbox"
              selected={isNoneSelected}
              onPress={() => handleSelectNone(question)}
              style={styles.optionFull}
            />
          ) : null}

          {question.options.map((option) => (
            <ChoiceButton
              key={String(option.value)}
              label={option.label}
              caption={option.caption}
              role={question.mode === 'multi' ? 'checkbox' : 'radio'}
              selected={
                question.mode === 'single'
                  ? answers[question.key] === option.value
                  : (multiValues?.includes(String(option.value)) ?? false)
              }
              onPress={() =>
                question.mode === 'single'
                  ? handleSingleSelect(question.key, option.value)
                  : handleMultiToggle(question, String(option.value))
              }
              style={isWide ? styles.optionWide : styles.optionFull}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {question.mode === 'multi' ? (
          <PrimaryButton
            label="다음"
            onPress={() => handleNext(question)}
            disabled={!isAnswered(question, answers)}
          />
        ) : null}
        {stepIndex > 0 ? (
          <PrimaryButton
            label="이전"
            variant="quiet"
            size="compact"
            onPress={handleBack}
            style={styles.backButton}
          />
        ) : null}
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
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  progress: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  progressSegmentActive: {
    backgroundColor: Colors.primary,
  },
  headings: {
    gap: Spacing.sm,
  },
  eyebrow: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
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
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  optionFull: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  optionWide: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  summary: {
    gap: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  summaryTexts: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  errorBox: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerFaint,
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
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'center',
  },
});
