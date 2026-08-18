import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import type { StyleProp, ViewStyle } from 'react-native';

import { CheckMark } from '@/components/check-mark';
import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';

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

/**
 * 설문 선택지용 큰 버튼.
 * 평소엔 회색 면, 고르면 옅은 파란 면 + 파란 글자 + 파란 테두리로 바뀐다.
 * (테두리는 디자인 피드백으로 추가 — 면 색만으로는 선택 표시가 약하다)
 */
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
        pressed && !disabled && !selected && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <View style={isCheckbox ? styles.checkboxText : styles.centeredText}>
        <Text
          style={[styles.label, isCheckbox && styles.leftAligned, selected && styles.selectedLabel]}
          maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        {caption ? (
          <Text
            style={[
              styles.caption,
              isCheckbox && styles.leftAligned,
              selected && styles.selectedCaption,
            ]}
            maxFontSizeMultiplier={1.3}>
            {caption}
          </Text>
        ) : null}
      </View>

      {/* 체크 표시는 오른쪽 — 왼쪽에 있으면 글줄 시작이 들쭉날쭉해진다(피드백 참고안). */}
      {isCheckbox ? (
        <View style={[styles.box, selected && styles.boxChecked]}>
          {selected ? <CheckMark size={22} thickness={2.5} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 92,
    // 고르기 전에도 같은 두께의 투명 테두리를 둔다 — 고르는 순간 칸이 안 튀게.
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  checkboxButton: {
    flexDirection: 'row',
    gap: Spacing.lg,
    justifyContent: 'flex-start',
  },
  selected: {
    backgroundColor: Colors.primaryFaint,
    borderColor: Colors.primary,
  },
  pressed: {
    backgroundColor: Colors.surfacePressed,
  },
  disabled: {
    opacity: 0.4,
  },
  box: {
    // flex: 0 은 flexBasis 까지 0 으로 만들어 칸이 접힌다. 줄어들지만 않게 한다.
    flexShrink: 0,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    backgroundColor: Colors.background,
    // 회색 면 위의 흰 네모는 체크박스로 안 읽힌다는 피드백 — 테두리를 준다.
    borderWidth: 2,
    borderColor: Colors.grey[300],
  },
  boxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  centeredText: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  checkboxText: {
    flex: 1,
    gap: 2,
  },
  leftAligned: {
    textAlign: 'left',
  },
  label: {
    fontSize: FontSize.label,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
    textAlign: 'center',
  },
  selectedLabel: {
    color: Colors.primary,
  },
  caption: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  selectedCaption: {
    color: Colors.primary,
    opacity: 0.75,
  },
});
