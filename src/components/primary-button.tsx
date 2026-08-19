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
  /**
   * primary = 파란 주 버튼, secondary = 회색 면, quiet = 배경 없는 보조 동작,
   * danger = 되돌리기 어려운 동작(동의 거두기 등). 빨간 글씨 + 옅은 빨간 면으로,
   * 누르기 전에 한 번 멈칫하게 만든다. 파란 주 버튼처럼 꽉 채우지는 않는다 —
   * 주된 길이 아니라 예외적인 길이기 때문이다.
   */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
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
        variant === 'danger' && styles.danger,
        pressed && !isInactive && pressedStyle[variant],
        isInactive && (variant === 'primary' ? styles.primaryOff : styles.quietOff),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary'
              ? Colors.textOnPrimary
              : variant === 'danger'
                ? Colors.danger
                : Colors.primary
          }
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            size === 'compact' && styles.compactLabel,
            variant === 'primary'
              ? styles.labelOnPrimary
              : variant === 'danger'
                ? styles.labelDanger
                : styles.labelOnSurface,
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
  danger: {
    backgroundColor: Colors.dangerFaint,
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
  labelDanger: {
    color: Colors.danger,
  },
  labelOff: {
    color: Colors.textDisabled,
  },
});

const pressedStyle = StyleSheet.create({
  primary: { backgroundColor: Colors.primaryPressed },
  secondary: { backgroundColor: Colors.surfacePressed },
  quiet: { backgroundColor: Colors.surface },
  danger: { backgroundColor: Colors.surfacePressed },
});
