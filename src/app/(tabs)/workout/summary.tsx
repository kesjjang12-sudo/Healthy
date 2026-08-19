import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { AnalysisError, getWorkoutShareCard } from '@/features/analysis/api';
import { estimateCalories } from '@/features/analysis/calorie';
import { useAuthSession } from '@/features/auth/auth-session';
import type { ShareCardExercise, WorkoutShareCard } from '@/lib/database.types';

/**
 * 오늘 운동 한 장 요약 — "운동 카드".
 *
 * 다 하고 나서 남는 게 없으면 다음에 또 나올 이유도 없다. 오늘 한 걸 숫자로
 * 보여주고 자식들한테 보낼 수 있게 만든다.
 *
 * 이미지로 저장하는 건 아직 안 된다(네이티브 모듈이 필요해 새 빌드를 올려야
 * 한다). 지금은 화면 그대로 캡처하시거나 아래 "자랑하기"로 글을 보낼 수 있다 —
 * Share 는 react-native 에 원래 들어 있어 추가 설치 없이 바로 쓴다.
 */
export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const [card, setCard] = useState<WorkoutShareCard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getWorkoutShareCard(user!.id)
      .then((result) => {
        if (cancelled) return;
        setCard(result);
        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof AnalysisError ? error.message : '잠시 후 다시 시도해 주세요.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router]);

  const share = useCallback(() => {
    if (!card) return;
    void Share.share({ message: shareMessage(card, user!.profile_data?.nickname) }).catch(() => {});
  }, [card, user]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        {errorMessage ? (
          <Text style={styles.helper} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : !card ? (
          // 아직 아무것도 안 한 날. 오류가 아니므로 조용히 안내만 한다.
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            오늘 마친 운동이 아직 없어요.{'\n'}하나만 끝내도 카드가 만들어져요.
          </Text>
        ) : (
          <CardBody card={card} nickname={user!.profile_data?.nickname} />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* 카드가 있으면 [닫기 / 자랑하기]를 좌우로. 세로로 쌓으면 자리를 많이
            먹어 정작 카드가 밀리고, 위쪽 버튼이 정답처럼 보인다. 앱의 다른
            화면과 같은 규칙 — 회색이 왼쪽(보조), 파랑이 오른쪽(주 동작). */}
        {card ? (
          <View style={styles.footerRow}>
            <PrimaryButton
              label="닫기"
              variant="secondary"
              onPress={goBack}
              style={styles.footerRowButton}
            />
            <PrimaryButton label="자랑하기" onPress={share} style={styles.footerRowButton} />
          </View>
        ) : (
          <PrimaryButton label="닫기" onPress={goBack} />
        )}
      </View>
    </View>
  );
}

function CardBody({ card, nickname }: { card: WorkoutShareCard; nickname?: string }) {
  // 근력과 유산소는 소모량 계산이 다르다(유산소는 실제로 움직인 시간을 쓴다).
  // 카드의 exercise_count 에는 유산소도 섞여 있어, 근력 개수는 세트가 남은
  // 종목 수로 어림한다 — 유산소는 세트를 남기지 않는다.
  const calories = estimateCalories({
    strengthCount: card.exercises.filter((e) => e.sets !== null).length,
    strengthSets: card.total_sets,
    cardioMinutes: card.total_minutes_cardio,
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} maxFontSizeMultiplier={1.2}>
          {formatDateLabel(card.date)}, {card.part_of_day} 운동
        </Text>
        <Text style={styles.cardSub} maxFontSizeMultiplier={1.2}>
          {nickname ? `${nickname} 님 · ` : ''}
          {card.day_count > 0 ? `${card.day_count}번째 운동` : '오늘의 운동'}
        </Text>
      </View>

      {/* 오늘 쓴 부위. 몸 그림 대신 글자로 — 시니어에게는 그림보다 빠르다. */}
      {card.muscles.length > 0 ? (
        <View style={styles.muscleRow}>
          {card.muscles.map((muscle) => (
            <View key={muscle} style={styles.muscleChip}>
              <Text style={styles.muscleText} maxFontSizeMultiplier={1.1}>
                {muscle}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat value={`${card.exercise_count}`} unit="가지" label="운동" />
        <Stat value={`${card.total_sets}`} unit="세트" label="합계" />
        {/* 한 종목만 하면 0분이 나온다. 0분이라고 적으면 안 한 것처럼 보인다. */}
        {card.duration_minutes > 0 ? (
          <Stat value={`${card.duration_minutes}`} unit="분" label="걸린 시간" />
        ) : null}
        <Stat value={calories.toLocaleString('ko-KR')} unit="kcal" label="소모(대략)" />
      </View>

      {/* 든 무게 총합은 자랑거리가 되는 숫자다. 맨몸·유산소만 한 날은 0 이라 숨긴다. */}
      {card.total_volume_kg > 0 ? (
        <View style={styles.hero}>
          <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
            오늘 들어 올린 무게
          </Text>
          <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
            {card.total_volume_kg.toLocaleString('ko-KR')}
            <Text style={styles.heroUnit}>kg</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {card.exercises.map((exercise, index) => (
          <View key={`${exercise.name}-${index}`} style={styles.row}>
            <View style={styles.rowTexts}>
              <Text style={styles.rowName} maxFontSizeMultiplier={1.2}>
                {exercise.name_ko ?? exercise.name}
              </Text>
              <Text style={styles.rowSub} maxFontSizeMultiplier={1.2}>
                {exercise.name_ko ? exercise.name : (exercise.target_muscle ?? '')}
              </Text>
            </View>
            <Text style={styles.rowValue} maxFontSizeMultiplier={1.2}>
              {formatDone(exercise)}
            </Text>
          </View>
        ))}
      </View>

      {card.points > 0 ? (
        <Text style={styles.points} maxFontSizeMultiplier={1.2}>
          +{card.points.toLocaleString('ko-KR')}점 적립
        </Text>
      ) : null}
    </View>
  );
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} maxFontSizeMultiplier={1.1}>
        {value}
        <Text style={styles.statUnit}>{unit}</Text>
      </Text>
      <Text style={styles.statLabel} maxFontSizeMultiplier={1.1}>
        {label}
      </Text>
    </View>
  );
}

/** "30kg · 3세트 · 12회", 유산소는 "15분", 맨몸은 "3세트 · 12회" */
function formatDone(exercise: ShareCardExercise): string {
  if (exercise.duration_minutes !== null) return `${exercise.duration_minutes}분`;

  const parts: string[] = [];
  if (exercise.weight_kg !== null) parts.push(`${exercise.weight_kg}kg`);
  if (exercise.sets !== null) parts.push(`${exercise.sets}세트`);
  if (exercise.reps !== null) parts.push(`${exercise.reps}회`);
  return parts.join(' · ');
}

/** "2026-08-14" → "8월 14일" */
function formatDateLabel(key: string): string {
  const [, month, day] = key.split('-').map(Number);
  return `${month}월 ${day}일`;
}

/**
 * 카톡으로 보낼 글. 이미지 캡처는 아직 못 하니 글이 카드 역할을 한다 —
 * 숫자를 앞세워 한눈에 읽히게 쓴다.
 */
function shareMessage(card: WorkoutShareCard, nickname?: string): string {
  const lines: string[] = [];

  lines.push(`💪 ${formatDateLabel(card.date)} ${card.part_of_day} 운동 마쳤어요`);
  if (nickname) lines.push(`${nickname} 님 · ${card.day_count}번째 운동`);
  lines.push('');
  lines.push(`운동 ${card.exercise_count}가지 · ${card.total_sets}세트`);
  if (card.duration_minutes > 0) lines.push(`걸린 시간 ${card.duration_minutes}분`);
  if (card.total_volume_kg > 0) {
    lines.push(`들어 올린 무게 ${card.total_volume_kg.toLocaleString('ko-KR')}kg`);
  }
  lines.push('');
  card.exercises.forEach((exercise) => {
    lines.push(`· ${exercise.name_ko ?? exercise.name}  ${formatDone(exercise)}`);
  });

  return lines.join('\n');
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
  // 캡처했을 때 한 장으로 보이도록 카드 전체를 하나의 면으로 묶는다.
  card: {
    gap: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
  },
  cardHead: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardTitle: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    textAlign: 'center',
  },
  cardSub: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  muscleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  muscleChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryFaint,
  },
  muscleText: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: Spacing.lg,
  },
  stat: {
    alignItems: 'center',
    gap: 2,
    minWidth: 76,
  },
  statValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  statLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  heroLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  heroValue: {
    fontSize: FontSize.display,
    // 줄높이를 안 주면 큰 글자에서 한글 받침이 아래로 잘린다.
    lineHeight: FontSize.display * 1.2,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: FontSize.subtitle,
    color: Colors.textSecondary,
  },
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  rowTexts: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  rowSub: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  rowValue: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  points: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
    textAlign: 'center',
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.xxxl,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerRowButton: {
    // 반반으로 나눠도 글자가 잘리지 않게 기본 좌우 여백을 줄인다.
    flex: 1,
    paddingHorizontal: Spacing.sm,
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
