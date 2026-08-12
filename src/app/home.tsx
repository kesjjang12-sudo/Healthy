import { Redirect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { maskPhoneNumber } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';
import { useDailyRoutine } from '@/features/routine/use-daily-routine';
import type { User } from '@/lib/database.types';

/**
 * 체크인 직후 태블릿에 뜨는 화면. 오늘 할 운동을 순서대로 보여준다.
 * 기구별 상세(영상, 완료 처리)는 폰 앱에서 QR 을 찍었을 때 이어진다.
 */
export default function HomeScreen() {
  const { user, isRestoring } = useSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;
  if (!user.profile_data?.onboarded_at) return <Redirect href="/onboarding" />;

  return <TodayRoutine user={user} />;
}

function TodayRoutine({ user }: { user: User }) {
  const insets = useSafeAreaInsets();
  const { signOut, touch } = useSession();
  const { result, isLoading, errorMessage, retry } = useDailyRoutine(user.id);

  const greeting = user.profile_data?.nickname
    ? `${user.profile_data.nickname}님`
    : `${maskPhoneNumber(user.phone_number)} 님`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}
      onScrollBeginDrag={touch}>
      <View style={styles.header}>
        <Text style={styles.greeting} maxFontSizeMultiplier={1.2}>
          {greeting}, 오늘도 나오셨네요!
        </Text>
        <View style={styles.points}>
          <Text style={styles.pointsLabel} maxFontSizeMultiplier={1.2}>
            내 포인트
          </Text>
          <Text style={styles.pointsValue} maxFontSizeMultiplier={1.2}>
            {(user.total_points ?? 0).toLocaleString('ko-KR')}점
          </Text>
        </View>
      </View>

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
          <PrimaryButton label="다시 시도" onPress={retry} />
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>
            오늘의 운동 {result?.routines.length ?? 0}가지
          </Text>

          {result?.needs_trainer_review ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText} maxFontSizeMultiplier={1.3}>
                불편하신 곳이 여러 군데라 무게를 많이 낮췄습니다. 관리사무소에 한 번
                문의해 보시는 걸 권해 드려요.
              </Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {result?.routines.map((item, index) => (
              <RoutineCard key={item.routine_id} item={item} order={index + 1} />
            ))}
          </View>

          <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
            기구 앞 QR 을 휴대폰으로 찍으면 하는 방법을 영상으로 보실 수 있어요.
          </Text>
        </>
      )}

      <PrimaryButton label="운동 마치기" variant="ghost" onPress={signOut} />
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
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.md,
  },
  greeting: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  points: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  pointsLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pointsValue: {
    fontSize: FontSize.label,
    fontWeight: '800',
    color: Colors.primary,
  },
  sectionTitle: {
    fontSize: FontSize.label,
    fontWeight: '800',
    color: Colors.text,
  },
  list: {
    gap: Spacing.md,
  },
  notice: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerFaint,
  },
  noticeText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.danger,
    lineHeight: FontSize.body * 1.5,
  },
  footNote: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: FontSize.body * 1.5,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
  },
  centeredText: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  errorBox: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerFaint,
  },
  errorText: {
    fontSize: FontSize.body,
    fontWeight: '700',
    color: Colors.danger,
    textAlign: 'center',
  },
});
