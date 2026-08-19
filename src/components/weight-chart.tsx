import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Text } from '@/components/app-text';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import { buildWeightTrend, describeWeightTrend, formatMonthDay } from '@/features/body/weight-trend';
import type { BodyWeightLog } from '@/lib/database.types';

/** 눈금 라벨이 들어가는 왼쪽 여백. "108kg" 까지 들어간다. */
const AXIS_WIDTH = 56;
const CHART_HEIGHT = 180;
/** 가장자리 점이 잘리지 않게 띄우는 값. 강조한 마지막 점 반지름보다 커야 한다. */
const INSET = 14;

const DOT_RADIUS = 5;
const LAST_DOT_RADIUS = 9;
/** 점이 빽빽해지면 서로 붙어 선이 뭉개진다. 이보다 많으면 점을 줄인다. */
const DENSE_POINTS = 14;

type Props = {
  /** get_body_status 가 주는 그대로(최신순). 정렬은 안에서 한다. */
  logs: BodyWeightLog[];
};

/**
 * 몸무게 추이 그래프. 분석 탭 "내 몸" 섹션에서 기록 목록 위에 놓인다.
 *
 * 숫자 목록만으로는 "빠지고 있는지"가 안 보인다 — 시니어 사용자에게 62.4, 62.9,
 * 62.1 을 나열해 주고 흐름을 읽으라고 하는 것은 무리다. 선으로 그으면 한눈에
 * 보인다.
 *
 * 색은 파랑 하나만 쓴다. 늘어난 구간을 빨강으로 칠하고 싶은 유혹이 있는데,
 * 그러면 그래프가 사람을 혼낸다. 몸무게는 원래 오르내리는 것이고, 혼나면
 * 기록을 그만둔다. 목록 쪽에서 감소만 초록으로 표시하는 것과 같은 태도다.
 */
export function WeightChart({ logs }: Props) {
  const [width, setWidth] = useState(0);

  const trend = useMemo(
    () => buildWeightTrend(logs, width, CHART_HEIGHT, INSET),
    [logs, width],
  );

  if (logs.length === 0) return null;

  // 하루치만 있어도 그래프 틀을 보여준다 — 점 하나가 찍혀 있어야 "여기에
  // 쌓인다"는 것이 보이고, 내일 또 재고 싶어진다(오너 피드백).
  if (logs.length === 1) {
    const only = logs[0];
    return (
      <View
        style={styles.wrap}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${formatMonthDay(only.log_date)} ${only.weight_kg}kg. 기록이 하루치예요.`}>
        <View style={styles.plotRow}>
          <View style={styles.axis}>
            <Text style={styles.axisLabel} maxFontSizeMultiplier={1.2}>
              {only.weight_kg}kg
            </Text>
            <Text style={styles.axisLabel} maxFontSizeMultiplier={1.2}>
              {''}
            </Text>
          </View>
          <View
            style={styles.plot}
            onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
            {width > 0 ? (
              <Svg width={width} height={CHART_HEIGHT}>
                <Line
                  x1={0}
                  y1={CHART_HEIGHT / 2}
                  x2={width}
                  y2={CHART_HEIGHT / 2}
                  stroke={Colors.grey[300]}
                  strokeWidth={2}
                  strokeDasharray="5,5"
                />
                <Circle
                  cx={INSET}
                  cy={CHART_HEIGHT / 2}
                  r={LAST_DOT_RADIUS}
                  fill={Colors.primary}
                />
              </Svg>
            ) : null}
          </View>
        </View>
        <Text style={styles.singleLog} maxFontSizeMultiplier={1.3}>
          {formatMonthDay(only.log_date)}에 시작하셨어요. 며칠 더 재면 선이 그려져요.
        </Text>
      </View>
    );
  }

  const ordered = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const dotRadius = ordered.length > DENSE_POINTS ? 3 : DOT_RADIUS;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeWeightTrend(logs)}>
      <View style={styles.plotRow}>
        <View style={styles.axis}>
          <Text style={styles.axisLabel} maxFontSizeMultiplier={1.2}>
            {trend ? `${trend.maxKg}kg` : ''}
          </Text>
          <Text style={styles.axisLabel} maxFontSizeMultiplier={1.2}>
            {trend ? `${trend.minKg}kg` : ''}
          </Text>
        </View>

        <View
          style={styles.plot}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
          {trend ? (
            <Svg width={width} height={CHART_HEIGHT}>
              {/* 처음 잰 몸무게. 지금 선이 이 위에 있는지 아래에 있는지가 곧 "처음보다" 값이다. */}
              <Line
                x1={0}
                y1={trend.baselineY}
                x2={width}
                y2={trend.baselineY}
                stroke={Colors.grey[300]}
                strokeWidth={2}
                strokeDasharray="5,5"
              />

              {trend.segments.map((segment) => (
                <Line
                  key={`${segment.x1}-${segment.y1}`}
                  x1={segment.x1}
                  y1={segment.y1}
                  x2={segment.x2}
                  y2={segment.y2}
                  stroke={Colors.primary}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={segment.isGap ? '6,7' : undefined}
                />
              ))}

              {trend.points.map((point, index) => {
                const isLast = index === trend.points.length - 1;
                return (
                  <Circle
                    key={point.logDate}
                    cx={point.x}
                    cy={point.y}
                    r={isLast ? LAST_DOT_RADIUS : dotRadius}
                    fill={Colors.primary}
                    // 마지막(오늘에 가장 가까운) 점만 흰 테두리로 키워 둔다.
                    // 시선이 먼저 닿아야 하는 곳이 "지금 어디인가"다.
                    stroke={isLast ? Colors.background : undefined}
                    strokeWidth={isLast ? 4 : undefined}
                  />
                );
              })}
            </Svg>
          ) : null}
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel} maxFontSizeMultiplier={1.2}>
          {formatMonthDay(ordered[0].log_date)}
        </Text>
        <Text style={styles.dateLabel} maxFontSizeMultiplier={1.2}>
          {formatMonthDay(ordered[ordered.length - 1].log_date)}
        </Text>
      </View>

      <Text style={styles.legend} maxFontSizeMultiplier={1.3}>
        회색 점선은 처음 잰 몸무게예요. 파란 점선은 한동안 못 잰 기간이고요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
    // 위 운동 추세 차트와 같은 옷 — 회색 면 위의 그래프. 흰 바탕에 선만 있으면
    // 어디부터 어디까지가 그래프인지 경계가 없다.
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  plotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  axis: {
    width: AXIS_WIDTH,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  axisLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  plot: {
    flex: 1,
    height: CHART_HEIGHT,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: AXIS_WIDTH + Spacing.sm,
  },
  dateLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  singleLog: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  legend: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    lineHeight: FontSize.caption * 1.55,
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
