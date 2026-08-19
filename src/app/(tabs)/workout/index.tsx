import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckMark } from '@/components/check-mark';
import { CourseToggle } from '@/components/course-toggle';
import { GrowthCard } from '@/components/growth-card';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { ShortcutTile } from '@/components/shortcut-tile';
import { WeightNudgeModal } from '@/components/weight-nudge-modal';
import { WittyLoading } from '@/components/witty-loading';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useCheckInListener } from '@/features/attendance/use-checkin-listener';
import { useAuthSession } from '@/features/auth/auth-session';
import { pickGreeting } from '@/features/content/greeting';
import { setRoutineCourse } from '@/features/routine/api';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';
import { useVisitStats } from '@/features/routine/use-visit-stats';
import type { RoutineCourse } from '@/lib/database.types';

const COURSE_LABELS: Record<RoutineCourse, string> = {
  short: '짧게',
  long: '충분히',
};

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
  const { result, isLoading, errorMessage, retry, refresh } = useDailyRoutine(user!.id);
  const { stats: visitStats, refresh: refreshVisitStats } = useVisitStats(user!.id);

  // 운동을 하나 마치고 돌아오면 상세 화면이 이름과 점수를 붙여 보낸다.
  // 목록의 완료 표시만으로는 "방금 그게 기록됐다"는 확인이 약하다.
  const { completed: justCompleted, points: justEarned } = useLocalSearchParams<{
    completed?: string;
    points?: string;
  }>();

  // 안내는 잠깐만 띄운다. 경로 파라미터는 지우지 않으면 계속 남아서, 나중에
  // 탭을 다시 열었을 때 방금 마친 것처럼 보인다(체크인 안내와 같은 이유).
  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => router.setParams({ completed: '', points: '' }), 6_000);
    return () => clearTimeout(timer);
  }, [justCompleted, router]);

  const [courseError, setCourseError] = useState<string | null>(null);
  const [pendingCourse, setPendingCourse] = useState<RoutineCourse | null>(null);

  const routines = result?.routines ?? [];
  const doneCount = routines.filter((item) => item.is_completed).length;
  const allDone = routines.length > 0 && doneCount === routines.length;

  /**
   * 코스 바꾸기.
   *
   * refresh(조용히 갈아 끼우기)를 쓴다. 예전엔 retry 를 불러서 화면이 통째로
   * 로딩으로 바뀌었다가 돌아왔다 — 짧게↔충분히 를 오갈 때마다 새로고침처럼
   * 번쩍인 게 이것이다. 다 읽을 때까지 기다렸다가 pending 을 푸는 것도 같은
   * 이유다. 먼저 풀면 아직 옛 목록인데 토글만 새 값으로 앉아 있게 된다.
   */
  const changeCourse = useCallback(
    async (course: RoutineCourse) => {
      setPendingCourse(course);
      setCourseError(null);
      try {
        await setRoutineCourse(course);
        await refresh();
      } catch {
        setCourseError('코스를 바꾸지 못했어요. 다시 시도해 주세요.');
      } finally {
        setPendingCourse(null);
      }
    },
    [refresh],
  );

  // 인사말은 출석일 수가 도착하면 한 번 더 고른다("첫 방문이시네요"를 제대로
  // 띄우려면 그 값이 있어야 한다). 그 뒤로는 이 화면에 있는 동안 안 바뀐다 —
  // 읽는 도중에 글자가 바뀌면 처음부터 다시 읽게 된다.
  const greeting = useMemo(
    () =>
      pickGreeting({
        // 본인만 보는 인사말이라 실명을 쓴다. 닉네임은 랭킹에 노출되는 값이라
        // 카카오·구글이 준 이름을 거기 채우지 않는다(bootstrap_oauth_profile 참고).
        name: user!.profile_data?.real_name ?? user!.profile_data?.nickname,
        visitDays: visitStats?.total_days ?? null,
      }),
    [user, visitStats],
  );

  // 태블릿에서 체크인이 찍히면 여기서 바로 받아 화면을 맞춘다.
  // 루틴까지 다시 부르는 이유: 오늘 어느 헬스장에 체크인했는지에 따라 그
  // 헬스장 기구로 루틴이 짜이기 때문이다(이사 대응).
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  const handleCheckIn = useCallback(() => {
    setJustCheckedIn(true);
    refreshVisitStats();
    void refresh();
  }, [refreshVisitStats, refresh]);

  useCheckInListener(user!.id, handleCheckIn);

  // 운동을 마치고 돌아오면 이 화면은 그동안 계속 떠 있던 상태다. 포인트를 다시
  // 읽지 않으면 방금 받은 점수가 안 보여서, 저장이 안 된 줄 알고 같은 운동을
  // 또 하게 된다. 첫 진입은 위 훅들이 이미 불러오므로 건너뛴다.
  //
  // 루틴 목록은 여기서 안 부른다 — useDailyRoutine 이 자기 useFocusEffect 에서
  // 조용히 다시 읽는다. 예전엔 여기서 retry 까지 불러 같은 요청이 두 번 나갔고,
  // 그중 하나가 화면을 로딩으로 갈아치워서 돌아올 때마다 번쩍였다.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      void refreshProfile();
    }, [refreshProfile]),
  );

  // 안내는 잠깐만 띄운다. 계속 남아 있으면 다음에 열었을 때 방금 찍은 것처럼 보인다.
  useEffect(() => {
    if (!justCheckedIn) return;
    const timer = setTimeout(() => setJustCheckedIn(false), 6_000);
    return () => clearTimeout(timer);
  }, [justCheckedIn]);

  return (
    <View style={styles.screen}>
      {/* 몸무게 기록이 7일 넘게 없으면 하루 한 번 업데이트를 권한다. */}
      <WeightNudgeModal />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {greeting.headline}
          </Text>
          <Text style={styles.greetingSub} maxFontSizeMultiplier={1.3}>
            {greeting.sub}
          </Text>

        </View>

        {justCheckedIn ? (
          <View style={styles.checkedInBanner}>
            <Text
              style={styles.checkedInText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              체크인됐어요. 오늘도 잘 오셨어요!
            </Text>
          </View>
        ) : null}

        {/* 방금 마친 운동. 목록의 체크 표시만으로는 "기록됐다"는 확인이
            약해서, 무엇을 마쳤고 몇 점을 받았는지 한 줄로 되짚어 준다. */}
        {justCompleted ? (
          <View style={styles.doneBanner}>
            <CheckMark size={28} thickness={3} />
            <Text
              style={styles.doneBannerText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {justCompleted} 완료!{justEarned ? ` +${justEarned}점` : ''}
            </Text>
          </View>
        ) : null}

        {/* 포인트를 경험치로 읽어 명예 호칭을 올린다. 숫자만 있던 "내 포인트"
            줄이 "다음 호칭까지 얼마"라는 목표가 있는 카드가 됐다. */}
        <GrowthCard xp={user!.total_points ?? 0} />

        {isLoading ? (
          <WittyLoading />
        ) : errorMessage ? (
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
              maxFontSizeMultiplier={1.3}
              accessibilityLiveRegion="polite">
              {errorMessage}
            </Text>
            <PrimaryButton label="다시 시도" onPress={retry} />
          </View>
        ) : (
          <>
            {/* 오늘 얼마나 왔는지. 목록만 있으면 몇 개 남았는지 세어야 한다. */}
            {routines.length > 0 ? (
              <View style={styles.progress}>
                {/* 시안 구조: 라벨 → 큰 카운트 → 진행 바 → 힌트, 전부 왼쪽 정렬. */}
                <Text style={styles.progressLabel} maxFontSizeMultiplier={1.2}>
                  {allDone ? '오늘 운동 끝!' : '오늘의 운동'}
                </Text>
                <Text style={styles.progressCount} maxFontSizeMultiplier={1.2}>
                  {doneCount}
                  <Text style={styles.progressCountSub}> / {routines.length} 완료</Text>
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      allDone && styles.progressFillDone,
                      { width: `${(doneCount / routines.length) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressHint} maxFontSizeMultiplier={1.3}>
                  {allDone
                    ? '오늘 몫을 다 하셨어요. 스트레칭으로 마무리하세요.'
                    : result?.estimated_minutes
                      ? `다 하시면 약 ${result.estimated_minutes}분 걸려요.`
                      : ''}
                </Text>
              </View>
            ) : null}

            {/* 코스 고르기. 처음 오신 분에게 여덟 가지를 던지면 질리고, 늘
                오시는 분에게 네 가지는 짧다. 그날 시간에 맞춰 고르게 한다. */}
            {result && result.course_options.length > 1 ? (
              <View style={styles.courseSection}>
                <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
                  오늘은 얼마나 하실 건가요?
                </Text>
                {/* 카드 두 장 대신 FIT ROTEIN 시안의 슬라이딩 토글.
                    course_options 는 short/long 두 가지뿐이다(COURSE_LABELS 참고). */}
                <CourseToggle
                  options={[
                    {
                      value: result.course_options[0].course,
                      label: COURSE_LABELS[result.course_options[0].course],
                      sub: `약 ${result.course_options[0].minutes}분`,
                    },
                    {
                      value: result.course_options[1].course,
                      label: COURSE_LABELS[result.course_options[1].course],
                      sub: `약 ${result.course_options[1].minutes}분`,
                    },
                  ]}
                  // 서버 응답을 기다리지 않고 누른 쪽으로 먼저 미끄러진다.
                  // result.course 만 보면 목록을 다시 받을 때까지 썸이 그대로라
                  // 눌러도 아무 일 없는 것처럼 보인다. 실패하면 pendingCourse 가
                  // 풀리면서 서버 값으로 돌아온다.
                  value={pendingCourse ?? result.course}
                  onChange={(course) => void changeCourse(course)}
                  busy={pendingCourse !== null}
                />
                {courseError ? (
                  <Text style={styles.noticeError} maxFontSizeMultiplier={1.3}>
                    {courseError}
                  </Text>
                ) : pendingCourse ? (
                  <Text
                    style={styles.footNote}
                    maxFontSizeMultiplier={1.3}
                    accessibilityLiveRegion="polite">
                    오늘 목록을 다시 짜고 있어요…
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
              오늘의 운동 {routines.length}가지
            </Text>

            {/* 루틴은 "내가 소속된 헬스장에 있는 기구"로만 짜인다. 태블릿에 한
                번도 번호를 안 찍은 계정은 소속이 없어 기구가 0건으로 잡히고,
                여기가 통째로 빈다. 예전엔 "0가지"만 뜨고 이유가 없어서 고장난
                것처럼 보였다. */}
            {result && result.routines.length === 0 ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
                  아직 다니는 헬스장이 등록되지 않아 오늘의 운동을 짤 수 없어요. 입구 태블릿에
                  전화번호를 한 번 눌러 주시면 그때부터 루틴이 만들어져요.
                </Text>
              </View>
            ) : null}

            {result?.needs_trainer_review ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
                  {routines.length > 0
                    ? '아프신 곳을 피해서 오늘 운동을 짰어요. 부상 위험이 큰 동작은 빼고 무게도 낮춰 잡았으니, 하시면서 편해지면 조금씩 올려 드릴게요.'
                    : '아프신 곳이 많아 오늘은 안전하게 할 수 있는 운동을 찾지 못했어요. 가볍게 걷기나 스트레칭으로 몸을 풀어 주세요.'}
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

            {/* 바로가기. 원래 설명 달린 목록 행 4줄이었는데, 그 덩치가 화면의
                주인공인 "오늘의 운동"보다 커져서 타일 한 줄로 줄였다.
                "오늘 운동 카드"는 운동을 하나라도 마친 뒤에만 나타난다 —
                아무것도 안 했는데 자랑 카드부터 권하는 건 이상하고,
                다 마친 순간 새로 나타나는 게 작은 보상이 된다. */}
            <View style={styles.shortcuts}>
              <Text style={styles.sectionCaption} maxFontSizeMultiplier={1.2}>
                이런 것도 할 수 있어요
              </Text>
              {doneCount > 0 ? (
                <ListRow
                  icon="chart"
                  tint="green"
                  title="오늘 운동 카드"
                  subtitle="오늘 한 운동을 한 장으로 모아 자랑할 수 있어요"
                  chevron
                  onPress={() => router.push('/workout/summary')}
                />
              ) : null}
              <View style={styles.shortcutTiles}>
                {/* 셋을 같은 파랑으로 두니 한 덩어리로 보여 무엇이 무엇인지
                    구분이 안 됐다(오너 피드백). 성격에 맞는 색을 따로 준다 —
                    배우기는 초록, 찍기는 앱 주색인 파랑, 몸풀기는 주황. */}
                <ShortcutTile
                  icon="dumbbell"
                  tint="green"
                  label="기구 사용법"
                  accessibilityLabel="기구 사용법 모아보기. 오늘 목록에 없는 기구도 부위별로 찾아볼 수 있어요"
                  onPress={() => router.push('/workout/guide')}
                />
                <ShortcutTile
                  icon="qr"
                  tint="blue"
                  label="기구 QR 찍기"
                  accessibilityLabel="기구 QR 찍기. 목록에 없는 기구도 사용법과 영상을 볼 수 있어요"
                  onPress={() => router.push('/workout/scan')}
                />
                <ShortcutTile
                  icon="play"
                  tint="orange"
                  label="스트레칭"
                  accessibilityLabel="스트레칭 보기. 운동 전후 5분, 다치지 않게 풀어 주세요"
                  onPress={() => router.push('/workout/stretching')}
                />
              </View>
            </View>

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
    // 단락 사이는 일부러 넉넉하게 — 붙어 있으면 화면이 빽빽해 보인다.
    gap: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    lineHeight: FontSize.title * 1.3,
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  greetingSub: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  pointsLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  /** 소분류 제목. 회색이면 흐려서 안 읽힌다는 피드백으로 검정으로 올렸다. */
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
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
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.successFaint,
  },
  doneBannerText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.success,
  },
  /** FIT ROTEIN 시안의 히어로 카드 — 파란 면 위에 흰 글씨·흰 진행 바. */
  progress: {
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  progressLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: 'rgba(255,255,255,0.8)',
  },
  progressCount: {
    // 시안 히어로 카드의 카운트(36px).
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textOnPrimary,
    fontVariant: ['tabular-nums'],
  },
  progressCountSub: {
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  progressTrack: {
    height: 12,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
  },
  progressFillDone: {
    backgroundColor: Colors.background,
  },
  progressHint: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: 'rgba(255,255,255,0.9)',
  },
  courseSection: {
    gap: Spacing.md,
  },
  noticeError: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.danger,
  },
  shortcuts: {
    gap: Spacing.xs,
  },
  /** 바로가기 타일 3개를 한 줄에 나란히 */
  shortcutTiles: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  /** 토스의 "금융 서비스" 같은 회색 섹션 캡션 */
  sectionCaption: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.grey[500],
    marginBottom: Spacing.md,
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
