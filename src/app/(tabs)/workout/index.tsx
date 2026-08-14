import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { StrengthHookBanner } from '@/components/strength-hook-banner';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useCheckInListener } from '@/features/attendance/use-checkin-listener';
import { useAuthSession } from '@/features/auth/auth-session';
import { pickHookMessage } from '@/features/content/hooking-copy';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';
import { useVisitStats } from '@/features/routine/use-visit-stats';

/**
 * 운동 탭. 예전엔 태블릿 체크인 직후 뜨던 화면이었지만, 이제 키오스크는
 * 체크인만 하고 이 화면은 개인 폰 로그인 뒤에만 보인다.
 *
 * user/onboarded 체크는 (tabs)/_layout.tsx 가 이미 끝냈으므로 여기서 다시
 * 하지 않는다. "운동 마치기"(로그아웃) 버튼도 없앴다 — 공용 태블릿 시절엔
 * 다음 사람을 위해 반드시 로그아웃해야 했지만, 개인 폰은 그럴 이유가 없다.
 * 로그아웃은 프로필 탭에 있다.
 */
export default function WorkoutTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh: refreshProfile } = useAuthSession();
  const { result, isLoading, errorMessage, retry } = useDailyRoutine(user!.id);
  const { stats: visitStats, refresh: refreshVisitStats } = useVisitStats(user!.id);
  const hookMessage = useMemo(() => pickHookMessage(), []);

  // 태블릿에서 체크인이 찍히면 여기서 바로 받아 화면을 맞춘다.
  // 루틴까지 다시 부르는 이유: 오늘 어느 헬스장에 체크인했는지에 따라 그
  // 헬스장 기구로 루틴이 짜이기 때문이다(이사 대응).
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  const handleCheckIn = useCallback(() => {
    setJustCheckedIn(true);
    refreshVisitStats();
    retry();
  }, [refreshVisitStats, retry]);

  useCheckInListener(user!.id, handleCheckIn);

  // 운동을 마치고 돌아오면 이 화면은 그동안 계속 떠 있던 상태다. 다시 불러오지
  // 않으면 방금 끝낸 운동이 목록에서 여전히 "안 한 것"으로 보이고 포인트도
  // 그대로라, 저장이 안 된 줄 알고 같은 운동을 또 하게 된다.
  // 첫 진입은 위 훅들이 이미 불러오므로 건너뛴다.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      retry();
      void refreshProfile();
    }, [retry, refreshProfile]),
  );

  // 안내는 잠깐만 띄운다. 계속 남아 있으면 다음에 열었을 때 방금 찍은 것처럼 보인다.
  useEffect(() => {
    if (!justCheckedIn) return;
    const timer = setTimeout(() => setJustCheckedIn(false), 6_000);
    return () => clearTimeout(timer);
  }, [justCheckedIn]);

  const name = user!.profile_data?.nickname ?? '회원';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        <View style={styles.headings}>
          {visitStats ? (
            <Text style={styles.dayBadge} maxFontSizeMultiplier={1.2}>
              DAY {visitStats.total_days}
            </Text>
          ) : null}
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {name} 님{'\n'}오늘도 나오셨네요
          </Text>
        </View>

        {justCheckedIn ? (
          <View style={styles.checkedInBanner}>
            <Text
              style={styles.checkedInText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              체크인되었습니다. 오늘도 잘 오셨어요!
            </Text>
          </View>
        ) : null}

        {/* 토스 자산 목록의 한 줄처럼: 타일 + 이름, 값은 오른쪽 끝. */}
        <ListRow
          icon="coin"
          tint="orange"
          title="내 포인트"
          value={`${(user!.total_points ?? 0).toLocaleString('ko-KR')}점`}
          valueTone="primary"
        />

        <StrengthHookBanner message={hookMessage} size="compact" />

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centeredText} maxFontSizeMultiplier={1.3}>
              오늘의 운동을 준비하고 있어요
            </Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
            <PrimaryButton label="다시 시도" variant="secondary" onPress={retry} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
              오늘의 운동 {result?.routines.length ?? 0}가지
            </Text>

            {result?.needs_trainer_review ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
                  불편하신 곳이 여러 군데라 무게를 많이 낮췄습니다. 관리사무소에 한 번 문의해
                  보시는 걸 권해 드려요.
                </Text>
              </View>
            ) : null}

            <View style={styles.list}>
              {result?.routines.map((item, index) => (
                <RoutineCard
                  key={item.routine_id}
                  item={item}
                  order={index + 1}
                  onPress={() => router.push(`/workout/${item.routine_id}`)}
                />
              ))}
            </View>

            {/* 토스 "전체" 화면의 서비스 목록처럼: 색 타일 + 제목 + 설명 + 화살표. */}
            <View style={styles.shortcuts}>
              <Text style={styles.sectionCaption} maxFontSizeMultiplier={1.2}>
                이런 것도 할 수 있어요
              </Text>
              <ListRow
                icon="chart"
                tint="green"
                title="오늘 운동 카드"
                subtitle="오늘 한 운동을 한 장으로 모아 자랑할 수 있어요"
                chevron
                onPress={() => router.push('/workout/summary')}
              />
              <ListRow
                icon="qr"
                tint="blue"
                title="기구 QR 찍기"
                subtitle="목록에 없는 기구도 사용법과 영상을 볼 수 있어요"
                chevron
                onPress={() => router.push('/workout/scan')}
              />
              <ListRow
                icon="play"
                tint="green"
                title="스트레칭 보기"
                subtitle="운동 전후 5분, 다치지 않게 풀어 주세요"
                chevron
                onPress={() => router.push('/workout/stretching')}
              />
            </View>

            <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
              운동을 누르면 하는 방법이 나옵니다.
            </Text>
          </>
        )}
      </ScrollView>
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
  headings: {
    gap: Spacing.sm,
  },
  dayBadge: {
    fontSize: FontSize.caption,
    fontWeight: '700',
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
  /** 토스의 "금융 서비스" 같은 회색 섹션 캡션 — 내용보다 조용해야 한다. */
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.grey[500],
    marginBottom: -Spacing.sm,
  },
  list: {
    gap: Spacing.sm,
  },
  checkedInBanner: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.successFaint,
  },
  checkedInText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
    textAlign: 'center',
  },
  shortcuts: {
    gap: Spacing.xs,
  },
  /** 토스의 "금융 서비스" 같은 회색 섹션 캡션 */
  sectionCaption: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.grey[500],
    marginBottom: Spacing.sm,
  },
  notice: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerFaint,
  },
  noticeText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    lineHeight: FontSize.caption * 1.55,
    color: Colors.danger,
  },
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    lineHeight: FontSize.caption * 1.55,
    color: Colors.textTertiary,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.xxxl,
  },
  centeredText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
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
});
