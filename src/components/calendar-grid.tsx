import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import type { CalendarCell } from '@/features/calendar/date-utils';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  weeks: CalendarCell[][];
  attendedDays: ReadonlySet<string>;
  onSelectDay: (cell: CalendarCell) => void;
};

/**
 * 달력을 직접 그린다. 외부 캘린더 라이브러리를 쓰면 이 앱의 디자인 원칙(선을
 * 안 긋고 면으로 구분, 이모지·아이콘 없음)을 맞추기 어렵다. "오늘" 표시도
 * 테두리 링 대신 옅은 면으로 — 선은 최후의 수단이라는 원칙을 여기서도 지킨다.
 */
export function CalendarGrid({ weeks, attendedDays, onSelectDay }: Props) {
  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel} maxFontSizeMultiplier={1.1}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={index} style={styles.weekRow}>
          {week.map((cell) => {
            const attended = attendedDays.has(cell.key);

            return (
              <Pressable
                key={cell.key}
                onPress={() => onSelectDay(cell)}
                disabled={!cell.inCurrentMonth}
                accessibilityRole="button"
                accessibilityLabel={`${cell.date.getDate()}일${attended ? ', 출석함' : ''}`}
                style={styles.cell}>
                <View
                  style={[
                    styles.dayCircle,
                    attended && styles.dayCircleAttended,
                    !attended && cell.isToday && styles.dayCircleToday,
                  ]}>
                  <Text
                    style={[
                      styles.dayText,
                      !cell.inCurrentMonth && styles.dayTextMuted,
                      attended && styles.dayTextAttended,
                      !attended && cell.isToday && styles.dayTextToday,
                    ]}
                    maxFontSizeMultiplier={1.1}>
                    {cell.date.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textTertiary,
    paddingBottom: Spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleAttended: {
    backgroundColor: Colors.primary,
  },
  dayCircleToday: {
    backgroundColor: Colors.surface,
  },
  dayText: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  dayTextMuted: {
    color: Colors.textDisabled,
  },
  dayTextAttended: {
    color: Colors.textOnPrimary,
  },
  dayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
