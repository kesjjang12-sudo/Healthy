import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodySection } from '@/components/body-section';
import { SegmentedControl } from '@/components/segmented-control';
import { TrendChart } from '@/components/trend-chart';
import { Colors, FontSize, IconTint, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import {
  AnalysisError,
  getProgressSummary,
  getWorkoutSummary,
  getWorkoutTrend,
} from '@/features/analysis/api';
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
 * 이 기간에 한 번도 안 한 부위를 짚어 준다.
 *
 * 막대 그림만 있으면 "등이 제일 많네"에서 끝난다. 다음에 뭘 하면 되는지로
 * 이어지려면 빠진 쪽을 말로 해 줘야 한다. 나무라는 말투는 쓰지 않는다 —
 * 안 한 게 아니라 "쉬고 있다"로 적는다.
 */
function restingMuscles(byMuscle: WorkoutSummary['by_muscle']): string | null {
  const rested = byMuscle.filter((row) => row.total_sets === 0).map((row) => row.target_muscle);
  const named = rested.filter((name): name is string => Boolean(name));
  if (named.length === 0 || named.length === byMuscle.length) return null;
  // 셋을 넘으면 문장이 길어져 읽다가 놓친다. 셋까지만 적고 나머지는 센다.
  const shown = named.slice(0, 3).join('·');
  const rest = named.length - 3;
  return `${shown}${rest > 0 ? ` 외 ${rest}곳` : ''}은 이번에 쉬었어요`;
}

/** 큰 숫자 하나 + 단위 + 이름. 세 칸이 나란히 서서 이 기간을 요약한다. */
function KpiTile({
  value,
  unit,
  label,
  tone,
}: {
  value: number;
  unit: string;
  label: string;
  tone: 'primary' | 'success' | 'cardio';
}) {
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      <Text style={[styles.kpiValue, styles[tone]]} maxFontSizeMultiplier={1.2}>
        {value}
        <Text style={styles.kpiUnit}>{unit}</Text>
      </Text>
      <Text style={styles.kpiLabel} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </View>
  );
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

  const maxMuscleSets = summary ? Math.max(1, ...summary.by_muscle.map((m) => m.total_sets)) : 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        분석
      </Text>

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

          {/* 흩어져 있던 "완료 3개 · 근력 6세트 · 유산소 20분" 한 줄을 타일 셋으로
              세운다. 같은 정보인데 회색 작은 글씨로 흘리면 아무도 안 읽는다.
              0 인 항목은 타일 자체를 빼서 빈 칸이 눈에 걸리지 않게 한다. */}
          <View style={styles.kpis}>
            <KpiTile value={summary.completed_count} unit="개" label="완료" tone="primary" />
            {summary.total_sets > 0 ? (
              <KpiTile value={summary.total_sets} unit="세트" label="근력" tone="success" />
            ) : null}
            {summary.cardio_minutes > 0 ? (
              <KpiTile value={summary.cardio_minutes} unit="분" label="유산소" tone="cardio" />
            ) : null}
          </View>

          {/* 추이가 부위별 분포보다 위에 온다. "얼마나 꾸준한가"가 "어디를
              많이 했나"보다 먼저 궁금한 정보다.
              설명 문장은 여기 두지 않는다 — 출석·연속·증감은 위 ProgressCard 가
              이미 말했고, 같은 말을 두 번 하면 읽는 사람이 새 정보인 줄 알고
              다시 읽는다. 여기서는 세트 수 증감만 한 줄로 곁들인다. */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
                운동량 추이
              </Text>
              {compareSentence(trend, period) ? (
                <Text style={styles.sectionAside} maxFontSizeMultiplier={1.2}>
                  {compareSentence(trend, period)}
                </Text>
              ) : null}
            </View>
            <TrendChart points={trend.points} bucket={trend.bucket} />
          </View>

          {summary.by_muscle.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
                  부위별 세트 수
                </Text>
              </View>
              {/* 막대만 보면 "등이 제일 많네"에서 끝난다. 안 한 부위를 짚어 줘야
                  다음에 무엇을 하면 되는지로 이어진다. */}
              {restingMuscles(summary.by_muscle) ? (
                <Text style={styles.balanceNote} maxFontSizeMultiplier={1.3}>
                  {restingMuscles(summary.by_muscle)}
                </Text>
              ) : null}
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
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.2}>
                아직 기록이 없어요
              </Text>
              <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>
                오늘 운동을 하나만 마쳐도 여기에 쌓이기 시작해요.
              </Text>
            </View>
          ) : (
            // 유산소만 한 기간. 부위별 막대는 비어 있지만 운동을 안 한 건 아니다.
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              이 기간에는 유산소만 하셨어요.
            </Text>
          )}

          <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
            유산소는 실제로 움직인 시간으로, 근력은 완료한 세트 수로 셉니다.
          </Text>

        </>
      )}

      {/* 몸무게는 분석의 결과가 아니라 내가 넣는 값이라 아래로 내렸다.
          맨 위를 차지하면 정작 "잘하고 있나"의 답이 밀린다.
          성공 분기 밖에 두는 이유: 통계 조회가 실패해도 몸무게는 보고 적을 수
          있어야 한다. 안에 두었더니 오류가 난 날 화면이 통째로 비었다. */}
      <BodySection />
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
    gap: Spacing.xxl,
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
    // 줄높이를 안 주면 큰 글자에서 한글 받침이 아래로 잘린다.
    lineHeight: FontSize.display * 1.2,
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
  section: {
    gap: Spacing.md,
  },
  /** 제목과 곁들임 문장을 한 줄에. 제목만 있던 줄의 빈 오른쪽을 쓴다. */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionAside: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  kpis: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  kpi: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  kpiValue: {
    // 화면에 힘을 주는 자리. 토큰 스케일(22)보다 크게 가되, 세 칸이 나란히
    // 서야 하므로 상세 화면의 56 만큼 키우지는 않는다.
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    fontVariant: ['tabular-nums'],
  },
  kpiUnit: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  kpiLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  /** 세 타일을 색으로 갈라 놓는다 — 바로가기 타일과 같은 규칙이다. */
  primary: {
    color: Colors.primary,
  },
  success: {
    color: Colors.success,
  },
  cardio: {
    color: IconTint.orange,
  },
  balanceNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  emptyBox: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  /** 소분류 제목. 회색이면 흐려서 안 읽힌다는 피드백으로 검정으로 올렸다. */
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  /** 줄었을 때도 같은 색이다. 빨간 글씨로 나무라면 다음 주에 안 온다. */
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
