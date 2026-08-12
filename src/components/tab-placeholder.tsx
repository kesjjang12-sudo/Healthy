import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, LetterSpacing, Spacing } from '@/constants/theme';

/** 아직 내용을 안 채운 탭용. Phase 6 에서 각 탭 실제 화면으로 교체된다. */
export function TabPlaceholder({ title }: { title: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>
        {title}
      </Text>
      <Text style={styles.helper} maxFontSizeMultiplier={1.3}>
        준비 중입니다
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
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
});
