import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RoutineCard } from '@/components/routine-card';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { CalendarError, getRoutineForDate } from '@/features/calendar/api';
import type { RoutineItem } from '@/lib/database.types';

/** 달력에서 날짜를 눌렀을 때. 그날 한 운동을 순서대로 보여준다(읽기 전용). */
export default function CalendarDayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const { date } = useLocalSearchParams<{ date: string }>();

  const [routines, setRoutines] = useState<RoutineItem[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;

    getRoutineForDate(user!.id, new Date(date))
      .then((result) => {
        if (!cancelled) setRoutines(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof CalendarError ? error.message : '잠시 후 다시 시도해 주세요.');
      });

    return () => {
      cancelled = true;
    };
  }, [user, date]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xl }]}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {date}
        </Text>

        {errorMessage ? (
          <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : routines === null ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : routines.length === 0 ? (
          <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
            이 날은 기록이 없어요.
          </Text>
        ) : (
          <View style={styles.list}>
            {routines.map((item, index) => (
              <RoutineCard key={item.routine_id} item={item} order={index + 1} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <PrimaryButton label="달력으로" variant="secondary" onPress={() => router.back()} />
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
    fontSize: FontSize.body,
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
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.background,
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
  },
});
