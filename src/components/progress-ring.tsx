import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/**
 * 작은 원형 게이지. 유산소 국토종주 링(journey-ring)의 "목표를 향해 차오르는"
 * 느낌만 떼어 온 부품이다 — 국토 실루엣·배낭 배지 없이 링과 중앙 내용만.
 *
 * 12시에서 시작해 시계 방향으로 찬다. 목표를 넘으면 초록으로 바뀐다.
 */
export function ProgressRing({
  progress,
  size = 168,
  stroke = 14,
  children,
}: {
  /** 0~1. 1 이상이면 꽉 찬 초록 링. */
  progress: number;
  size?: number;
  stroke?: number;
  /** 링 중앙에 올라갈 내용. */
  children?: React.ReactNode;
}) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const done = progress >= 1;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.grey[100]}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={done ? Colors.success : Colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          // 진행 0 이어도 점 하나는 찍는다 — 빈 링은 고장처럼 보인다.
          strokeDashoffset={circumference * (1 - Math.max(clamped, 0.015))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
