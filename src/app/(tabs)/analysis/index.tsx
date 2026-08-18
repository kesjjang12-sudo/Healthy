import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodySection } from '@/components/body-section';
import { SegmentedControl } from '@/components/segmented-control';
import { TrendChart } from '@/components/trend-chart';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  AnalysisError,
  getProgressSummary,
  getWorkoutSummary,
  getWorkoutTrend,
} from '@/features/analysis/api';
import { estimateCalories } from '@/features/analysis/calorie';
import { attendanceLine, streakLine, volumeLine } from '@/features/analysis/progress';
import { useAuthSession } from '@/features/auth/auth-session';
import type { ProgressSummary, WorkoutSummary, WorkoutTrend } from '@/lib/database.types';

type Period = 'week' | 'month';

/**
 * 30일이 아니라 28일(4주)인 이유: 30일을 7일씩 자르면 마지막 칸이 이틀짜리가
 * 되어 그 칸만 막대가 낮게 나온다. 실제로는 덜 한 게 아닌데 "요즘 뜸하다"로
 * 읽히므로, 칸 길이가 항상 같도록 7의 배수로 끊는다.
 */
const PERIODS = {
  week: { label: '최근 7일', previousLabel: '지난 7일', days: 7, bucket: 'day' },
  month: { label: '최근 4주', previousLabel: '지난 4주', days: 28, bucket: 'week' },
} as const;

/** 오늘을 포함해 정확히 days 일. 시작일을 하루라도 어긋나게 잡으면 주 단위가 안 맞는다. */
function periodStart(period: Period): Date {
  const start = new Date();
  start.setDate(start.getDate() - (PERIODS[period].days - 1));
  return start;
}

/** 지난 기간과 견줘 한 문장으로. 줄었다고 나무라지 않는다 — 그만두게 만든다. */
function compareSentence(trend: WorkoutTrend, period: Period): string | null {
  const diff = trend.total_sets - trend.previous_total_sets;
  const previousLabel = PERIODS[period].previousLabel;

  if (trend.previous_total_sets === 0) {
    return trend.total_sets > 0 ? `${previousLabel}에는 기록이 없었어요` : null;
  }
  if (diff > 0) return `${previousLabel}보다 ${diff}세트 많아요`;
  if (diff < 0) return `${previousLabel}보다 ${-diff}세트 적어요`;
  return `${previousLabel}과 같아요`;
}

/**
 * 분석 탭. 완료 기록 기반 대략치만 보여준다.
 *
 * 근력은 세트로, 유산소는 실제로 움직인 분(分)으로 센다 — 단위가 다르니
 * 한 숫자로 합치지 않고 나란히 보여준다.
 */
