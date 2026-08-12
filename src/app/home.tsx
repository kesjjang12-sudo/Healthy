import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { maskPhoneNumber } from '@/features/auth/phone';
import { useSession } from '@/features/auth/session';

/**
 * 로그인 직후 화면. QR 스캔 / 오늘의 루틴은 다음 단계에서 붙인다.
 * 지금은 인증이 실제로 통했는지 눈으로 확인하는 용도다.
 */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isRestoring, signOut } = useSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;

  const nickname = user.profile_data?.nickname;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <Text style={styles.greeting} maxFontSizeMultiplier={1.2}>
        {nickname ? `${nickname}님,` : `${maskPhoneNumber(user.phone_number)} 님,`}
      </Text>
      <Text style={styles.subtitle} maxFontSizeMultiplier={1.3}>
        오늘도 나오셨네요. 반갑습니다!
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel} maxFontSizeMultiplier={1.3}>
          내 포인트
        </Text>
        <Text style={styles.cardValue} maxFontSizeMultiplier={1.2}>
          {(user.total_points ?? 0).toLocaleString('ko-KR')}점
        </Text>
      </View>

      <PrimaryButton label="운동 마치기" variant="ghost" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  greeting: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  card: {
    marginVertical: Spacing.lg,
    padding: Spacing.xl,
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryFaint,
  },
  cardLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  cardValue: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.primary,
  },
});
