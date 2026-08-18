import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';
import type { HookMessage } from '@/features/content/hooking-copy';

type Props = {
  message: HookMessage;
  /** large = 로그인 화면(처음 설득), compact = 운동 탭 상단(짧게 리마인드) */
  size?: 'large' | 'compact';
};

export function StrengthHookBanner({ message, size = 'large' }: Props) {
  const isCompact = size === 'compact';

  return (
    <View style={[styles.box, isCompact && styles.boxCompact]}>
      <Text
        style={[styles.headline, isCompact && styles.headlineCompact]}
        maxFontSizeMultiplier={1.2}>
        {'“'}{message.headline}{'”'}
      </Text>
      {!isCompact ? (
        <Text style={styles.body} maxFontSizeMultiplier={1.3}>
          {message.body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // 피드백: 색 박스 말고 인용구처럼 — 왼쪽 파란 세로선 + 큰 파란 볼드.
  box: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  boxCompact: {
    paddingVertical: 0,
  },
  headline: {
    fontSize: FontSize.section,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.primary,
  },
  headlineCompact: {
    fontSize: FontSize.body,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: '500',
    lineHeight: FontSize.body * 1.5,
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
});
