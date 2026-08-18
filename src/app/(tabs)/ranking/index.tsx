import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GrowthBadge } from '@/components/growth-badge';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { growthStatus } from '@/features/growth/levels';
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
          같은 헬스장을 쓰는 이웃끼리, 출석한 날 수로 비교돼요.
        </Text>
      </View>

      {!user!.apt_id ? (
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          아직 주 소속 헬스장이 없어요.
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
        <>
          {/* FIT ROTEIN 시안의 내 순위 카드 — 목록을 훑기 전에 내 위치부터 답한다. */}
          {(() => {
            const myRow = rows.find((row) => row.is_me);
            return myRow ? (
              <View style={styles.myCard}>
                <Text style={styles.myRank} maxFontSizeMultiplier={1.2}>
                  {myRow.rank}위
                </Text>
                <View style={styles.myInfo}>
                  <Text style={styles.myName} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                    {myRow.nickname}
                  </Text>
                  <Text style={styles.myMeta} maxFontSizeMultiplier={1.2}>
                    출석 {myRow.attendance_count}일
                  </Text>
                </View>
              </View>
            ) : null;
          })()}
          {/* 토스 증권의 보유 종목 목록처럼: 이름은 왼쪽, 값은 오른쪽 끝에 굵게.
              칸을 나누는 카드 없이 흰 바탕에 행만 쌓고, 내 행만 옅은 파랑으로 띄운다. */}
          <View style={styles.list}>
          {rows.map((row) => (
            <View key={row.rank} style={[styles.row, row.is_me && styles.rowMe]}>
              <View style={[styles.rankBadge, row.rank <= 3 && styles.rankBadgeTop]}>
                <Text
                  style={[styles.rank, (row.rank <= 3 || row.is_me) && styles.rankTop]}
                  maxFontSizeMultiplier={1.2}>
                  {row.rank}
                </Text>
              </View>
              {/* 호칭 배지. 랭킹은 출석순이지만, 옆 사람이 무슨 호칭인지 보이면
                  "나도 저기까지"라는 목표가 생긴다. */}
              <GrowthBadge levelIndex={growthStatus(row.total_points ?? 0).level.index} size={24} />
              <Text
                style={[styles.nickname, row.is_me && styles.nicknameMe]}
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}>
                {row.is_me ? `${row.nickname} (나)` : row.nickname}
              </Text>
              <View style={styles.valueColumn}>
                <Text
                  style={[styles.valueMain, row.is_me && styles.valueMainMe]}
                  maxFontSizeMultiplier={1.2}>
                  {row.attendance_count}일
                </Text>
                <Text style={styles.valueSub} maxFontSizeMultiplier={1.2}>
                  출석
                </Text>
              </View>
            </View>
          ))}
          </View>
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
    gap: Spacing.xxl,
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
  /** 내 순위 카드(FIT ROTEIN 시안). 옅은 파랑 면 위에 순위를 크게. */
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  myRank: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  myInfo: {
    flex: 1,
    gap: 2,
  },
  myName: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  myMeta: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primaryPressed,
  },
  list: {
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    minHeight: 68,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    // 행 사이 가는 선 — 순위 목록이 한 덩어리로 뭉쳐 보인다는 피드백.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.grey[100],
    marginHorizontal: -Spacing.md,
    borderRadius: Radius.md,
  },
  rowMe: {
    backgroundColor: Colors.primaryFaint,
  },
  /** 순위 숫자를 담는 동그라미. 1~3등만 옅은 파랑 면을 깔아 눈에 띄게 한다. */
  rankBadge: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  rankBadgeTop: {
    backgroundColor: Colors.primaryFaint,
  },
  rank: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rankTop: {
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
  valueColumn: {
    alignItems: 'flex-end',
    gap: 1,
  },
  valueMain: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  valueMainMe: {
    color: Colors.primary,
  },
  valueSub: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
});
