import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarGrid } from '@/components/calendar-grid';
import { Icon } from '@/components/icon';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';
import { CalendarError, getAttendanceDays } from '@/features/calendar/api';
import { formatMonthLabel, getMonthGrid, type CalendarCell } from '@/features/calendar/date-utils';

/** 달력 탭. 출석한 날에 점이 찍히고, 날짜를 누르면 그날 한 운동을 볼 수 있다. */
export default function CalendarTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [attendedDays, setAttendedDays] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const weeks = useMemo(() => getMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getAttendanceDays(user!.id, cursor)
      .then((days) => {
        if (!cancelled) setAttendedDays(days);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof CalendarError ? error.message : '잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, cursor]);

  const goToDay = (cell: CalendarCell) => {
    router.push(`/calendar/${cell.key}`);
  };

  const changeMonth = (delta: number) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.xxl }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        달력
      </Text>

      <View style={styles.monthNav}>
        {/* FIT ROTEIN 시안의 ‹ › 화살표 버튼. 글자 버튼("이전 달")보다 조용해서
            달 이름이 주인공으로 남는다. */}
        <Pressable
          onPress={() => changeMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="이전 달"
          style={({ pressed }) => [styles.monthArrow, pressed && styles.monthArrowPressed]}>
          <Icon name="chevron-right" size={20} color={Colors.textSecondary} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.monthLabel} maxFontSizeMultiplier={1.2}>
          {formatMonthLabel(cursor.getFullYear(), cursor.getMonth())}
        </Text>
        <Pressable
          onPress={() => changeMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="다음 달"
          style={({ pressed }) => [
            styles.monthArrow,
            styles.monthArrowNext,
            pressed && styles.monthArrowPressed,
          ]}>
          <Icon name="chevron-right" size={20} color={Colors.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : errorMessage ? (
        <Text style={styles.errorText} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : (
        <CalendarGrid weeks={weeks} attendedDays={attendedDays} onSelectDay={goToDay} />
      )}

      <Text style={styles.footNote} maxFontSizeMultiplier={1.3}>
        파란 점이 찍힌 날이 출석한 날이고, 파란 원이 오늘이에요. 날짜를 누르면 그날 한 운동을 볼
        수 있어요.
      </Text>
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
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.grey[200],
    // 왼쪽 화살표는 chevron-right 를 뒤집어 쓴다.
    transform: [{ scaleX: -1 }],
  },
  monthArrowNext: {
    transform: [{ scaleX: 1 }],
  },
  monthArrowPressed: {
    backgroundColor: Colors.surface,
  },
  monthLabel: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
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
  footNote: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
