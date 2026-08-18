import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';

/**
 * 루틴을 준비하는 동안 돌려 보여주는 멘트. "로딩 중"이라는 기계 말 대신,
 * 화면 뒤에서 사람이 움직이는 그림을 준다 — 트레이너가 출근하고, 계획을 짜고,
 * 기구 자리를 봐 두는.
 */
const MESSAGES = [
  '트레이너 선생님이 출근하는 중이에요',
  '회원님 오늘 계획을 짜는 중이에요',
  '기구에 남은 자리를 봐두는 중이에요',
] as const;

/** 멘트 하나를 읽을 시간. 너무 빠르면 다 못 읽고 넘어간다(시니어 기준). */
const ROTATE_MS = 1_800;

export function WittyLoading() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View
      style={styles.centered}
      // 스크린리더에는 돌아가는 멘트 대신 요지 한 줄만 읽힌다 — 1.8초마다
      // 다시 읽어 주면 그게 더 시끄럽다.
      accessible
      accessibilityLabel="오늘의 운동을 준비하고 있어요">
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.text} maxFontSizeMultiplier={1.3}>
        {MESSAGES[index]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.xxxl,
  },
  text: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
