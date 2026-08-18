import { Redirect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceButton } from '@/components/choice-button';
import { FontScalePicker } from '@/components/font-scale-picker';
import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { logBodyWeight, parseHeightInput, parseWeightInput, sanitizeWeightText } from '@/features/body/api';
import { needsConsent } from '@/features/legal/api';
import { updateProfileData } from '@/features/onboarding/api';
import { useFontScale } from '@/features/settings/font-scale';
import {
  confirmStepIndex,
  findFirstUnansweredIndex,
  formatAnswer,
  isAnswered,
  questionsFor,
  type ProfileQuestion,
} from '@/features/onboarding/questions';
import type { FontScale, ProfileData, User } from '@/lib/database.types';

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
  // 아픈 곳을 묻기 전에 동의를 받아야 한다.
  if (needsConsent(user)) return <Redirect href="/consent" />;
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
  const { setUser, signOut } = useAuthSession();
  const { scale: fontScale, setScale } = useFontScale();

  // 아픈 곳에 동의하지 않으신 분께는 그 문항을 아예 띄우지 않는다.
  const questions = useMemo(() => questionsFor(user.profile_data), [user.profile_data]);
  const lastStepIndex = confirmStepIndex(questions);

  // 지난번에 중간에 나갔다면 남은 문항부터 이어서 묻는다.
  const [stepIndex, setStepIndex] = useState(() => findFirstUnansweredIndex(user.profile_data));
  const [answers, setAnswers] = useState<Partial<ProfileData>>(() => ({ ...user.profile_data }));

  // 확인 화면의 "고치기"로 돌아온 상태. 이때는 답을 고른 뒤 다음 문항으로
  // 걸어가지 않고 곧장 확인 화면으로 복귀한다 — 남은 문항을 다시 다 지나게
  // 하면 뭘 고쳤는지 확인하러 가는 길이 너무 멀다(디자인 피드백).
  const editingFromSummary = useRef(false);

  const advance = useCallback(() => {
    if (editingFromSummary.current) {
      editingFromSummary.current = false;
      setStepIndex(lastStepIndex);
    } else {
      setStepIndex((c) => c + 1);
    }
  }, [lastStepIndex]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 키·몸무게는 선택지가 아니라 숫자 입력이라 문자열 상태를 따로 둔다.
  // ("72.5" 처럼 소수점 입력 중간 상태는 숫자로 못 담는다)
  const [heightText, setHeightText] = useState(() =>
    user.profile_data?.height_cm !== undefined ? String(user.profile_data.height_cm) : '',
  );
  const [weightText, setWeightText] = useState(() =>
    user.profile_data?.weight_kg !== undefined ? String(user.profile_data.weight_kg) : '',
  );

  /** 화면을 막지 않으려고 응답은 기다리지 않는다. 실패해도 최종 저장이 전체 값을 다시 보낸다. */
  const saveInBackground = useCallback(
    (patch: Partial<ProfileData>) => {
      void updateProfileData(user.id, patch).catch(() => {});
    },
    [user.id],
  );

  // 값은 문항 정의에서 키와 짝지어 오므로 여기서는 원시값으로만 받는다.
  /**
   * 단일 선택도 이제 자동으로 안 넘어간다. 예전엔 고르는 순간 다음 문항으로
   * 갔는데, 잘못 눌렀을 때 무슨 일이 일어났는지 볼 새가 없었다(오너 피드백).
   * 고르면 파란 테두리로 멈춰서 보여주고, "다음"을 눌러야 넘어간다.
   */
  const handleSingleSelect = useCallback(
    (key: 'gender' | 'age_group', value: string | number) => {
      setAnswers((current) => ({ ...current, [key]: value }));
      saveInBackground({ [key]: value });
    },
    [saveInBackground],
  );

  /**
   * 이름은 한 글자 칠 때마다 서버로 보내지 않는다 — 자판을 두드리는 내내
   * 요청이 나간다. "다음"을 누를 때 handleNext 가 한 번에 저장한다.
   */
  const handleTextChange = useCallback((text: string) => {
    setAnswers((current) => ({ ...current, nickname: text }));
  }, []);

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

  /** "없어요" 는 다른 선택지와 같이 고를 수 없다. 빈 배열로 저장한다. */
  const handleSelectNone = useCallback(
    (question: ProfileQuestion) => {
      setAnswers((current) => ({ ...current, [question.key]: [] }));
    },
    [],
  );

  /**
   * 글자 크기는 고르는 즉시 화면에 반영한다 — 이 문항의 요지가 "눌러 보고
   * 확인한다"라서, 다음 화면에 가서야 커지면 고를 수가 없다.
   * 답으로도 기록해 두어야 최종 확인 화면과 서버 저장에 함께 실린다.
   */
  const handlePickFontScale = useCallback(
    (next: FontScale) => {
      setScale(next);
      setAnswers((current) => ({ ...current, font_scale: next }));
    },
    [setScale],
  );

  /**
   * 화면에 지금 적용돼 있는 크기를 그대로 답으로 굳힌다. handleNext 를 안 쓰는
   * 이유는, 안 누르고 넘어가신 분의 answers 에는 아직 값이 없어서다 — 그때도
   * 눈으로 보고 계신 크기(기본 '중간')가 저장돼야 다음에 켰을 때 안 달라진다.
   */
  const handleFontNext = useCallback(() => {
    setAnswers((current) => ({ ...current, font_scale: fontScale }));
    saveInBackground({ font_scale: fontScale });
    advance();
  }, [fontScale, saveInBackground, advance]);

  const handleNext = useCallback(
    (question: ProfileQuestion) => {
      const value = answers[question.key];
      // 이름 앞뒤 공백은 여기서 턴다. 저장해 두면 "김철수 님"이 "김철수  님"이 된다.
      saveInBackground({
        [question.key]: question.mode === 'text' && typeof value === 'string' ? value.trim() : value,
      });
      advance();
    },
    [answers, saveInBackground, advance],
  );

  const handleBodyNext = useCallback(() => {
    const height = parseHeightInput(heightText);
    const weight = parseWeightInput(weightText);
    if (height === null || weight === null) return;

    setAnswers((current) => ({ ...current, height_cm: height, weight_kg: weight }));
    saveInBackground({ height_cm: height, weight_kg: weight });
    advance();
  }, [heightText, weightText, saveInBackground, advance]);

  const handleBack = useCallback(() => {
    setErrorMessage(null);
    if (editingFromSummary.current) {
      editingFromSummary.current = false;
      setStepIndex(lastStepIndex);
      return;
    }
    setStepIndex((current) => Math.max(0, current - 1));
  }, [lastStepIndex]);

  /**
   * 첫 문항에서는 설문 안에 돌아갈 곳이 없다. 그렇다고 버튼을 아예 안 두면
   * 잘못 들어온 사람이 빠져나갈 방법이 없어진다(로그인이 어정쩡하게 끝났을 때
   * 실제로 갇히는 문제가 있었다). 로그아웃까지 하고 나가야 로그인 화면이
   * 다시 설문으로 되돌려보내지 않는다.
   */
  const handleExit = useCallback(async () => {
    await signOut();
    router.replace('/login');
  }, [router, signOut]);

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await updateProfileData(user.id, {
        ...answers,
        ...(typeof answers.nickname === 'string' ? { nickname: answers.nickname.trim() } : {}),
        onboarded_at: new Date().toISOString(),
      });

      // 설문의 몸무게를 변화 기록의 첫 점으로도 남긴다. 실패해도 가입을 막을
      // 일은 아니다 — 프로필에는 이미 저장됐고, 기록은 분석 탭에서 다시 남길 수 있다.
      if (answers.weight_kg !== undefined) {
        await logBodyWeight(answers.weight_kg, answers.height_cm).catch(() => {});
      }

      setUser(updated);
      router.replace('/workout');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, router, setUser, user.id]);

  const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const isConfirmStep = stepIndex >= lastStepIndex;

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
      accessibilityLabel={`전체 ${lastStepIndex + 1}단계 중 ${Math.min(stepIndex, lastStepIndex) + 1}번째`}>
      {[...questions, null].map((item, index) => (
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
            {questions.map((question, index) => (
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
                    editingFromSummary.current = true;
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

  const question = questions[stepIndex];
  const multiValues = question.mode === 'multi' ? selectedValues(question, answers) : undefined;
  const isNoneSelected = multiValues?.length === 0;
  const isBodyStep = question.mode === 'body';
  const bodyReady = parseHeightInput(heightText) !== null && parseWeightInput(weightText) !== null;
  // 키보드가 뜨는 문항(키·몸무게, 닉네임)은 버튼을 입력칸 바로 아래(스크롤 안)에
  // 둔다. 화면 아래 고정 푸터는 키보드가 올라오면 같이 밀려 올라와 입력칸을
  // 가리고, 키보드 바로 위에 붙어 누르기도 갑갑하다.
  const usesKeyboard = isBodyStep || question.mode === 'text';

  const prevButton =
    stepIndex > 0 ? (
      <PrimaryButton
        label="이전"
        variant="quiet"
        size="compact"
        onPress={handleBack}
        style={styles.backButton}
      />
    ) : (
      <PrimaryButton
        label="다른 방법으로 로그인"
        variant="quiet"
        size="compact"
        onPress={() => void handleExit()}
        style={styles.backButton}
      />
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {progress}

        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {question.title}
          </Text>
          {question.mode === 'multi' ||
          question.mode === 'body' ||
          question.mode === 'text' ||
          question.mode === 'font' ? (
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              {question.helper}
            </Text>
          ) : null}
        </View>

        {/* 문항 종류가 셋이다: 키·몸무게(숫자 두 칸), 닉네임(글자 한 칸),
            나머지(선택지). 순서대로 좁혀 나간다. */}
        {question.mode === 'font' ? (
          <View style={styles.fontFields}>
            <FontScalePicker value={fontScale} onChange={handlePickFontScale} />

            {/* 낱글자만으로는 실제로 읽을 때 어떤지 알기 어렵다. 앱에서 실제로
                나오는 문장을 그대로 보여 준다. */}
            <View style={styles.fontPreview}>
              <Text style={styles.fontPreviewLabel} maxFontSizeMultiplier={1.2}>
                이렇게 보여요
              </Text>
              <Text style={styles.fontPreviewText} maxFontSizeMultiplier={1.3}>
                다리로 밀기{'\n'}40kg · 3세트 · 12회
              </Text>
            </View>
          </View>
        ) : isBodyStep ? (
          <View style={styles.bodyFields}>
            <TextField
              label="키 (cm)"
              value={heightText}
              onChangeText={(text) => setHeightText(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="165"
              keyboardType="number-pad"
            />
            <TextField
              label="몸무게 (kg)"
              value={weightText}
              onChangeText={(text) => setWeightText(sanitizeWeightText(text))}
              placeholder="62.5"
              keyboardType="decimal-pad"
            />
          </View>
        ) : question.mode === 'text' ? (
          <TextField
            label={question.summaryLabel}
            value={typeof answers.nickname === 'string' ? answers.nickname : ''}
            onChangeText={handleTextChange}
            placeholder={question.placeholder}
            maxLength={question.maxLength}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (isAnswered(question, answers)) handleNext(question);
            }}
          />
        ) : (
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

            {/* 위 두 분기의 else 쪽이라 여기서 question 은 선택지 문항으로 좁혀져 있다. */}
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
        )}

        {usesKeyboard ? (
          <View style={styles.inlineFooter}>
            <PrimaryButton
              label="다음"
              onPress={() => (isBodyStep ? handleBodyNext() : handleNext(question))}
              disabled={isBodyStep ? !bodyReady : !isAnswered(question, answers)}
            />
            {prevButton}
          </View>
        ) : null}
      </ScrollView>

      {usesKeyboard ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {question.mode === 'multi' || question.mode === 'single' ? (
            <PrimaryButton
              label="다음"
              onPress={() => handleNext(question)}
              disabled={!isAnswered(question, answers)}
            />
          ) : null}
          {/* 글자 크기는 아무것도 안 누르셔도 넘어갈 수 있다. 지금 화면이 이미
              '중간'으로 그려져 있으니, 그대로 두는 것도 하나의 답이다. */}
          {question.mode === 'font' ? (
            <PrimaryButton label="다음" onPress={handleFontNext} />
          ) : null}
          {prevButton}
        </View>
      )}
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
  bodyFields: {
    gap: Spacing.lg,
  },
  fontFields: {
    gap: Spacing.lg,
  },
  fontPreview: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  fontPreviewLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  fontPreviewText: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    lineHeight: FontSize.subtitle * 1.5,
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
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
  inlineFooter: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
  },
});
