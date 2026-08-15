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
 * 안 긋고 면으로 구분, 이모지·아이콘 없음)을 맞추기 어렵다.
 *
 * FIT ROTEIN 시안의 문법: 오늘은 파란 원(흰 숫자), 출석한 날은 숫자 밑의
 * 파란 점. 예전엔 출석한 날을 통째로 파란 원으로 칠했는데, 한 달에 열흘씩
 * 나오는 분의 달력이 온통 파래져 오히려 오늘이 안 보였다.
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
                <View style={[styles.dayCircle, cell.isToday && styles.dayCircleToday]}>
                  <Text
                    style={[
                      styles.dayText,
                      !cell.inCurrentMonth && styles.dayTextMuted,
                      cell.isToday && styles.dayTextToday,
                    ]}
                    maxFontSizeMultiplier={1.1}>
                    {cell.date.getDate()}
                  </Text>
                </View>
                <View style={[styles.dot, attended && styles.dotOn]} />
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
    gap: 3,
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    backgroundColor: Colors.primary,
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
  dayTextToday: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
  /** 출석 점. 자리를 항상 차지해 두어야 점이 생겨도 숫자가 안 움직인다. */
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  dotOn: {
    backgroundColor: Colors.primary,
  },
});
