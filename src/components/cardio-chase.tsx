import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Colors, LetterSpacing, Radius } from '@/constants/theme';

/**
 * 유산소 진행 막대 — 토끼와 거북이.
 *
 * 러닝머신 위 15분은 숫자로만 보면 길다. 시계 대신 이야기 하나를 놓는다:
 * 내가 거북이(🐢)고, 뒤에서 토끼(🐇)가 쫓아온다. 시간이 흐르는 만큼 거북이가
 * 깃발(🏁)로 다가가고, 토끼는 계속 뒤에 있다 — 꾸준히 가는 쪽이 이긴다는
 * 그 이야기 그대로라 4060 회원에게 설명이 필요 없다.
 *
 * 토끼는 진행의 85% 지점을 따라온다. 목표에 다가갈수록 절대 간격이 벌어져서
 * "이제 못 따라잡는다"는 안심으로 읽힌다. 속도 데이터가 없으므로 이 간격에
 * 다른 의미는 없다 — 재미와 진행 표시가 전부다.
 */
export function CardioChase({
  elapsedSeconds,
  targetMinutes,
}: {
  elapsedSeconds: number;
  targetMinutes: number;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = Math.min(1, elapsedSeconds / (targetMinutes * 60));
  const done = progress >= 1;

  // 걷는 느낌의 위아래 총총거림. 진행값(초 단위 갱신)과 무관하게 계속 돈다.
  const [hop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hop]);
  const hopY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  // 이모지가 트랙 밖으로 나가지 않게 글자 폭만큼 빼고 계산한다.
  const usable = Math.max(0, trackWidth - EMOJI_WIDTH);
  const turtleX = usable * progress;
  const rabbitX = usable * progress * 0.85;

  return (
    <View
      accessibilityLabel={
        done
          ? `목표 ${targetMinutes}분을 채우셨습니다`
          : `목표 ${targetMinutes}분 중 ${Math.round(progress * 100)}% 지나갔습니다`
      }>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        {/* 지나온 길. 이모지 뒤에 깔리는 채움 막대다. */}
        <View style={[styles.fill, { width: EMOJI_WIDTH / 2 + turtleX }]} />
        <Text style={[styles.flag]} maxFontSizeMultiplier={1} aria-hidden>
          🏁
        </Text>
        {trackWidth > 0 ? (
          <>
            <Text
              style={[styles.runner, { transform: [{ translateX: rabbitX }] }]}
              maxFontSizeMultiplier={1}
              aria-hidden>
              🐇
            </Text>
            <Animated.Text
              style={[styles.runner, { transform: [{ translateX: turtleX }, { translateY: hopY }] }]}
              maxFontSizeMultiplier={1}
              aria-hidden>
              🐢
            </Animated.Text>
          </>
        ) : null}
      </View>
      <Text style={styles.caption} maxFontSizeMultiplier={1.3}>
        {done
          ? '거북이가 이겼습니다! 더 하셔도, 여기서 마치셔도 됩니다.'
          : '꾸준한 거북이가 이깁니다. 토끼가 쫓아와도 서두르지 마세요.'}
      </Text>
    </View>
  );
}

const EMOJI_WIDTH = 26;

const styles = StyleSheet.create({
  track: {
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primaryFaint,
  },
  runner: {
    position: 'absolute',
    left: 6,
    fontSize: 22,
    lineHeight: 26,
  },
  flag: {
    position: 'absolute',
    right: 6,
    fontSize: 20,
    lineHeight: 24,
  },
  caption: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
