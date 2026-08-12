import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, touch } = useSession();
  const { result, isLoading, errorMessage, retry } = useDailyRoutine(user.id);

  const name = user.profile_data?.nickname ?? maskPhoneNumber(user.phone_number);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}
        onScrollBeginDrag={touch}>
        <View style={styles.headings}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            {name} 님{'\n'}오늘도 나오셨네요
          </Text>
        </View>

        <View style={styles.points}>
          <Text style={styles.pointsLabel} maxFontSizeMultiplier={1.2}>
            내 포인트
          </Text>
          <Text style={styles.pointsValue} maxFontSizeMultiplier={1.2}>
            {(user.total_points ?? 0).toLocaleString('ko-KR')}점
          </Text>
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
                  onPress={() => {
                    touch();
                    router.push(`/routine/${item.routine_id}`);
                  }}
                />
              ))}
            </View>

            <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
              운동을 누르면 하는 방법이 나옵니다. 기구 앞 QR 을 휴대폰으로 찍으셔도 됩니다.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="운동 마치기" variant="secondary" onPress={signOut} />
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
  pointsValue: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    marginBottom: -Spacing.sm,
  },
  list: {
    gap: Spacing.sm,
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
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
});