export default function AnalysisTab() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [trend, setTrend] = useState<WorkoutTrend | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setTrend(null);
    setProgress(null);
    setErrorMessage(null);

    const from = periodStart(period);
    const to = new Date();

    Promise.all([
      getWorkoutSummary(user!.id, from, to),
      getWorkoutTrend(user!.id, from, to, PERIODS[period].bucket),
    ])
      .then(([summaryResult, trendResult]) => {
        if (cancelled) return;
        setSummary(summaryResult);
        setTrend(trendResult);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof AnalysisError ? error.message : '잠시 후 다시 시도해 주세요.');
      });

    // 진행 상황 칸은 덤이다. 이것만 실패했다고 탭 전체를 에러로 덮으면
    // 볼 수 있는 숫자까지 못 보게 된다 — 그 칸만 조용히 빠진다.
    getProgressSummary(user!.id, PERIODS[period].days)
      .then((result) => {
        if (!cancelled) setProgress(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user, period]);

  const calories = useMemo(() => {
    if (!summary) return null;
    return estimateCalories({
      strengthCount: summary.strength_count,
      strengthSets: summary.total_sets,
      cardioMinutes: summary.cardio_minutes,
      bodyWeightKg: user!.profile_data?.weight_kg,
    });
  }, [summary, user]);

  // "완료 3개 · 근력 6세트 · 유산소 20분". 없는 항목은 아예 빼서 0 이 눈에
  // 걸리지 않게 한다.
  const summaryLine = useMemo(() => {
    if (!summary) return '';
    const parts = [`완료 ${summary.completed_count}개`];
    if (summary.total_sets > 0) parts.push(`근력 ${summary.total_sets}세트`);
    if (summary.cardio_minutes > 0) parts.push(`유산소 ${summary.cardio_minutes}분`);
    return parts.join(' · ');
  }, [summary]);

  const maxMuscleSets = summary ? Math.max(1, ...summary.by_muscle.map((m) => m.total_sets)) : 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        분석
      </Text>

      <BodySection />

      <SegmentedControl
        options={[
          { value: 'week', label: PERIODS.week.label },
          { value: 'month', label: PERIODS.month.label },
        ]}
        value={period}
        onChange={setPeriod}
      />

      {errorMessage ? (
        <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : !summary || !trend ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <>
          {/* 제일 위에 "잘하고 있나"의 답을 둔다. 칼로리는 그 근거지 답이 아니다 —
              시니어에게 "이번 주 3번 나오셨어요"가 "180kcal"보다 훨씬 잘 읽힌다. */}
          {progress ? <ProgressCard progress={progress} /> : null}

          <View style={styles.stat}>
            <Text style={styles.statLabel} maxFontSizeMultiplier={1.2}>
              소모 칼로리(대략)
            </Text>
            <Text style={styles.statValue} maxFontSizeMultiplier={1.2}>
              {calories?.toLocaleString('ko-KR')}kcal
            </Text>
          </View>

          {/* 추이가 부위별 분포보다 위에 온다. "얼마나 꾸준한가"가 "어디를
              많이 했나"보다 먼저 궁금한 정보다. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
              운동량 추이
            </Text>
            <Text style={styles.trendHeadline} maxFontSizeMultiplier={1.3}>
              {PERIODS[period].days}일 중 {trend.workout_days}일 나오셨어요
            </Text>
            <TrendChart points={trend.points} bucket={trend.bucket} />
            {compareSentence(trend, period) ? (
              <Text style={styles.trendCompare} maxFontSizeMultiplier={1.3}>
                {compareSentence(trend, period)}
              </Text>
            ) : null}

            {/* 세트 수 비교(위)는 "얼마나 했나"고, 이 줄은 "나왔나"다. 버튼만
                눌러도 세트는 늘지만 출석은 체크인이 있어야 남아서, 판단은
                출석을 기준으로 한다. 나무라지 않는 문장만 쓴다. */}
            {progress ? (
              <Text style={styles.trendCompare} maxFontSizeMultiplier={1.3}>
                {attendanceLine(progress.current, progress.previous, progress.days)}
                {streakLine(progress.streak_weeks) ? ` · ${streakLine(progress.streak_weeks)}` : ''}
              </Text>
            ) : null}
          </View>

          {/* "완료 3개 · 근력 6세트 · 유산소 20분". 없는 항목은 아예 빼서
              0 이 눈에 걸리지 않게 한다. */}
          <Text style={styles.statNote} maxFontSizeMultiplier={1.3}>
            {summaryLine}
          </Text>

          {summary.by_muscle.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
                부위별 세트 수
              </Text>
              <View style={styles.bars}>
                {summary.by_muscle.map((row) => (
                  <View key={row.target_muscle ?? '기타'} style={styles.barRow}>
                    <Text style={styles.barLabel} maxFontSizeMultiplier={1.2}>
                      {row.target_muscle ?? '기타'}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(8, (row.total_sets / maxMuscleSets) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.barValue} maxFontSizeMultiplier={1.2}>
                      {row.total_sets}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : summary.completed_count === 0 ? (
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              이 기간에 완료한 운동이 없어요.
            </Text>
          ) : (
            // 유산소만 한 기간. 부위별 막대는 비어 있지만 운동을 안 한 건 아니다.
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              이 기간에는 유산소만 하셨어요.
            </Text>
          )}

          <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
            칼로리는 정확한 측정값이 아니라 대략치예요. 유산소는 실제로 움직인 시간으로,
            근력은 완료한 세트 수로 어림잡아요.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

/**
 * "잘하고 있나"에 답하는 칸.
 *
 * 큰 숫자 하나(나온 횟수) + 지난 기간과의 비교 + 연속 주. 셋 다 출석 기준이다.
 */
function ProgressCard({ progress }: { progress: ProgressSummary }) {
  const streak = streakLine(progress.streak_weeks);
  const volume = volumeLine(progress.current);

  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
        최근 {progress.days}일 동안
      </Text>
      <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
        {progress.current.attendance_days}
        <Text style={styles.heroUnit}>번 나오셨어요</Text>
      </Text>

      <Text
        style={styles.heroSub}
        maxFontSizeMultiplier={1.3}
        accessibilityLiveRegion="polite">
        {attendanceLine(progress.current, progress.previous, progress.days)}
      </Text>

      {streak ? (
        <Text style={styles.streak} maxFontSizeMultiplier={1.3}>
          {streak}
        </Text>
      ) : null}

      {volume ? (
        <Text style={styles.heroSub} maxFontSizeMultiplier={1.3}>
          {volume}
        </Text>
      ) : null}
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
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  errorText: {
    fontSize: FontSize.body,
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
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  heroSub: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  streak: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
    textAlign: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  statLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statNote: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    marginTop: -Spacing.md,
  },
  section: {
    gap: Spacing.md,
  },
  /** 토스의 "금융 서비스" 같은 회색 섹션 캡션 — 내용보다 조용해야 한다. */
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.grey[500],
  },
  trendHeadline: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  /** 줄었을 때도 같은 색이다. 빨간 글씨로 나무라면 다음 주에 안 온다. */
  trendCompare: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  bars: {
    gap: Spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  barLabel: {
    width: 56,
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  barTrack: {
    flex: 1,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  barValue: {
    width: 28,
    textAlign: 'right',
    fontSize: FontSize.caption,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
