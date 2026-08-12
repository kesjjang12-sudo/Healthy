import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { RankingError, getApartmentLeaderboard } from '@/features/ranking/api';
import type { LeaderboardRow } from '@/lib/database.types';

/**
 * 랭킹 탭. 같은 아파트 단지 안에서만 비교한다(요구사항 확정 — 전체 통합 랭킹
 * 아님). 순위는 users.apt_id(주 소속) 기준으로 본다.
 *
 * 포인트가 아니라 출석 횟수로 줄을 세운다 — 포인트는 완료 버튼만 누르면
 * 쌓이는 자기신고값이라 실제로 그 운동을 했는지 검증할 수 없다. 출석은
 * 키오스크 체크인이 있어야만 기록되므로 조작하기 어렵다.
 */
export default function RankingTab() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user!.apt_id) return;
    let cancelled = false;

    getApartmentLeaderboard(user!.apt_id)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof RankingError ? error.message : '잠시 후 다시 시도해 주세요.');
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <View style={styles.headings}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          우리 단지 랭킹
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          같은 헬스장을 쓰는 이웃끼리, 출석한 날 수로 비교됩니다.
        </Text>
      </View>

      {!user!.apt_id ? (
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          아직 주 소속 헬스장이 없습니다.
        </Text>
      ) : errorMessage ? (
        <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : rows === null ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((row) => (
            <View key={row.rank} style={[styles.row, row.is_me && styles.rowMe]}>
              <Text
                style={[styles.rank, row.is_me && styles.rankMe]}
                maxFontSizeMultiplier={1.2}>
                {row.rank}
              </Text>
              <Text
                style={[styles.nickname, row.is_me && styles.nicknameMe]}
                maxFontSizeMultiplier={1.3}>
                {row.is_me ? `${row.nickname} (나)` : row.nickname}
              </Text>
              <Text
                style={[styles.points, row.is_me && styles.pointsMe]}
                maxFontSizeMultiplier={1.2}>
                {row.attendance_count}일 출석
              </Text>
            </View>
          ))}
        </View>
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
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  helper: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
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
  list: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  rowMe: {
    backgroundColor: Colors.primaryFaint,
  },
  rank: {
    width: 32,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rankMe: {
    color: Colors.primary,
  },
  nickname: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  nicknameMe: {
    color: Colors.primary,
    fontWeight: '700',
  },
  points: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pointsMe: {
    color: Colors.primary,
  },
});
