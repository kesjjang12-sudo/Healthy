import { Redirect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useSession } from '@/features/auth/session';

/**
 * 신규 회원용 프로필 설문 자리.
 * 여기서 받은 성별/연령대/운동목적을 users.profile_data 에 병합하고(update_profile_data RPC)
 * 그 값을 AI 루틴 생성 입력으로 쓴다. 설문 문항은 다음 단계에서 채운다.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isRestoring } = useSession();

  if (isRestoring) return null;
  if (!user) return <Redirect href="/" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        등록이 끝났습니다!
      </Text>
      <Text style={styles.body} maxFontSizeMultiplier={1.3}>
        운동 목적과 몸 상태를 여쭤보고 맞춤 루틴을 만들어 드릴 예정입니다.
      </Text>

      <PrimaryButton label="다음" onPress={() => router.replace('/home')} />
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
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '800',
    color: Colors.text,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
    lineHeight: FontSize.body * 1.5,
  },
});
