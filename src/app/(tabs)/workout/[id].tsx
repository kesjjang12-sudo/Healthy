import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { CheckMark } from '@/components/check-mark';
import { ExercisePhoto } from '@/components/exercise-photo';
import { Keypad } from '@/components/keypad';
import { PrimaryButton } from '@/components/primary-button';
import { WeightSuggestionCard } from '@/components/weight-suggestion-card';
import { GrowthBadge } from '@/components/growth-badge';
import { JourneyCheckpoint, JourneyRing } from '@/components/journey-ring';
import { WittyLoading } from '@/components/witty-loading';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { pickCompletionPraise } from '@/features/content/hooking-copy';
import { pickRestMessage } from '@/features/content/rest-encouragement';
import {
  firstTimeRule,
  formatVolume,
  howToSteps,
  isCardioItem,
  needsWeightLog,
  weightHint,
  weightRule,
  weightUnit,
} from '@/features/routine/guidance';
import { RoutineError, completeRoutine } from '@/features/routine/api';
import { GROWTH_LEVELS, levelUpBetween } from '@/features/growth/levels';
import { COURSE, fetchJourneyMinutes, journeyPoint } from '@/features/routine/journey';
import { placeText, primaryName, secondaryName } from '@/features/routine/labels';
import {
  cancelCardioGoalAlarm,
  scheduleCardioGoalAlarm,
} from '@/features/notifications/cardio-alarm';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';
import {
  elapsedToMinutes,
  formatClock,
  useElapsedSeconds,
  useWorkoutSession,
} from '@/features/routine/use-workout-session';
import type { AgeGroup, RoutineItem } from '@/lib/database.types';

/** 핀 칸은 두 자리를 넘지 않는다. 세 자리를 받으면 kg 과 헷갈린다. */
const PIN_MAX_DIGITS = 2;

/** 유산소 시간은 세 자리까지. 아래 범위와 함께 complete_routine 이 다시 확인한다. */
const MINUTES_MAX_DIGITS = 3;
const MINUTES_MIN = 1;
const MINUTES_MAX = 240;

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

  // 마치고 나가는 길은 그냥 뒤로가기가 아니다. 목록이 방금 무엇을 마쳤는지
  // 알아야 "○○ 완료! +N점"을 띄울 수 있다.
  //
  // replace 를 쓰면 안 된다. 이 화면은 운동 탭 스택 안에 있어서, replace 는
  // 목록으로 "가기만" 하고 상세 화면을 스택에서 걷어내지 않는다. 운동을
  // 하나 마칠 때마다 화면이 하나씩 쌓이고, 쌓인 화면들은 사라진 게 아니라
  // 높이 0 으로 살아서 각자 타이머(쉬는 시간 카운트다운)와 조회 훅을 계속
  // 돌린다. 세 번만 반복해도 실제로 유령 화면 24개가 남는 것을 확인했고,
  // 폰에서는 그게 쌓여 화면이 멈춘 것처럼 느려진다.
  //
  // dismissTo 는 목록까지 스택을 실제로 걷어내면서 파라미터도 넘겨준다.
  const goBackCompleted = useCallback(
    (name: string, points: number | null) => {
      const href = {
        pathname: '/workout' as const,
        params: { completed: name, ...(points ? { points: String(points) } : {}) },
      };
      if (router.canDismiss()) router.dismissTo(href);
      else router.replace(href);
    },
    [router],
  );

  if (isLoading) {
    return <WittyLoading />;
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
              {errorMessage ?? '오늘 목록에 없는 운동이에요.'}
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

  return (
    <WorkoutSession
      item={item}
      onExit={goBack}
      onExitCompleted={goBackCompleted}
      onWeightChanged={retry}
      onShowCard={() => router.push('/workout/summary')}
    />
  );
}

