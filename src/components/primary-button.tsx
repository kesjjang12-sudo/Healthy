import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/app-text';
import type { StyleProp, ViewStyle } from 'react-native';

import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

type Props = {
  label: string;
  /** 화면에 같은 라벨이 여러 번 나올 때 구분해 읽히도록 따로 지정한다. */
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** primary = 파란 주 버튼, secondary = 회색 면, quiet = 배경 없는 보조 동작 */
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'cta' | 'compact';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'cta',
  style,
}: Props) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'compact' ? styles.compact : styles.cta,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        pressed && !isInactive && pressedStyle[variant],
        isInactive && (variant === 'primary' ? styles.primaryOff : styles.quietOff),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.textOnPrimary : Colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            size === 'compact' && styles.compactLabel,
            variant === 'primary' ? styles.labelOnPrimary : styles.labelOnSurface,
            disabled && variant === 'primary' && styles.labelOff,
          ]}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  cta: {
    minHeight: TouchTarget.cta,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  compact: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.surface,
  },
  primaryOff: {
    // 비활성은 회색 테두리가 아니라 옅은 면으로 표현한다.
    backgroundColor: Colors.surface,
  },
  quietOff: {
    opacity: 0.4,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
  },
  compactLabel: {
    fontSize: FontSize.caption,
  },
  labelOnPrimary: {
    color: Colors.textOnPrimary,
  },
  labelOnSurface: {
    color: Colors.textSecondary,
  },
  labelOff: {
    color: Colors.textDisabled,
  },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: Colors.primaryPressed },
  secondary: { backgroundColor: Colors.surfacePressed },
  quiet: { backgroundColor: Colors.surface },
});
