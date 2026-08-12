import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  caption?: string;
  selected?: boolean;
  disabled?: boolean;
  /** checkbox 는 여러 개 고를 수 있는 문항용. 네모 체크 표시가 붙는다. */
  role?: 'radio' | 'checkbox';
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** 설문 선택지용 큰 버튼. 손가락으로 눌러야 하므로 최소 높이를 크게 잡는다. */
export function ChoiceButton({
  label,
  caption,
  selected = false,
  disabled = false,
  role = 'radio',
  onPress,
  style,
}: Props) {
  const isCheckbox = role === 'checkbox';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      // radio/checkbox 는 selected 가 아니라 checked 로 읽어야 선택 상태가 전달된다.
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => [
        styles.button,
        isCheckbox && styles.checkboxButton,
        selected && styles.selected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {isCheckbox ? (
        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
          {selected ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
      ) : null}

      <View style={isCheckbox ? styles.checkboxText : styles.centeredText}>
        <Text
          style={[styles.label, isCheckbox && styles.leftAligned, selected && styles.selectedLabel]}
          maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {caption ? (
          <Text
            style={[styles.caption, isCheckbox && styles.leftAligned]}
            maxFontSizeMultiplier={1.3}>
            {caption}
          </Text>
        ) : null}
      </View>
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
  checkboxButton: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-start',
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
  checkbox: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  checkboxChecked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  checkmark: {
    fontSize: FontSize.label,
    fontWeight: '800',
    lineHeight: FontSize.label + 4,
    color: Colors.textOnPrimary,
  },
  centeredText: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  checkboxText: {
    flex: 1,
    gap: Spacing.xs,
  },
  leftAligned: {
    textAlign: 'left',
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
