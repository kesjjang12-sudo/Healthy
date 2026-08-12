import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Colors, FontSize, Radius, Spacing, TouchTarget } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: Props) {
  const isInactive = disabled || loading;
  const isGhost = variant === 'ghost';

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        isGhost && styles.ghost,
        pressed && !isInactive && (isGhost ? styles.ghostPressed : styles.pressed),
        isInactive && (isGhost ? styles.ghostInactive : styles.inactive),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isGhost ? Colors.primary : Colors.textOnPrimary} size="large" />
      ) : (
        <Text
          style={[
            styles.label,
            isGhost && styles.ghostLabel,
            disabled && !isGhost && styles.inactiveLabel,
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
  button: {
    minHeight: TouchTarget.min,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  pressed: {
    backgroundColor: Colors.primaryPressed,
  },
  inactive: {
    backgroundColor: Colors.surfacePressed,
  },
  inactiveLabel: {
    color: Colors.textDisabled,
  },
  ghostInactive: {
    opacity: 0.4,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  ghostPressed: {
    backgroundColor: Colors.surface,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Colors.textOnPrimary,
  },
  ghostLabel: {
    color: Colors.textSecondary,
  },
});
