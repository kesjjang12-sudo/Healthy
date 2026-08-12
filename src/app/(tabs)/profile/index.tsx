import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';
import { useAuthSession } from '@/features/auth/auth-session';

/**
 * 닉네임·성별·연령대 편집, 연결된 로그인 수단, 내 헬스장 목록/주 소속 전환은
 * 다음 단계에서 채운다. 로그아웃만은 지금 있어야 한다 — 이게 없으면 다른
 * 계정으로 다시 로그인해 보는 것 자체가 불가능하다.
 */
export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuthSession();

  const name = user?.profile_data?.nickname ?? '회원';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + Spacing.xxl }]}>
      <View style={styles.headings}>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>
          {name} 님
        </Text>
        <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
          닉네임·연령대 수정, 내 헬스장 관리는 곧 추가됩니다.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="로그아웃" variant="secondary" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.background,
  },
  headings: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: '700',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  helper: {
    fontSize: FontSize.body,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  footer: {
    gap: Spacing.sm,
  },
});