function WorkoutSession({
  item,
  onExit,
  onExitCompleted,
  onWeightChanged,
  onShowCard,
}: {
  item: RoutineItem;
  onExit: () => void;
  /** 마치고 나갈 때. 목록이 완료 안내를 띄울 수 있게 무엇을 마쳤는지 넘긴다. */
  onExitCompleted: (name: string, points: number | null) => void;
  /** 무게를 바꾸면 처방값이 달라지므로 루틴을 다시 불러와야 한다. */
  onWeightChanged: () => void;
  /** 방금 끝낸 직후 "오늘 운동 카드"로 보내는 길. */
  onShowCard: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthSession();
  const isCardio = isCardioItem(item);

  // 세트 수가 안 정해진 기구는 한 세트짜리로 본다. 유산소도 항상 1세트다
  // (쉬지 않고 이어서 하는 시간이라 "세트"라는 단위 자체가 없다).
  const totalSets = item.target_sets ?? 1;
  const session = useWorkoutSession(totalSets);

  // 유산소는 시작~완료 사이를 앱이 잰다. 그 값을 기록 화면에 미리 채워 두고,
  // 실제와 다르면 고칠 수 있게 한다.
  const elapsedSeconds = useElapsedSeconds(isCardio && session.phase === 'working');
  const measuredMinutes = elapsedToMinutes(elapsedSeconds);

  // 국토 종주: 지난 세션까지의 누적 유산소 분. 못 받아도 0에서 시작할 뿐
  // 타이머·기록은 그대로 돌아간다.
  const [journeyBase, setJourneyBase] = useState(0);
  useEffect(() => {
    if (!isCardio) return;
    let cancelled = false;
    void fetchJourneyMinutes().then((minutes) => {
      if (!cancelled) setJourneyBase(minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [isCardio]);

  // 목표 시간 알림 예약 id. 화면을 나가면(언마운트) 반드시 취소한다 —
  // 하다 만 운동의 알림이 나중에 혼자 울리면 안 된다.
  const alarmId = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      void cancelCardioGoalAlarm(alarmId.current).catch(() => {});
    };
  }, []);

  const startCardio = useCallback(() => {
    // 운동 시작이 먼저다. 알림은 부수 기능이라, 그쪽에서 무슨 일이 나도
    // 시작을 막지 못하게 순서와 예외 처리를 분리해 둔다.
    session.start();
    const target = item.target_duration_minutes;
    if (!isCardio || target === null) return;

    try {
      // 목표를 채우는 순간 도착해 있을 지점을 미리 계산해 알림 문구에 싣는다.
      const arrival = journeyPoint(journeyBase + target).current.name;
      void scheduleCardioGoalAlarm(target, item.name_ko ?? item.name, arrival)
        .then((id) => {
          alarmId.current = id;
        })
        // catch 를 안 달면 거부된 약속이 처리되지 않은 예외로 올라간다.
        .catch(() => {});
    } catch {
      // 알림을 못 걸어도 운동은 그대로 진행한다.
    }
  }, [session, isCardio, item, journeyBase]);

  const finishCardio = useCallback(() => {
    void cancelCardioGoalAlarm(alarmId.current).catch(() => {});
    alarmId.current = null;
    // 알림 취소가 실패해도 마치기는 진행돼야 한다.
    session.finishSet();
  }, [session]);

  const [pin, setPin] = useState('');
  /** 사람이 직접 고친 분(分). null 이면 아직 안 고쳐서 잰 시간을 그대로 쓴다는 뜻. */
  const [typedMinutes, setTypedMinutes] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);
  /** 이번 완료로 오른 명예 호칭. 안 올랐으면 null. */
  const [leveledUpTo, setLeveledUpTo] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const minutesText = typedMinutes ?? String(measuredMinutes);
  const minutesValue = Number(minutesText);
  const isMinutesValid =
    minutesText !== '' && minutesValue >= MINUTES_MIN && minutesValue <= MINUTES_MAX;

  const handleDigit = useCallback(
    (digit: string) => {
      if (isCardio) {
        // 첫 숫자를 누르면 잰 시간을 지우고 새로 받는다. 뒤에 붙이면
        // 8분이 "81분"이 되어 버린다.
        setTypedMinutes((current) => {
          const base = current ?? '';
          return base.length >= MINUTES_MAX_DIGITS ? base : `${base}${digit}`;
        });
        return;
      }

      setPin((current) => (current.length >= PIN_MAX_DIGITS ? current : `${current}${digit}`));
    },
    [isCardio],
  );

  const handleClear = useCallback(() => {
    if (isCardio) setTypedMinutes('');
    else setPin('');
  }, [isCardio]);

  const handleBackspace = useCallback(() => {
    if (isCardio) setTypedMinutes((current) => (current ?? String(measuredMinutes)).slice(0, -1));
    else setPin((current) => current.slice(0, -1));
  }, [isCardio, measuredMinutes]);

  const openVideo = useCallback(() => {
    void Linking.openURL(item.video_url).catch(() => {});
  }, [item.video_url]);

  const finishAndSave = useCallback(async (felt: 'ok' | 'hard' = 'ok') => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // 유산소는 실제로 움직인 시간을, 근력은 꽂은 핀 칸을 남긴다.
      // "핀"은 기구마다 실제 kg 이 다른 상대값이라 정확한 kg 은 아니지만,
      // 지금 저장할 수 있는 건 이것뿐이다 — 없는 것보다는 다음 방문 때 참고할
      // 시작점이 있는 편이 낫다.
      //
      // 횟수는 숫자로 안 묻는다. 대신 마치는 버튼이 [할 만했어요 / 힘들었어요]
      // 둘이라, 누른 버튼이 그대로 답이 된다(추가 탭 0). "힘들었어요"는 목표를
      // 다 못 채웠다는 뜻으로 목표의 절반을 적는다 — 서버의 "내려볼까요?" 기준
      // (70% 미만)에 확실히 걸리는 값이면 되고, 정확한 횟수는 여기서 중요하지
      // 않다. 예전엔 무조건 목표를 다 채운 것으로 보내서, 힘들어한 기록이
      // 서버에 한 번도 남지 않아 내려보자는 제안이 영영 안 떴다.
      const targetReps = item.target_reps ?? null;
      const actualReps =
        targetReps === null ? null : felt === 'hard' ? Math.floor(targetReps / 2) : targetReps;
      const { pointsAwarded: awarded } = await completeRoutine(
        item.routine_id,
        isCardio
          ? { actualDurationMinutes: minutesValue }
          : { actualWeightKg: pin === '' ? null : Number(pin), actualReps },
      );
      setPointsAwarded(awarded);

      // 받은 점수를 그 자리에서 합산해 둔다. 서버를 다시 부르면 그만큼
      // 늦어지고, 그 사이 목록으로 나가면 포인트가 안 오른 것처럼 보인다.
      if (awarded && user) {
        const before = user.total_points ?? 0;
        setUser({ ...user, total_points: before + awarded });
        // 이 점수로 호칭이 올랐으면 완료 화면에서 승급을 축하한다 —
        // 방금 끝낸 직후가 가장 뿌듯한 순간이다.
        setLeveledUpTo(levelUpBetween(before, before + awarded)?.name ?? null);
      }
    } catch (error) {
      setSaveError(error instanceof RoutineError ? error.message : '기록을 저장하지 못했어요.');
    } finally {
      setIsSaving(false);
      setIsFinished(true);
    }
  }, [item, isCardio, minutesValue, pin, user, setUser]);

  const body = isFinished ? (
    <FinishedView
      item={item}
      pin={pin}
      minutes={minutesValue}
      pointsAwarded={pointsAwarded}
      leveledUpTo={leveledUpTo}
      saveError={saveError}
    />
  ) : session.phase === 'ready' ? (
    <ReadyView item={item} onWeightChanged={onWeightChanged} />
  ) : session.phase === 'working' ? (
    <WorkingView
      item={item}
      currentSet={session.currentSet}
      totalSets={totalSets}
      elapsedSeconds={elapsedSeconds}
      journeyBase={journeyBase}
    />
  ) : session.phase === 'resting' ? (
    <RestingView
      nextSet={session.currentSet}
      totalSets={totalSets}
      seconds={session.restRemaining}
      ageGroup={user?.profile_data?.age_group}
      routineId={item.routine_id}
    />
  ) : (
    <LoggingView
      item={item}
      pin={pin}
      minutesText={minutesText}
      measuredMinutes={measuredMinutes}
      isMinutesValid={isMinutesValid}
    />
  );

  // 핀을 꽂을 수 없는 운동(유산소·맨몸)은 물어볼 게 없다 — 키패드를 안 띄우고
  // 바로 "기록하고 마치기"를 누를 수 있게 한다. 유산소만 예외로 두면 맨몸운동
  // 차례에서 빈 키패드를 앞에 두고 버튼이 안 눌려 운동을 마칠 수 없다.
  //
  // 유산소는 대신 실제로 움직인 시간(분)을 받는다 — 그쪽 키패드는 LoggingView 가
  // 자기 안에서 그린다.
  const logsWeight = needsWeightLog(item);
  const showKeypad = session.phase === 'logging' && !isFinished && logsWeight;

  // 뒤로가기는 시작 전에만 보인다 — 세트 도중 실수로 눌러 진행을 날리는 것을
  // 막는다(예전 "목록으로" 버튼을 시작 전에만 두던 것과 같은 이유).
  const showBack = session.phase === 'ready' && !isFinished;

  return (
    <View style={styles.screen}>
      {showBack ? (
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <BackButton onPress={onExit} />
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: showBack ? Spacing.md : insets.top + Spacing.xl },
        ]}>
        {body}
      </ScrollView>

      {showKeypad ? (
        <View style={styles.keypadWrap}>
          <Keypad onDigit={handleDigit} onClear={handleClear} onBackspace={handleBackspace} />
        </View>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {isFinished ? (
          <>
            {/* 방금 끝낸 직후가 가장 뿌듯한 순간이다. 카드를 여기서 바로 연다. */}
            <PrimaryButton label="오늘 운동 카드 보기" onPress={onShowCard} />
            <PrimaryButton
              label="목록으로"
              variant="secondary"
              onPress={() =>
                saveError
                  ? onExit()
                  : onExitCompleted(item.name_ko ?? item.name, pointsAwarded)
              }
            />
          </>
        ) : session.phase === 'ready' ? (
          item.video_url ? (
            <View style={styles.footerRow}>
              <PrimaryButton
                label="영상으로 보기"
                variant="secondary"
                onPress={openVideo}
                style={styles.footerRowButton}
              />
              <PrimaryButton
                label={isCardio ? '시작' : '운동 시작'}
                onPress={() => (isCardio ? startCardio() : session.start())}
                style={styles.footerRowButton}
              />
            </View>
          ) : (
            <PrimaryButton
              label={isCardio ? '시작' : '운동 시작'}
              onPress={() => (isCardio ? startCardio() : session.start())}
            />
          )
        ) : session.phase === 'working' ? (
          <PrimaryButton
            label={isCardio ? '다 했어요' : `${session.currentSet}세트 완료`}
            onPress={() => (isCardio ? finishCardio() : session.finishSet())}
          />
        ) : session.phase === 'resting' ? (
          <PrimaryButton label="바로 다음 세트" variant="secondary" onPress={() => session.skipRest()} />
        ) : isCardio || !logsWeight ? (
          <PrimaryButton
            label="기록하고 마치기"
            disabled={isCardio && !isMinutesValid}
            loading={isSaving}
            onPress={() => void finishAndSave()}
          />
        ) : (
          <>
            {/* 마치는 버튼이 곧 오늘 소감이다. 어느 쪽을 눌러도 기록되고,
                "힘들었어요"가 쌓이면 다음에 무게를 내려보자고 먼저 말을 건다. */}
            <PrimaryButton
              label="할 만했어요"
              disabled={pin.length === 0}
              loading={isSaving}
              onPress={() => void finishAndSave('ok')}
            />
            <PrimaryButton
              label="힘들었어요"
              variant="secondary"
              disabled={pin.length === 0}
              loading={isSaving}
              onPress={() => void finishAndSave('hard')}
            />
          </>
        )}
      </View>
    </View>
  );
}

