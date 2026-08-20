import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GrowthBadge } from '@/components/growth-badge';
import { Icon } from '@/components/icon';
import { ProgressRing } from '@/components/progress-ring';
import { SegmentedControl } from '@/components/segmented-control';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { growthStatus } from '@/features/growth/levels';
import {
  RankingError,
  cheerApartment,
  getApartmentLeaderboard,
  getApartmentWeek,
  getGlobalLeaderboard,
} from '@/features/ranking/api';
import type {
  ApartmentWeek,
  GlobalLeaderboardRow,
  LeaderboardOrder,
  LeaderboardRow,
} from '@/lib/database.types';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 응원은 겉으로는 버튼 하나다. DB 는 이모지 세 종을 받게 돼 있지만
 * (apartment_cheers.emoji check) 화면에 이모지를 늘어놓으니 싸구려처럼
 * 보였다(오너 피드백 "짜친다") — 종류 구분은 접고 개수만 보여준다.
 */
const CHEER_EMOJI = '💪';

/** 유산소 분 → km. 국토종주와 같은 환산이라 두 화면의 숫자가 서로 맞는다. */
const KM_PER_MINUTE = 0.15;

function formatKm(minutes: number): string {
  return (Math.round(minutes * KM_PER_MINUTE * 10) / 10).toLocaleString('ko-KR');
}

