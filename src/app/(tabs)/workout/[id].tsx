import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import {
  FIRST_TIME_RULE,
  formatVolume,
  HOW_TO_STEPS,
  WEIGHT_RULE,
  weightHint,
} from '@/features/routine/guidance';
import { RoutineError, completeRoutine } from '@/features/routine/api';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';
import { formatRest, useWorkoutSession } from '@/features/routine/use-workout-session';
import type { RoutineItem } from '@/lib/database.types';

/** 핀 칸은 두 자리를 넘지 않는다. 세 자리를 받으면 kg 과 헷갈린다. */
const PIN_MAX_DIGITS = 2;

/**
 * 기구 하나를 처음부터 끝까지 끌고 가는 화면.
 *
 * 목록에서 운동을 누르거나, 기구 앞 QR 을 찍으면 여기로 온다.
 * 설명만 띄우고 마는 게 아니라 세트를 하나씩 세어 주고 쉬는 시간까지 잰다.
 *
 * user 존재/온보딩 여부는 (tabs)/_layout.tsx 가 이미 확인했다. 개인 폰이라
 * 5분 idle 로그아웃(touch()) 개념도 없다 — 예전 키오스크 버전에 있던 그
 * 호출들은 여기선 전부 뺐다.
 */
export default function RoutineDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  // 목록과 같은 호출이다. 서버에서 이미 만든 루틴은 다시 만들지 않고 그대로 준다.
  const { result, isLoading, errorMessage, retry } = useDailyRoutine(user!.id);
  const item = result?.routines.find((routine) => routine.routine_id === id) ?? null;

  const goBack = useCallback(() => {
    // QR 로 이 화면에 바로 들어오면 돌아갈 데가 없다. 그때는 목록으로 보낸다.
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (errorMessage || !item) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {errorMessage ?? '오늘 목록에 없는 운동입니다.'}
            </Text>
            {errorMessage ? (
              <PrimaryButton label="다시 시도" variant="secondary" onPress={retry} />
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <PrimaryButton label="목록으로" variant="secondary" onPress={goBack} />
        </View>
      </View>
    );
  }

  return <WorkoutSession item={item} onExit={goBack} />;
}

function WorkoutSession({ item, onExit }: { item: RoutineItem; onExit: () => void }) {
  const insets = useSafeAreaInsets();

  // 세트 수가 안 정해진 기구는 한 세트짜리로 본다.
  const totalSets = item.target_sets ?? 1;
  const session = useWorkoutSession(totalSets);

  const [pin, setPin] = useState('');
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleDigit = useCallback((digit: string) => {
    setPin((current) => (current.length >= PIN_MAX_DIGITS ? current : `${current}${digit}`));
  }, []);

  const openVideo = useCallback(() => {
    void Linking.openURL(item.video_url).catch(() => {});
  }, [item.video_url]);

  const finishAndSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // "핀"은 기구마다 실제 kg 이 다른 상대값이라 정확한 kg 은 아니지만,
      // 지금 저장할 수 있는 건 이것뿐이다 — 없는 것보다는 다음 방문 때 참고할
      // 시작점이 있는 편이 낫다. 실제 횟수를 따로 받지 않으므로 처방 횟수를
      // 그대로 "실제 수행"으로 기록한다(완료 버튼을 눌렀다는 건 다 했다는 뜻).
      const pinValue = pin === '' ? null : Number(pin);
      const { pointsAwarded: awarded } = await completeRoutine(item.routine_id, pinValue, item.target_reps);
      setPointsAwarded(awarded);
    } catch (error) {
      setSaveError(error instanceof RoutineError ? error.message : '기록을 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
      setIsFinished(true);
    }
  }, [item, pin]);

  const body = isFinished ? (
    <FinishedView item={item} pin={pin} pointsAwarded={pointsAwarded} saveError={saveError} />
  ) : session.phase === 'ready' ? (
    <ReadyView item={item} />
  ) : session.phase === 'working' ? (
    <WorkingView item={item} currentSet={session.currentSet} totalSets={totalSets} />
  ) : session.phase === 'resting' ? (
    <RestingView nextSet={session.currentSet} totalSets={totalSets} seconds={session.restRemaining} />
  ) : (
    <LoggingView item={item} pin={pin} />
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {body}
      </ScrollView>

      {session.phase === 'logging' && !isFinished ? (
        <View style={styles.keypadWrap}>
          <Keypad
            onDigit={handleDigit}
            onClear={() => setPin('')}
            onBackspace={() => setPin((current) => current.slice(0, -1))}
          />
        </View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {isFinished ? (
          <PrimaryButton label="목록으로" onPress={onExit} />
        ) : session.phase === 'ready' ? (
          <>
            <PrimaryButton label="운동 시작" onPress={() => session.start()} />
            {item.video_url ? (
              <PrimaryButton label="영상으로 보기" variant="secondary" onPress={openVideo} />
            ) : null}
            <PrimaryButton label="목록으로" variant="quiet" size="compact" onPress={onExit} />
          </>
        ) : session.phase === 'working' ? (
          <PrimaryButton
            label={`${session.currentSet}세트 완료`}
            onPress={() => session.finishSet()}
          />
        ) : session.phase === 'resting' ? (
          <PrimaryButton label="바로 다음 세트" variant="secondary" onPress={() => session.skipRest()} />
        ) : (
          <PrimaryButton
            label="기록하고 마치기"
            disabled={pin.length === 0}
            loading={isSaving}
            onPress={() => void finishAndSave()}
          />
        )}
      </View>
    </View>
  );
}

/** 시작 전: 무엇을 어떻게 하는 운동인지 */
function ReadyView({ item }: { item: RoutineItem }) {
  const volume = formatVolume(item);

  return (
    <>
      <View style={styles.headings}>
        {item.target_muscle ? (
          <Text style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
            {item.target_muscle} 운동
          </Text>
        ) : null}
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {item.name}
        </Text>
      </View>

      {volume ? (
        <View style={styles.hero}>
          <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
            오늘 할 양
          </Text>
          <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
            {volume}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
          하는 방법
        </Text>
        <View style={styles.steps}>
          {HOW_TO_STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber} maxFontSizeMultiplier={1.2}>
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.stepText} maxFontSizeMultiplier={1.3}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <WeightGuide item={item} />

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        아프거나 어지러우면 바로 멈추고 관리사무소에 알려주세요.
      </Text>
    </>
  );
}

/** 세트 진행 중: 지금 몇 세트인지만 크게 */
function WorkingView({
  item,
  currentSet,
  totalSets,
}: {
  item: RoutineItem;
  currentSet: number;
  totalSets: number;
}) {
  return (
    <>
      <Text style={styles.name} maxFontSizeMultiplier={1.2}>
        {item.name}
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
          {totalSets}세트 중
        </Text>
        <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
          {currentSet}세트
        </Text>
        {item.target_reps !== null ? (
          <Text style={styles.heroSub} maxFontSizeMultiplier={1.2}>
            {item.target_reps}회 하세요
          </Text>
        ) : null}
      </View>

      <SetDots total={totalSets} done={currentSet - 1} />

      <WeightGuide item={item} />
    </>
  );
}

/** 쉬는 시간: 남은 초를 크게 */
function RestingView({
  nextSet,
  totalSets,
  seconds,
}: {
  nextSet: number;
  totalSets: number;
  seconds: number;
}) {
  return (
    <>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        쉬는 시간
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroValue} maxFontSizeMultiplier={1.2} accessibilityLiveRegion="polite">
          {formatRest(seconds)}
        </Text>
        <Text style={styles.heroSub} maxFontSizeMultiplier={1.2}>
          다음은 {nextSet}세트입니다
        </Text>
      </View>

      <SetDots total={totalSets} done={nextSet - 1} />

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        숨이 돌아올 때까지 쉬세요. 다 쉬면 저절로 다음 세트로 넘어갑니다.
      </Text>
    </>
  );
}

/** 마지막: 오늘 꽂은 핀을 남긴다 */
function LoggingView({ item, pin }: { item: RoutineItem; pin: string }) {
  return (
    <>
      <View style={styles.headings}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {item.target_sets ?? 1}세트 모두 끝났습니다
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          오늘 꽂으신 핀이 몇 번째 칸이었나요? 다음에 시작점으로 알려드립니다.
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
          {pin === '' ? '−' : pin}
          <Text style={styles.heroUnit}>칸</Text>
        </Text>
      </View>
    </>
  );
}

/** 다 끝난 뒤 */
function FinishedView({
  item,
  pin,
  pointsAwarded,
  saveError,
}: {
  item: RoutineItem;
  pin: string;
  pointsAwarded: number | null;
  saveError: string | null;
}) {
  return (
    <View style={styles.centeredBlock}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        수고하셨습니다
      </Text>
      <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
        {item.name} {item.target_sets ?? 1}세트를 {pin}칸으로 마치셨습니다.
      </Text>
      {pointsAwarded ? (
        <Text style={styles.pointsEarned} maxFontSizeMultiplier={1.3}>
          +{pointsAwarded}점 적립
        </Text>
      ) : saveError ? (
        <Text style={styles.saveErrorText} maxFontSizeMultiplier={1.3}>
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}

/** 몇 세트 남았는지 점으로. 숫자보다 눈에 먼저 들어온다. */
function SetDots({ total, done }: { total: number; done: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`전체 ${total}세트 중 ${done}세트 완료`}>
      {Array.from({ length: total }, (_, index) => (
        <View key={index} style={[styles.dot, index < done && styles.dotDone]} />
      ))}
    </View>
  );
}

function WeightGuide({ item }: { item: RoutineItem }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
        무게 고르는 법
      </Text>
      <View style={styles.hintBox}>
        <Text style={styles.hintStrong} maxFontSizeMultiplier={1.3}>
          {weightHint(item)}
        </Text>
        <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
          {WEIGHT_RULE}
        </Text>
        <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
          {FIRST_TIME_RULE}
        </Text>
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
    backgroundColor: Colors.background,
  },
  centeredBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
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
  name: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textSecondary,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  pointsEarned: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  saveErrorText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xxl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  heroLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  heroValue: {
    fontSize: FontSize.display,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: FontSize.subtitle,
    color: Colors.textSecondary,
  },
  heroSub: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
  },
  dotDone: {
    backgroundColor: Colors.primary,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  steps: {
    gap: Spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  stepBadge: {
    flexShrink: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
  },
  stepNumber: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  hintBox: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  hintStrong: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  hintText: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  keypadWrap: {
    paddingHorizontal: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  errorBox: {
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
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
});
