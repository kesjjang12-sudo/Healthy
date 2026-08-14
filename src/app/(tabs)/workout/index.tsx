import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckMark } from '@/components/check-mark';
import { ListRow } from '@/components/list-row';
import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { StrengthHookBanner } from '@/components/strength-hook-banner';
import { WeightNudgeModal } from '@/components/weight-nudge-modal';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useCheckInListener } from '@/features/attendance/use-checkin-listener';
import { useAuthSession } from '@/features/auth/auth-session';
import { pickHookMessage } from '@/features/content/hooking-copy';
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
  const { result, isLoading, errorMessage, retry } = useDailyRoutine(user!.id);
  const { stats: visitStats, refresh: refreshVisitStats } = useVisitStats(user!.id);
  const hookMessage = useMemo(() => pickHookMessage(), []);

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

  const changeCourse = useCallback(
    async (course: RoutineCourse) => {
      setPendingCourse(course);
      setCourseError(null);
      try {
        await setRoutineCourse(course);
        retry();
      } catch {
        setCourseError('코스를 바꾸지 못했습니다. 다시 시도해 주세요.');
      } finally {
        setPendingCourse(null);
      }
    },
    [retry],
  );

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
      {/* 몸무게 기록이 7일 넘게 없으면 하루 한 번 업데이트를 권한다. */}
      <WeightNudgeModal />
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
            {/* 오늘 얼마나 왔는지. 목록만 있으면 몇 개 남았는지 세어야 한다. */}
            {routines.length > 0 ? (
              <View style={styles.progress}>
                <View style={styles.progressHead}>
                  <Text style={styles.progressLabel} maxFontSizeMultiplier={1.2}>
                    {allDone ? '오늘 운동 끝!' : '오늘의 진행'}
                  </Text>
                  <Text style={styles.progressCount} maxFontSizeMultiplier={1.2}>
                    {doneCount} / {routines.length}
                  </Text>
                </View>
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
                    ? '오늘 몫을 다 하셨습니다. 스트레칭으로 마무리하세요.'
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
                <View style={styles.courseRow}>
                  {result.course_options.map((option) => {
                    const selected = result.course === option.course;
                    return (
                      <Pressable
                        key={option.course}
                        onPress={() => void changeCourse(option.course)}
                        disabled={pendingCourse !== null}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${COURSE_LABELS[option.course]}, 약 ${option.minutes}분 코스`}
                        style={({ pressed }) => [
                          styles.courseCard,
                          selected && styles.courseCardSelected,
                          pressed && styles.courseCardPressed,
                        ]}>
                        <Text
                          style={[styles.courseName, selected && styles.courseNameSelected]}
                          maxFontSizeMultiplier={1.2}>
                          {COURSE_LABELS[option.course]}
                        </Text>
                        <Text
                          style={[styles.courseMinutes, selected && styles.courseMinutesSelected]}
                          maxFontSizeMultiplier={1.2}>
                          약 {option.minutes}분
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {courseError ? (
                  <Text style={styles.noticeError} maxFontSizeMultiplier={1.3}>
                    {courseError}
                  </Text>
                ) : (
                  <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
                    바꾸면 오늘 목록이 바로 다시 짜입니다. 이미 마친 운동은 그대로 남아요.
                  </Text>
                )}
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
                  전화번호를 한 번 눌러 주시면 그때부터 루틴이 만들어집니다.
                </Text>
              </View>
            ) : null}

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
                icon="dumbbell"
                tint="teal"
                title="기구 사용법 모아보기"
                subtitle="오늘 목록에 없는 기구도 부위별로 찾아볼 수 있어요"
                chevron
                onPress={() => router.push('/workout/guide')}
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
  progress: {
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  progressCount: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  progressFillDone: {
    backgroundColor: Colors.success,
  },
  progressHint: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  courseSection: {
    gap: Spacing.md,
  },
  courseRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  courseCard: {
    flex: 1,
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    minHeight: TouchTarget.min,
  },
  courseCardSelected: {
    backgroundColor: Colors.primary,
  },
  courseCardPressed: {
    opacity: 0.85,
  },
  courseName: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  courseNameSelected: {
    color: Colors.textOnPrimary,
  },
  courseMinutes: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  courseMinutesSelected: {
    color: Colors.textOnPrimary,
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