/** 1톤을 넘으면 톤으로 읽는다 — "90,000kg"보다 "90톤"이 자랑이 된다. */
function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(Math.round(kg / 100) / 10).toLocaleString('ko-KR')}톤`;
  return `${Math.round(kg).toLocaleString('ko-KR')}kg`;
}

/**
 * 랭킹 탭 = 우리 단지의 화합의 장.
 *
 * 위에는 "우리 단지 이번 주" — 개인 순위 전에 단지 공동 목표부터 보인다.
 * 출석은 혼자 하는 일이지만 목표는 같이 채우는 것이라, 경쟁(아래 순위표)보다
 * 협동(위 카드)을 먼저 놓는다. 응원은 글·사진 없이 이모지 하나다 — 하루 한 번,
 * 부담 없이 "나 오늘도 봤다"만 남긴다.
 *
 * 순위는 두 갈래로 세운다. 출석은 키오스크 체크인이 있어야만 쌓여 조작이
 * 어렵고, 포인트는 운동 완료로 쌓이는 노력값이다.
 */
export default function RankingTab() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const [order, setOrder] = useState<LeaderboardOrder>('attendance');
  const [scope, setScope] = useState<'apt' | 'global'>('apt');
  const [rows, setRows] = useState<LeaderboardRow[] | GlobalLeaderboardRow[] | null>(null);
  const [week, setWeek] = useState<ApartmentWeek | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCheering, setIsCheering] = useState(false);

  useEffect(() => {
    if (!user!.apt_id) return;
    let cancelled = false;

    // 정렬·범위를 바꾸면 목록만 다시 받는다 — 이전 목록을 지우고 로딩을 돌린다.
    setRows(null);
    const request =
      scope === 'global'
        ? getGlobalLeaderboard(order)
        : getApartmentLeaderboard(user!.apt_id, order);
    request
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
  }, [user, order, scope]);

  useEffect(() => {
    if (!user!.apt_id) return;
    let cancelled = false;
    getApartmentWeek(user!.apt_id)
      .then((result) => {
        if (!cancelled) setWeek(result);
      })
      // 주간 카드는 부가 정보다 — 못 받아도 순위표는 그대로 보여준다.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const cheer = useCallback(
    async (emoji: string) => {
      if (!user?.apt_id || isCheering) return;
      setIsCheering(true);
      try {
        setWeek(await cheerApartment(user.apt_id, emoji));
      } catch {
        // 응원 실패는 조용히 넘긴다. 다시 누르면 된다.
      } finally {
        setIsCheering(false);
      }
    },
    [user, isCheering],
  );

  const isPoints = order === 'points';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        랭킹
      </Text>

      {!user!.apt_id ? (
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          아직 주 소속 헬스장이 없어요.
        </Text>
      ) : (
        <>
          {week ? <WeekCard week={week} isCheering={isCheering} onCheer={cheer} /> : null}

          {/* 범위(우리 단지/전체)와 기준(출석/포인트)을 따로 고른다. */}
          <View style={styles.toggles}>
            <SegmentedControl
              options={[
                { value: 'apt', label: '우리 단지' },
                { value: 'global', label: '전체' },
              ]}
              value={scope}
              onChange={(next) => setScope(next)}
            />
            <SegmentedControl
              options={[
                { value: 'attendance', label: '출석순' },
                { value: 'points', label: '포인트순' },
              ]}
              value={order}
              onChange={(next) => setOrder(next)}
            />
          </View>

          {errorMessage ? (
            <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
          ) : rows === null ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              {/* 내 순위 카드 — 목록을 훑기 전에 내 위치부터 답한다. */}
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
                        {isPoints
                          ? `${(myRow.total_points ?? 0).toLocaleString('ko-KR')}점`
                          : `출석 ${myRow.attendance_count}일`}
                      </Text>
                    </View>
                  </View>
                ) : null;
              })()}

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
                    {/* 호칭 배지. 옆 사람의 호칭이 보이면 "나도 저기까지"라는 목표가 생긴다.
                        32 부터 장식(리본·왕관)이 그려진다 — 그보다 작으면 뭉개진다. */}
                    <GrowthBadge
                      levelIndex={growthStatus(row.total_points ?? 0).level.index}
                      size={32}
                    />
                    <View style={styles.nameColumn}>
                      <Text
                        style={[styles.nickname, row.is_me && styles.nicknameMe]}
                        maxFontSizeMultiplier={1.3}
                        numberOfLines={1}>
                        {row.is_me ? `${row.nickname} (나)` : row.nickname}
                      </Text>
                      {/* 전체 랭킹에서는 어느 단지 사람인지가 절반의 재미다. */}
                      {'apt_name' in row && scope === 'global' ? (
                        <Text style={styles.aptName} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                          {row.apt_name}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.valueColumn}>
                      <Text
                        style={[styles.valueMain, row.is_me && styles.valueMainMe]}
                        maxFontSizeMultiplier={1.2}>
                        {isPoints
                          ? (row.total_points ?? 0).toLocaleString('ko-KR')
                          : `${row.attendance_count}일`}
                      </Text>
                      <Text style={styles.valueSub} maxFontSizeMultiplier={1.2}>
                        {isPoints ? '점' : '출석'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

/**
 * "우리 단지 이번 주" 카드.
 *
 * 공동 목표(활동 멤버 모두 주 2회) 진행 바 + 요일별 출석 막대 + 응원 이모지.
 * 숫자 셋(단지 출석·목표·내 출석)이 한 카드에 다 있어서, 주간 현황을 보러
 * 다른 데 갈 필요가 없다.
 */
function WeekCard({
  week,
  isCheering,
  onCheer,
}: {
  week: ApartmentWeek;
  isCheering: boolean;
  onCheer: (emoji: string) => void;
}) {
  const progress = Math.min(week.total_checkins / week.goal, 1);
  const maxDay = Math.max(...week.days.map((d) => d.count), 1);
  // toISOString 은 UTC 라 한국 새벽(0~9시)에는 어제 날짜가 나온다.
  const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const todayIndex = week.days.findIndex((d) => d.date === todayKst);
  const done = week.total_checkins >= week.goal;

  const cheerCount = week.cheers.reduce((sum, c) => sum + c.count, 0);
  const cheered = week.my_cheer !== null;

  return (
    <View style={styles.weekCard}>
      <View style={styles.weekHead}>
        <Text style={styles.weekTitle} maxFontSizeMultiplier={1.2}>
          이번 주 다 같이
        </Text>
        <Text style={styles.weekMine} maxFontSizeMultiplier={1.2}>
          나 {week.my_checkins}번
        </Text>
      </View>

      {/* 국토종주 링과 같은 문법 — 목표를 향해 차오르는 원, 게이지 끝에는
          달리는 사람(선발대). 막대보다 "어디로 가는 중"이라는 느낌이 산다. */}
      <View style={styles.ringWrap}>
        <ProgressRing
          progress={progress}
          size={216}
          stroke={16}
          tip={
            <Icon
              name="runner"
              size={24}
              color={done ? Colors.success : Colors.primary}
              strokeWidth={2}
            />
          }>
          <Text style={styles.ringLabel} maxFontSizeMultiplier={1.2}>
            {done ? '목표 달성!' : '단지 출석'}
          </Text>
          <Text style={[styles.ringValue, done && styles.ringValueDone]} maxFontSizeMultiplier={1.2}>
            {week.total_checkins}
          </Text>
          <Text style={styles.ringGoal} maxFontSizeMultiplier={1.2}>
            / 목표 {week.goal}번
          </Text>
        </ProgressRing>
      </View>

      {/* 요일별 막대. 사람 수를 막대 위에 그대로 얹는다 — 눌러야 보이는 값은
          있는 줄도 모른다(오너 피드백). 0인 날은 숫자를 비워 눈이 쉰다. */}
      <View style={styles.weekDays}>
        {week.days.map((day, index) => {
          const isToday = index === todayIndex;
          return (
            <View
              key={day.date}
              style={styles.weekDay}
              accessible
              accessibilityLabel={`${DAY_LABELS[index]}요일 ${day.count}명`}>
              <Text
                style={[styles.weekBarValue, isToday && styles.weekBarValueToday]}
                maxFontSizeMultiplier={1.2}>
                {day.count > 0 ? day.count : ''}
              </Text>
              <View style={styles.weekBarSlot}>
                <View
                  style={[
                    styles.weekBar,
                    isToday && styles.weekBarToday,
                    { height: `${Math.max((day.count / maxDay) * 100, day.count > 0 ? 12 : 4)}%` },
                  ]}
                />
              </View>
              <Text
                style={[styles.weekDayLabel, isToday && styles.weekDayLabelToday]}
                maxFontSizeMultiplier={1.2}>
                {DAY_LABELS[index]}
              </Text>
            </View>
          );
        })}
      </View>

      {/* 단지가 이번 주 움직인 양. 출석 횟수만으로는 "이만큼 했다"가 안 와닿는다. */}
      <View style={styles.totals}>
        <TotalRow
          label="다 같이 걸은 거리"
          value={`${formatKm(week.cardio_minutes)}km`}
          goal={`${formatKm(week.goal_cardio_minutes)}km`}
          progress={week.goal_cardio_minutes > 0 ? week.cardio_minutes / week.goal_cardio_minutes : 0}
        />
        <TotalRow
          label="다 같이 든 무게"
          value={formatWeight(week.volume_kg)}
          goal={formatWeight(week.goal_volume_kg)}
          progress={week.goal_volume_kg > 0 ? week.volume_kg / week.goal_volume_kg : 0}
        />
      </View>

      {/* 응원 — 버튼 하나. 누르기 전 빈 하트, 누른 뒤 꽉 찬 빨간 하트. */}
      <Pressable
        onPress={() => onCheer(CHEER_EMOJI)}
        disabled={isCheering || cheered}
        accessibilityRole="button"
        accessibilityLabel={
          cheered
            ? `오늘 응원했어요. 이번 주 응원 ${cheerCount}개`
            : `단지에 응원 보내기. 이번 주 응원 ${cheerCount}개`
        }
        style={({ pressed }) => [
          styles.cheerButton,
          cheered && styles.cheerButtonMine,
          pressed && !cheered && styles.cheerButtonPressed,
        ]}>
        <Icon
          name="heart"
          size={18}
          color={cheered ? Colors.danger : Colors.textSecondary}
          strokeWidth={2}
          filled={cheered}
        />
        <Text style={[styles.cheerLabel, cheered && styles.cheerLabelMine]} maxFontSizeMultiplier={1.2}>
          {cheered ? '오늘 응원했어요' : '응원 보내기'}
        </Text>
        {cheerCount > 0 ? (
          <Text style={[styles.cheerCount, cheered && styles.cheerCountMine]} maxFontSizeMultiplier={1.2}>
            {cheerCount}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/** 단지 합계 한 줄: 이름 · 값/목표 · 가는 막대. */
function TotalRow({
  label,
  value,
  goal,
  progress,
}: {
  label: string;
  value: string;
  goal: string;
  progress: number;
}) {
  const filled = Math.min(Math.max(progress, 0), 1);
  const done = progress >= 1;

  return (
    <View style={styles.totalRow} accessible accessibilityLabel={`${label} ${value}, 목표 ${goal}`}>
      <View style={styles.totalHead}>
        <Text style={styles.totalLabel} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
        <Text style={styles.totalValue} maxFontSizeMultiplier={1.2}>
          {value}
          <Text style={styles.totalGoal}> / {goal}</Text>
        </Text>
      </View>
      <View style={styles.totalTrack}>
        <View
          style={[
            styles.totalFill,
            done && styles.totalFillDone,
            { width: `${Math.max(filled * 100, 2)}%` },
          ]}
        />
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
  /** 이번 주 카드 — 단지 공동의 것이라 개인 카드(옅은 파랑)와 달리 회색 면. */
  weekCard: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekTitle: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  weekMine: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.primary,
  },
  ringWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  ringLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  ringValue: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  ringValueDone: {
    color: Colors.success,
  },
  ringGoal: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  toggles: {
    gap: Spacing.sm,
  },
  nameColumn: {
    flex: 1,
    gap: 1,
  },
  aptName: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  weekDays: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  weekBarSlot: {
    height: 44,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  weekBar: {
    width: 14,
    borderRadius: Radius.sm,
    backgroundColor: Colors.grey[300],
  },
  weekBarToday: {
    backgroundColor: Colors.primary,
  },
  weekBarValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
    minHeight: 16,
  },
  weekBarValueToday: {
    color: Colors.primary,
  },
  weekDayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  weekDayLabelToday: {
    color: Colors.primary,
  },
  totals: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  totalRow: {
    gap: Spacing.xs,
  },
  totalHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  totalLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  totalGoal: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  totalTrack: {
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.grey[100],
    overflow: 'hidden',
  },
  totalFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  totalFillDone: {
    backgroundColor: Colors.success,
  },
  cheerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    marginTop: Spacing.xs,
  },
  cheerButtonMine: {
    backgroundColor: Colors.primaryFaint,
  },
  cheerButtonPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  cheerLabel: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  cheerLabelMine: {
    color: Colors.primary,
  },
  cheerCount: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  cheerCountMine: {
    color: Colors.primary,
  },
  /** 내 순위 카드. 옅은 파랑 면 위에 순위를 크게. */
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
