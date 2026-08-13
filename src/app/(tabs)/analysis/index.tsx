import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { AnalysisError, getWorkoutSummary } from '@/features/analysis/api';
import { estimateCalories } from '@/features/analysis/calorie';
import { useAuthSession } from '@/features/auth/auth-session';
import type { WorkoutSummary } from '@/lib/database.types';

type Period = 'week' | 'month';

function periodStart(period: Period): Date {
  const now = new Date();
  const days = period === 'week' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setErrorMessage(null);

    getWorkoutSummary(user!.id, periodStart(period), new Date())
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof AnalysisError ? error.message : '잠시 후 다시 시도해 주세요.');
      });

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

      <View style={styles.periodRow}>
        <PrimaryButton
          label="최근 7일"
          variant={period === 'week' ? 'primary' : 'secondary'}
          size="compact"
          onPress={() => setPeriod('week')}
        />
        <PrimaryButton
          label="최근 30일"
          variant={period === 'month' ? 'primary' : 'secondary'}
          size="compact"
          onPress={() => setPeriod('month')}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : !summary ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>
              소모 칼로리(대략)
            </Text>
            <Text style={styles.heroValue} maxFontSizeMultiplier={1.2}>
              {calories?.toLocaleString('ko-KR')}kcal
            </Text>
            <Text style={styles.heroSub} maxFontSizeMultiplier={1.3}>
              {summaryLine}
            </Text>
          </View>

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
              이 기간에 완료한 운동이 없습니다.
            </Text>
          ) : (
            // 유산소만 한 기간. 부위별 막대는 비어 있지만 운동을 안 한 건 아니다.
            <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
              이 기간에는 유산소만 하셨습니다.
            </Text>
          )}

          <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
            칼로리는 정확한 측정값이 아니라 대략치입니다. 유산소는 실제로 움직인 시간으로,
            근력은 완료한 세트 수로 어림잡습니다.
          </Text>
        </>
      )}
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
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
  heroSub: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
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
