import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import type { TrendPoint } from '@/lib/database.types';

type Props = {
  points: TrendPoint[];
  /** 'day' 면 막대 하나가 하루, 'week' 면 7일 */
  bucket: 'day' | 'week';
};

/** 막대가 올라갈 수 있는 최대 높이. 시니어 화면이라 넉넉하게 잡는다. */
const TRACK_HEIGHT = 132;

/**
 * 0 인 날도 자리는 지킨다. 아무것도 안 그리면 쉰 날이 그래프에서 사라져
 * "빠짐없이 했다"로 보이는데, 그건 사실과 다르다.
 */
const EMPTY_BAR_HEIGHT = 4;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "2026-08-14" → 그 날짜의 로컬 Date. new Date(문자열)은 UTC 로 읽어 하루가 밀린다. */
function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function barLabel(point: TrendPoint, bucket: 'day' | 'week'): string {
  const start = parseDateKey(point.bucket_start);
  // 하루짜리는 요일이 제일 빨리 읽힌다("어제가 화요일이었지").
  if (bucket === 'day') return WEEKDAYS[start.getDay()];
  // 주 단위는 시작 날짜로 "8/3 주"임을 알린다.
  return `${start.getMonth() + 1}/${start.getDate()}`;
}

function spokenLabel(point: TrendPoint, bucket: 'day' | 'week'): string {
  const start = parseDateKey(point.bucket_start);
  const when =
    bucket === 'day'
      ? `${start.getMonth() + 1}월 ${start.getDate()}일 ${WEEKDAYS[start.getDay()]}요일`
      : `${start.getMonth() + 1}월 ${start.getDate()}일부터 일주일`;

  if (point.total_sets === 0) return `${when}, 쉬었습니다`;
  return `${when}, ${point.total_sets}세트`;
}

/**
 * 운동량 추이 막대그래프.
 *
 * 차트 라이브러리를 넣지 않고 View 로 그린다. 막대는 결국 둥근 사각형이라
 * SVG 로 그릴 이유가 없고, 라이브러리를 하나 더 들이면 글자 크기 설정
 * (maxFontSizeMultiplier)과 색 토큰을 그쪽 규칙에 다시 맞춰야 한다.
 *
 * 축·눈금선은 일부러 없다. 정확한 값을 읽는 그래프가 아니라 "요즘 꾸준한가"를
 * 한눈에 보는 그림이라, 선이 늘면 오히려 읽기 어려워진다. 대신 막대 위에
 * 숫자를 직접 적는다.
 */
export function TrendChart({ points, bucket }: Props) {
  // 전부 0 이면 나누기 0 이 된다. 최소 1 로 두면 모든 막대가 바닥에 깔린다.
  const max = Math.max(1, ...points.map((point) => point.total_sets));

  return (
    <View style={styles.chart}>
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        const filled = point.total_sets > 0;
        const height = filled
          ? Math.max(10, Math.round((point.total_sets / max) * TRACK_HEIGHT))
          : EMPTY_BAR_HEIGHT;

        return (
          <View
            key={point.bucket_start}
            style={styles.column}
            accessible
            accessibilityLabel={spokenLabel(point, bucket)}>
            <Text style={[styles.value, !filled && styles.valueEmpty]} maxFontSizeMultiplier={1.1}>
              {filled ? point.total_sets : ''}
            </Text>

            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { height },
                  !filled && styles.barEmpty,
                  // 맨 오른쪽은 오늘(또는 이번 주)이다. 진하게 해서 지금 어디쯤
                  // 와 있는지 눈이 먼저 찾게 한다.
                  filled && isLast && styles.barToday,
                ]}
              />
            </View>

            <Text
              style={[styles.label, isLast && styles.labelToday]}
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}>
              {barLabel(point, bucket)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  track: {
    // 막대 높이가 제각각이어도 바닥선이 한 줄로 맞아야 비교가 된다.
    height: TRACK_HEIGHT,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '72%',
    minWidth: 14,
    borderRadius: Radius.sm,
    backgroundColor: Colors.grey[300],
  },
  barToday: {
    backgroundColor: Colors.primary,
  },
  barEmpty: {
    width: '52%',
    borderRadius: Radius.full,
    backgroundColor: Colors.grey[200],
  },
  value: {
    fontSize: FontSize.caption,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    // 값이 없는 칸도 같은 높이를 차지해야 막대 바닥이 어긋나지 않는다.
    minHeight: FontSize.caption * 1.3,
  },
  valueEmpty: {
    color: 'transparent',
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  labelToday: {
    fontWeight: '700',
    color: Colors.text,
  },
});
