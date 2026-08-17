import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/app-text';
import { Colors, FontSize, IconTint, LetterSpacing } from '@/constants/theme';

/**
 * 국토 종주 둘레길의 원형 타이머 링.
 *
 * 스마트워치 활동 링처럼 오늘의 진행(흐른 시간 / 목표 시간)이 파랗게 차오르고,
 * 링 안에는 국토 실루엣이 옅은 선으로 깔린다. 게이지 끝(선발대)에는 등산
 * 배낭을 멘 배지가 붙어 살짝 총총거린다 — 숫자 시계만 보며 버티는 20분을
 * "서울에서 강릉 가는 길"로 바꾸는 화면이다.
 */

const SIZE = 300;
const STROKE = 16;
const R = (SIZE - STROKE) / 2 - 6;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BADGE = 52;

export function JourneyRing({
  elapsedSeconds,
  targetMinutes,
  journeyKm,
  totalKm,
  children,
}: {
  elapsedSeconds: number;
  targetMinutes: number;
  journeyKm: number;
  totalKm: number;
  /** 링 중앙에 올라갈 내용(시계 등). 링은 자리만 잡는다. */
  children: React.ReactNode;
}) {
  const progress = Math.min(1, elapsedSeconds / (targetMinutes * 60));

  // 배낭 배지의 총총거림. 진행값과 무관하게 계속 돈다.
  const [bob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  // 선발대 배지의 위치: 12시에서 시작해 시계 방향으로 progress 만큼.
  const angle = -Math.PI / 2 + progress * 2 * Math.PI;
  const cx = SIZE / 2 + R * Math.cos(angle);
  const cy = SIZE / 2 + R * Math.sin(angle);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={`목표 ${targetMinutes}분 중 ${Math.round(progress * 100)}% 지나갔습니다. 종주 ${totalKm}km 중 ${journeyKm}km 지점입니다.`}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <LinearGradient id="journeyGauge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#55A4FF" />
            <Stop offset="1" stopColor={Colors.primary} />
          </LinearGradient>
        </Defs>

        {/* 은은한 국토 실루엣 + 제주. 링의 배경 장식이라 아주 옅게 깐다. */}
        <Path
          d="M139 66 C147 61 159 62 166 67 C174 71 172 80 179 84 C187 88 192 96 191 105
             C189 113 195 118 197 126 C201 137 197 146 192 154 C186 162 188 171 181 178
             C174 185 165 183 158 190 C152 197 142 195 136 190 C129 185 130 175 125 170
             C118 163 113 154 116 145 C118 137 113 130 114 121 C116 111 122 106 124 96
             C125 87 130 82 130 75 C130 70 133 68 139 66 Z"
          stroke="rgba(23,23,25,0.09)"
          strokeWidth={2.2}
          fill="none"
          strokeLinejoin="round"
        />
        <Ellipse cx={144} cy={207} rx={11} ry={5} stroke="rgba(23,23,25,0.09)" strokeWidth={2.2} fill="none" />
        {/* 지나온 길: 파란 점선 트레일 */}
        <Path
          d="M134 184 C141 167 130 154 138 140 C146 127 141 114 151 102 C158 94 166 92 174 96"
          stroke="rgba(0,102,255,0.30)"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray="1 7"
          fill="none"
        />

        {/* 트랙 */}
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#EDF0F4" strokeWidth={STROKE} fill="none" />
        {/* 진행 게이지: 12시에서 시계 방향 */}
        {progress > 0 ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke="url(#journeyGauge)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE * progress} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        ) : null}
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {children}
      </View>

      {/* 선발대: 등산 배낭 배지 */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.badge,
          { left: cx - BADGE / 2, top: cy - BADGE / 2, transform: [{ translateY: bobY }] },
        ]}>
        <BackpackIcon />
      </Animated.View>
    </View>
  );
}

/** 창작 아이콘: 돗자리를 만 등산 배낭. 파랑 몸통 + 주황 매트·버클. */
function BackpackIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 32 32">
      <Rect x={8} y={3.5} width={16} height={5} rx={2.5} fill={IconTint.orange} />
      <Path d="M11 3.5v5 M16 3.5v5 M21 3.5v5" stroke="#C46F00" strokeWidth={1.3} />
      <Path
        d="M8 12 C8 9.2 10.2 7.5 13 7.5 h6 C21.8 7.5 24 9.2 24 12 v11 c0 2.5 -2 4.5 -4.5 4.5 h-7 C10 27.5 8 25.5 8 23 Z"
        fill={Colors.primary}
      />
      <Path
        d="M9.5 13.5 h13 v3.5 c0 1.4 -1.1 2.5 -2.5 2.5 h-8 c-1.4 0 -2.5 -1.1 -2.5 -2.5 Z"
        fill="#FFFFFF"
        opacity={0.92}
      />
      <Rect x={14.6} y={16.4} width={2.8} height={4.6} rx={1.2} fill={IconTint.orange} />
      <Path d="M11.5 21.5 h9 v3 c0 1.1 -0.9 2 -2 2 h-5 c-1.1 0 -2 -0.9 -2 -2 Z" fill={Colors.primaryPressed} />
      <Path
        d="M10.5 8.5 C9 10 9 12 9.3 13.5 M21.5 8.5 C23 10 23 12 22.7 13.5"
        stroke={Colors.primaryPressed}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * 체크포인트 카드. "강원도 오대산 숲길 진입!" — 연파랑 면 위에 이정표 도장.
 * 체크포인트가 바뀔 때마다 아래에서 살짝 튀어오른다.
 */
export function JourneyCheckpoint({
  place,
  nextName,
  nextKm,
}: {
  place: string;
  nextName: string;
  nextKm: number;
}) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    // place 가 바뀔 때(새 체크포인트 도착) 다시 튀어오른다.
  }, [pop, place]);

  return (
    <Animated.View
      style={[
        styles.checkpoint,
        {
          opacity: pop,
          transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
      accessibilityLiveRegion="polite">
      <View style={styles.stamp}>
        <SignpostIcon />
      </View>
      <View style={styles.checkpointTexts}>
        <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>
          체크포인트
        </Text>
        <Text style={styles.place} maxFontSizeMultiplier={1.2}>
          {place}
        </Text>
        <Text style={styles.next} maxFontSizeMultiplier={1.2}>
          다음 목적지 · {nextName} {nextKm}km
        </Text>
      </View>
    </Animated.View>
  );
}

/** 창작 아이콘: 산봉우리 이정표 도장. */
function SignpostIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Path d="M4 20 L10 8 L14 14 L17 10 L22 20 Z" fill={IconTint.orange} />
      <Circle cx={18.5} cy={6} r={2.4} fill={IconTint.orange} opacity={0.7} />
      <Path d="M3 21.5 h20" stroke={IconTint.orange} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  badge: {
    position: 'absolute',
    width: BADGE,
    height: BADGE,
    borderRadius: 999,
    backgroundColor: Colors.background,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // 파란 링 위에 떠 보이게 그림자를 준다.
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  checkpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.primaryFaint,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  stamp: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: Colors.primaryPressed,
  },
  place: {
    fontSize: FontSize.subtitle,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  next: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
});
