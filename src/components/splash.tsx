import { useFonts } from 'expo-font';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/app-text';
import { Mascot } from '@/components/mascot';
import { Colors, LetterSpacing, Spacing } from '@/constants/theme';

/**
 * 앱이 켜지는 동안의 첫 화면.
 *
 * 예전엔 로그인 화면이 반투명하게 비쳐 보였다 — 로딩인지 고장인지 알 수 없는
 * 모습이었다(오너 피드백). 한가운데 알통 자세의 마스코트와 "헬스반장" 워드마크,
 * 아래 돌아가는 표시와 한 줄. 그게 전부다.
 *
 * 워드마크 글꼴은 블랙 한 산스에서 네 글자(헬·스·반·장)만 뽑은 8KB 서브셋이라
 * 웹·설치형 앱 어디서든 즉시 뜬다. 로딩이 끝나기 전 한 프레임은 시스템 굵은
 * 글씨로 보인다 — 깜빡임을 없애려고 스플래시를 늦추는 것보다 낫다.
 */
export function Splash({ message = '데이터를 불러오는 중이에요' }: { message?: string }) {
  const [fontReady] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    BrandWordmark: require('../../assets/fonts/brand-wordmark.ttf'),
  });

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <Mascot width={154} />
        <Text
          style={[styles.brand, fontReady && styles.brandFont]}
          maxFontSizeMultiplier={1.2}>
          헬스반장
        </Text>
      </View>
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
  center: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  brand: {
    // 스플래시의 주인공이라 토큰 스케일 밖에서 크게 간다(다른 화면엔 안 나온다).
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    color: Colors.primary,
  },
  brandFont: {
    fontFamily: 'BrandWordmark',
    // 폰트 자체가 이미 두껍다. 800 을 얹으면 웹이 가짜 볼드를 덧칠한다.
    fontWeight: 'normal',
    letterSpacing: 0,
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
