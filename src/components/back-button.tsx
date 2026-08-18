import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * 화면 왼쪽 위 뒤로가기(<). 하단의 "목록으로" 버튼을 없애는 대신, 다른 앱들이
 * 쓰는 익숙한 자리에 단다. CheckMark 처럼 글리프 대신 직접 그린다 — 기기
 * 폰트에 따라 화살표 모양이 달라지지 않는다.
 */
export function BackButton({ onPress, accessibilityLabel = '뒤로가기' }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}>
      <View style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  pressed: {
    backgroundColor: Colors.surface,
  },
  chevron: {
    // 왼쪽·아래 변만 남긴 사각형을 45도 돌리면 왼쪽을 가리키는 화살촉이 된다.
    width: 14,
    height: 14,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: Colors.text,
    transform: [{ rotate: '45deg' }, { translateX: 2 }],
  },
});
