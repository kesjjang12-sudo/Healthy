import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';

import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';

type Props = {
  uri: string | null;
  /** 스크린 리더가 읽을 이름. 사진만 보고는 무슨 운동인지 알 수 없다. */
  name: string;
  /** large = 상세 화면 상단, thumb = 목록 한 줄 옆 */
  size?: 'large' | 'thumb';
  /** Image 와 View 양쪽에 얹히므로 둘 다 받는다. */
  style?: StyleProp<ImageStyle & ViewStyle>;
};

/**
 * 운동 시작 자세 사진.
 *
 * 글로만 된 설명은 "그 기구가 헬스장의 어느 것인지"부터 막힌다. 사진 한 장이
 * 그 문제를 통째로 없앤다.
 *
 * 사진은 외부(퍼블릭 도메인 저장소)에서 온다 — 헬스장 와이파이가 느리거나
 * 끊기면 안 올 수 있다. 그때 깨진 자리를 남기지 않으려고 실패를 직접 잡아서
 * 자리 표시로 바꾼다. 사진이 없어도 설명과 하는 방법은 그대로 읽힌다.
 */
export function ExercisePhoto({ uri, name, size = 'large', style }: Props) {
  const [failed, setFailed] = useState(false);

  const box = size === 'large' ? styles.large : styles.thumb;

  if (!uri || failed) {
    // 목록에서는 자리만 비워 둔다 — 줄마다 "사진 없음"이 붙으면 시끄럽다.
    if (size === 'thumb') return null;

    return (
      <View style={[styles.base, box, styles.placeholder, style]}>
        <Text style={styles.placeholderText} maxFontSizeMultiplier={1.3}>
          사진을 불러오지 못했어요
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.base, box, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityRole="image"
      accessibilityLabel={`${name} 시작 자세`}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
  },
  large: {
    width: '100%',
    // 원본이 3:2 라 그 비율을 그대로 둔다. 잘라내면 기구가 화면 밖으로 나간다.
    aspectRatio: 3 / 2,
    borderRadius: Radius.lg,
  },
  thumb: {
    width: 84,
    height: 64,
    borderRadius: Radius.sm,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  placeholderText: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
