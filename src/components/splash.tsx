import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Colors, LetterSpacing, Spacing } from '@/constants/theme';

/**
 * 앱이 켜지는 동안의 첫 화면.
 *
 * 예전엔 로그인 화면이 반투명하게 비쳐 보였다 — 로딩인지 고장인지 알 수 없는
 * 모습이었다(오너 피드백). 요즘 앱들의 문법 그대로 간다: 흰 바탕 한가운데
 * 브랜드 이름 하나, 그 아래 돌아가는 표시와 한 줄. 그게 전부다.
 */
export function Splash({ message = '데이터를 불러오는 중이에요' }: { message?: string }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.brand} maxFontSizeMultiplier={1.2}>
        헬스반장
      </Text>
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={Colors.textTertiary} />
        <Text style={styles.message} maxFontSizeMultiplier={1.2}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  brand: {
    // 스플래시의 주인공이라 토큰 스케일 밖에서 크게 간다(다른 화면엔 안 나온다).
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    color: Colors.primary,
  },
  loading: {
    position: 'absolute',
    bottom: 72,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
});