/** 시작 전: 무엇을 어떻게 하는 운동인지 */
function ReadyView({ item, onWeightChanged }: { item: RoutineItem; onWeightChanged: () => void }) {
  const volume = formatVolume(item);
  const equipName = secondaryName(item);
  const place = placeText(item);

  return (
    <>
      {/* 시작 자세 사진을 맨 위에 둔다. 이름과 설명을 읽기 전에 "아, 저
          기구구나"가 먼저 와야 헬스장에서 찾을 수 있다. */}
      <ExercisePhoto uri={item.image_url} name={item.name_ko ?? item.name} />

      <View style={styles.headings}>
        {item.target_muscle ? (
          <Text style={styles.eyebrow} maxFontSizeMultiplier={1.3}>
            {item.target_muscle} 운동
          </Text>
        ) : null}
        {/* 목록에서 크게 읽은 그 이름이 그대로 제목이 된다. 기구 이름은 그
            아래 한 줄 — 기구 앞에서 이름표와 맞춰볼 때만 필요하다. */}
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {primaryName(item)}
        </Text>
        {equipName ? (
          <Text style={styles.equipName} maxFontSizeMultiplier={1.3}>
            기구 이름 {equipName}
          </Text>
        ) : null}
        {/* 기구 이름만으로는 뭘 하는 기구인지 안 와닿는 분이 많다. 설명이
            채워져 있으면 그대로 보여준다 — 없으면 억지로 지어내지 않는다. */}
        {item.description ? (
          <Text style={styles.description} maxFontSizeMultiplier={1.3}>
            {item.description}
          </Text>
        ) : null}
      </View>

      {/* 어디로 가야 하는지는 시작 버튼을 누르기 전에 답이 나와야 한다.
          기구에 붙은 번호표와 같은 숫자를 그대로 크게 적는다. */}
      {place ? (
        <View style={styles.placeBox}>
          <Text style={styles.placeLabel} maxFontSizeMultiplier={1.2}>
            {item.equip_id === null ? '이 운동은' : '기구 위치'}
          </Text>
          <Text style={styles.placeValue} maxFontSizeMultiplier={1.2}>
            {place}
          </Text>
        </View>
      ) : null}

      {/* 지난 기록에 근거한 무게 제안. 시작 버튼을 누르기 전에 보여야 오늘
          것에 반영된다 — 끝난 뒤에 뜨면 다음에나 쓸 얘기가 된다. */}
      {/* 맨몸운동은 조절할 기구가 없다(equip_id 가 null) — 무게 제안도 뜻이 없다. */}
      {item.weight_suggestion && item.equip_id ? (
        <WeightSuggestionCard
          equipId={item.equip_id}
          suggestion={item.weight_suggestion}
          unit={weightUnit(item)}
          onApplied={onWeightChanged}
        />
      ) : null}

      {/* "이 부위는 굳이 안 해도 되는데" 하고 건너뛰거나, 잘못 알고 있는 정보
          때문에 피하는 운동이 있다. 하는 방법보다 먼저 이유를 보여준다 —
          납득이 안 되면 방법을 읽을 이유도 없다. */}
      {item.why_it_matters ? (
        <View style={styles.whyBox}>
          <Text style={styles.whyTitle} maxFontSizeMultiplier={1.2}>
            왜 해야 하나요?
          </Text>
          <Text style={styles.whyText} maxFontSizeMultiplier={1.3}>
            {item.why_it_matters}
          </Text>
        </View>
      ) : null}

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
          {howToSteps(item).map((step: string, index: number) => (
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

      {/* 그 운동에서 다치는 대표 경로 하나. 순서를 다 읽지 않는 분도 이건 본다. */}
      {item.form_caution ? (
        <View style={styles.cautionBox}>
          <Text style={styles.cautionTitle} maxFontSizeMultiplier={1.2}>
            이것만은 지켜주세요
          </Text>
          <Text style={styles.cautionText} maxFontSizeMultiplier={1.3}>
            {item.form_caution}
          </Text>
        </View>
      ) : null}

      {/* 무게가 없는 운동(유산소·맨몸)에는 "한 칸 올리세요" 안내가 맞지 않는다.
          유산소는 "하는 방법"에 속도 조절 안내가 이미 들어 있다. */}
      {needsWeightLog(item) ? <WeightGuide item={item} /> : null}

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        아프거나 어지러우면 바로 멈추고 관리사무소에 알려주세요.
      </Text>
    </>
  );
}

/** 세트 진행 중: 지금 몇 세트인지만 크게. 유산소는 세트 대신 흐른 시간을 크게 */
function WorkingView({
  item,
  currentSet,
  totalSets,
  elapsedSeconds,
  journeyBase,
}: {
  item: RoutineItem;
  currentSet: number;
  totalSets: number;
  elapsedSeconds: number;
  /** 지난 세션까지의 누적 유산소 분. 국토 종주 위치 계산에 쓴다. */
  journeyBase: number;
}) {
  if (isCardioItem(item)) {
    const target = item.target_duration_minutes;
    const reachedTarget = target !== null && elapsedSeconds >= target * 60;
    // 국토 종주: 지난 세션 누적 + 지금 흐르는 시간으로 코스 위 위치를 구한다.
    const point = journeyPoint(journeyBase + elapsedSeconds / 60);

    return (
      <>
        <Text style={styles.name} maxFontSizeMultiplier={1.2}>
          {primaryName(item)}
        </Text>
        <Text style={styles.journeyCourse} maxFontSizeMultiplier={1.2}>
          {COURSE.name}
          {point.round > 1 ? ` · ${point.round}바퀴째` : ''}
        </Text>

        {/* 목표를 채웠는지 알려면 화면에 시계가 보여야 한다. 트레드밀 계기판을
            대신 읽어 주는 셈인데, 숫자만 보며 버티는 20분은 길어서 링과 여정으로
            같은 시간을 이야기로 보여준다. */}
        {target !== null ? (
          <>
            <JourneyRing
              elapsedSeconds={elapsedSeconds}
              targetMinutes={target}
              journeyKm={point.km}
              totalKm={point.totalKm}>
              <Text style={styles.journeyLabel} maxFontSizeMultiplier={1.2}>
                진행 시간
              </Text>
              <Text
                style={styles.journeyClock}
                maxFontSizeMultiplier={1.2}
                // 1초마다 바뀌는 값이라 소리로 계속 읽어 주면 오히려 방해가 된다.
                accessibilityLiveRegion="none">
                {formatClock(elapsedSeconds)}
              </Text>
              <Text style={styles.journeyGoal} maxFontSizeMultiplier={1.2}>
                {reachedTarget ? `목표 ${target}분 완주!` : `/ ${formatClock(target * 60)}`}
              </Text>
              <Text style={styles.journeyKm} maxFontSizeMultiplier={1.2}>
                {point.km}km / {point.totalKm}km 지점
              </Text>
            </JourneyRing>

            <JourneyCheckpoint
              place={point.current.name}
              nextName={point.next.name}
              nextKm={point.nextKm}
            />
          </>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
              지금까지
            </Text>
            <Text style={styles.heroValue} maxFontSizeMultiplier={1.2} accessibilityLiveRegion="none">
              {formatClock(elapsedSeconds)}
            </Text>
          </View>
        )}

        <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
          다 하셨으면 아래 버튼을 눌러주세요. 더 하셔도 괜찮고, 힘들면 먼저 멈추셔도 돼요.
        </Text>
      </>
    );
  }

  return (
    <>
      <Text style={styles.name} maxFontSizeMultiplier={1.2}>
        {primaryName(item)}
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
  ageGroup,
  routineId,
}: {
  nextSet: number;
  totalSets: number;
  seconds: number;
  ageGroup: AgeGroup | undefined;
  routineId: string;
}) {
  // 운동 + 세트 번호로 고른다. 세트 번호만 쓰면 보통 2~3 뿐이라 문구를 아무리
  // 넣어도 두세 개만 돌아간다. 남은 초는 넣지 않는다 — 1초마다 바뀌면 읽다가
  // 놓치고 화면만 산만해진다.
  const encouragement = useMemo(
    () => pickRestMessage(ageGroup, routineId, nextSet),
    [ageGroup, routineId, nextSet],
  );

  return (
    <>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        쉬는 시간
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroValue} maxFontSizeMultiplier={1.2} accessibilityLiveRegion="polite">
          {formatClock(seconds)}
        </Text>
        <Text style={styles.heroSub} maxFontSizeMultiplier={1.2}>
          다음은 {nextSet}세트예요
        </Text>
      </View>

      {/* 쉬는 시간은 하루 중 화면을 가만히 보고 있는 유일한 구간이다. 여기서
          말을 걸어야 읽힌다 — 운동 중에는 읽을 여유가 없고, 끝난 뒤에는 이미
          마음이 나가 있다. */}
      <View style={styles.encourageBox}>
        <Text style={styles.encourageText} maxFontSizeMultiplier={1.3}>
          {encouragement}
        </Text>
      </View>

      <SetDots total={totalSets} done={nextSet - 1} />

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        숨이 돌아올 때까지 쉬세요. 다 쉬면 저절로 다음 세트로 넘어가요.
      </Text>
    </>
  );
}

/** 마지막: 근력은 오늘 꽂은 핀을, 유산소는 실제로 움직인 시간을 남긴다 */
function LoggingView({
  item,
  pin,
  minutesText,
  measuredMinutes,
  isMinutesValid,
}: {
  item: RoutineItem;
  pin: string;
  minutesText: string;
  measuredMinutes: number;
  isMinutesValid: boolean;
}) {
  if (isCardioItem(item)) {
    const edited = minutesText !== String(measuredMinutes);

    return (
      <>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            수고하셨어요
          </Text>
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            앱이 잰 시간을 적어 뒀어요. 실제와 다르면 아래 숫자판으로 고쳐 주세요.
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
            {minutesText === '' ? '−' : minutesText}
            <Text style={styles.heroUnit}>분</Text>
          </Text>
          {edited ? (
            <Text style={styles.heroSub} maxFontSizeMultiplier={1.2}>
              앱이 잰 시간은 {measuredMinutes}분이에요
            </Text>
          ) : null}
        </View>

        {/* 세 자리를 눌러 240분을 넘겼거나 다 지운 경우. 버튼도 함께 잠긴다. */}
        {isMinutesValid ? null : (
          <Text
            style={styles.saveErrorText}
            maxFontSizeMultiplier={1.3}
            accessibilityLiveRegion="polite">
            {MINUTES_MIN}분에서 {MINUTES_MAX}분 사이로 적어 주세요.
          </Text>
        )}
      </>
    );
  }

  // 맨몸운동은 꽂을 핀이 없다. 없는 걸 물으면 대답을 못 해 마지막 버튼이
  // 안 눌린다 — 여기서 갈라 주는 게 그 화면의 출구다.
  if (!needsWeightLog(item)) {
    return (
      <View style={styles.headings}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {`${item.target_sets ?? 1}세트 모두 끝났어요`}
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          아래 버튼을 누르면 오늘 기록이 저장돼요.
        </Text>
      </View>
    );
  }

  // 덤벨·스미스머신은 꽂을 핀이 없다. 손에 든 무게(kg)를 그대로 묻는다.
  const isKg = weightUnit(item) === 'kg';

  return (
    <>
      <View style={styles.headings}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {item.target_sets ?? 1}세트 모두 끝났어요
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          {isKg
            ? '오늘 드신 무게가 몇 kg 이었나요? 다음에 시작점으로 알려드려요. 적으셨으면 아래에서 오늘 어떠셨는지 눌러 주세요 — 그걸로 마치기가 돼요.'
            : '오늘 꽂으신 핀이 몇 번째 칸이었나요? 다음에 시작점으로 알려드려요. 적으셨으면 아래에서 오늘 어떠셨는지 눌러 주세요 — 그걸로 마치기가 돼요.'}
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
          {pin === '' ? '−' : pin}
          <Text style={styles.heroUnit}>{isKg ? 'kg' : '칸'}</Text>
        </Text>
      </View>
    </>
  );
}

/** 다 끝난 뒤 */
function FinishedView({
  item,
  pin,
  minutes,
  pointsAwarded,
  leveledUpTo,
  saveError,
}: {
  item: RoutineItem;
  pin: string;
  minutes: number;
  pointsAwarded: number | null;
  /** 이번 점수로 오른 명예 호칭. 안 올랐으면 null. */
  leveledUpTo: string | null;
  saveError: string | null;
}) {
  // 화면이 다시 그려질 때마다 문구가 바뀌면 읽던 문장이 사라진다.
  const praise = useMemo(() => pickCompletionPraise(), []);

  return (
    <View style={styles.centeredBlock}>
      {/* 저장에 실패했으면 축하부터 하면 안 된다 — 기록이 안 남았다는 사실이
          먼저다. 성공했을 때만 큰 체크 표시를 띄운다. */}
      {saveError ? null : (
        <View style={styles.doneMark} accessibilityLabel="완료">
          <CheckMark size={56} thickness={5} />
        </View>
      )}

      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        {saveError ? '기록하지 못했어요' : '수고하셨어요'}
      </Text>
      <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
        {isCardioItem(item)
          ? // 처방 시간이 아니라 실제로 움직인 시간을 되짚어 준다.
            `${primaryName(item)} ${minutes}분을 마치셨어요.`
          : needsWeightLog(item) && pin !== ''
            ? `${primaryName(item)} ${item.target_sets ?? 1}세트를 ${pin}${weightUnit(item) === 'kg' ? 'kg' : '칸'}으로 마치셨어요.`
            : `${primaryName(item)} ${item.target_sets ?? 1}세트를 마치셨어요.`}
      </Text>
      {/* 저장됐다는 사실만 알리고 끝내면 그냥 절차가 된다. 방금 한 일을
          알아봐 주는 한마디가 다음에 한 번 더 누르게 만든다. */}
      {saveError ? null : (
        <Text style={styles.praise} maxFontSizeMultiplier={1.3}>
          {praise}
        </Text>
      )}

      {pointsAwarded ? (
        <View style={styles.pointsPill}>
          <Text style={styles.pointsEarned} maxFontSizeMultiplier={1.3}>
            경험치 +{pointsAwarded}점
          </Text>
        </View>
      ) : saveError ? (
        <Text style={styles.saveErrorText} maxFontSizeMultiplier={1.3}>
          {saveError}
        </Text>
      ) : null}

      {/* 승급. 방금 끝낸 직후가 가장 뿌듯한 순간이라 여기서 알린다. */}
      {leveledUpTo && !saveError ? (
        <View style={styles.levelUpCard} accessibilityLiveRegion="polite">
          <GrowthBadge levelIndex={levelIndexOf(leveledUpTo)} size={52} />
          <Text style={styles.levelUpTitle} maxFontSizeMultiplier={1.2}>
            {leveledUpTo}(으)로 올라섰어요!
          </Text>
          <Text style={styles.levelUpSub} maxFontSizeMultiplier={1.3}>
            꾸준히 나오신 결과예요. 랭킹의 이름 옆 배지도 바뀌었어요.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** 호칭 이름 → 배지 단계. FinishedView 는 이름만 들고 있어서 여기서 찾는다. */
function levelIndexOf(name: string): number {
  return GROWTH_LEVELS.find((level) => level.name === name)?.index ?? 0;
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
          {weightRule(item)}
        </Text>
        <Text style={styles.hintText} maxFontSizeMultiplier={1.3}>
          {firstTimeRule(item)}
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
  equipName: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  placeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  placeLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  placeValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  description: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  encourageBox: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  encourageText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
    textAlign: 'center',
  },
  subName: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  whyBox: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  whyTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  whyText: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.6,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  name: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textSecondary,
  },
  /** 국토 종주: 운동 이름 밑 코스명 한 줄 */
  journeyCourse: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    marginTop: -Spacing.md,
  },
  journeyLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: Colors.textTertiary,
  },
  journeyClock: {
    fontSize: 52,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: Colors.text,
    lineHeight: 56,
  },
  journeyGoal: {
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: Colors.textSecondary,
  },
  journeyKm: {
    marginTop: Spacing.sm,
    fontSize: FontSize.caption + 1,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: Colors.primary,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  doneMark: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
  },
  levelUpCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
    alignSelf: 'stretch',
  },
  levelUpTitle: {
    fontSize: FontSize.headline,
    fontWeight: '800',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primaryPressed,
    textAlign: 'center',
  },
  levelUpSub: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  pointsPill: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryFaint,
  },
  praise: {
    fontSize: FontSize.body,
    fontWeight: '600',
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
    // 시안의 무게 숫자(56px) — 이 화면의 주인공이라 토큰 스케일 밖에서 크게 간다.
    fontSize: 56,
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
  /** FIT ROTEIN 시안의 세트 진행 — 점 대신 가로로 꽉 차는 칸. */
  dots: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    flex: 1,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.grey[100],
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
  cautionBox: {
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerFaint,
  },
  cautionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
  cautionText: {
    fontSize: FontSize.body,
    fontWeight: '600',
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
  header: {
    paddingHorizontal: Spacing.lg,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerRowButton: {
    // 반반 나눠도 라벨이 잘리지 않게 기본 좌우 여백을 줄인다.
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
});
