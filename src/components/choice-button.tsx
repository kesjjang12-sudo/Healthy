import { Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  caption?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** 설문 선택지용 큰 버튼. 손가락으로 눌러야 하므로 최소 높이를 크게 잡는다. */
export function ChoiceButton({
  label,
  caption,
  selected = false,
  disabled = false,
  onPress,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      // radio 는 selected 가 아니라 checked 로 읽어야 스크린리더가 선택 상태를 알린다.
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => [
        styles.button,
        selected && styles.selected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Text style={[styles.label, selected && styles.selectedLabel]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {caption ? (
        <Text style={styles.caption} maxFontSizeMultiplier={1.3}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 112,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  selected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  pressed: {
    backgroundColor: Colors.surfacePressed,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  selectedLabel: {
    color: Colors.primary,
  },
  caption: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
