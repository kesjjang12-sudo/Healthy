import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  size?: number;
  color?: string;
  /** 선 굵기. 작게 그릴수록 얇아야 자연스럽다 */
  thickness?: number;
};

/**
 * 체크 표시. 이모지나 ✓ 글자를 쓰지 않고 직접 그린다.
 *
 * 글리프를 쓰면 기기 폰트에 따라 모양과 두께가 제각각이고, 이모지는 화면 톤을
 * 흐트러뜨린다. 두 변만 남긴 사각형을 45도 돌리면 어디서나 같은 체크가 나온다.
 */
export function CheckMark({ size = 24, color = Colors.textOnPrimary, thickness = 3 }: Props) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.52,
          height: size * 0.28,
          borderLeftWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: color,
          borderBottomLeftRadius: thickness / 2,
          transform: [{ rotate: '-45deg' }],
          // 회전 뒤 시각적 무게중심을 가운데로 맞춘다.
          marginTop: -size * 0.08,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
