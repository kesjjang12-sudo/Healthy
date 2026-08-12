import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, Radius, Spacing, TouchTarget } from '@/constants/theme';

type KeypadKey = { type: 'digit'; value: string } | { type: 'clear' } | { type: 'backspace' };

const KEYS: KeypadKey[] = [
  ...'123456789'.split('').map((value): KeypadKey => ({ type: 'digit', value })),
  { type: 'clear' },
  { type: 'digit', value: '0' },
  { type: 'backspace' },
];

type Props = {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  disabled?: boolean;
};

function KeypadComponent({ onDigit, onClear, onBackspace, disabled = false }: Props) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => {
        const isAction = key.type !== 'digit';
        // 화살표 기호(←)는 시니어에게 뜻이 바로 안 읽혀서 글자로 쓴다.
        const label = key.type === 'digit' ? key.value : key.type === 'clear' ? '전체 지움' : '지우기';
        const accessibilityLabel =
          key.type === 'digit' ? key.value : key.type === 'clear' ? '전체 지움' : '한 글자 지우기';

        return (
          <Pressable
            key={key.type === 'digit' ? key.value : key.type}
            onPress={() => {
              if (key.type === 'digit') onDigit(key.value);
              else if (key.type === 'clear') onClear();
              else onBackspace();
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={({ pressed }) => [
              styles.key,
              isAction && styles.actionKey,
              pressed && styles.keyPressed,
              disabled && styles.keyDisabled,
            ]}>
            <Text
              style={[
                styles.keyLabel,
                isAction && styles.actionKeyLabel,
                disabled && styles.keyLabelDisabled,
              ]}
              // 시니어가 시스템 글자 크기를 키워도 3열 격자가 깨지지 않게 상한을 둔다.
              maxFontSizeMultiplier={1.3}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Keypad = memo(KeypadComponent);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  key: {
    // 3열 격자: basis 30% 세 개(90%)에 gap 두 칸을 더하면 100% 를 넘기 직전이라
    // 한 줄에 정확히 3개만 들어가고, flexGrow 가 남는 폭을 나눠 가진다.
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: TouchTarget.min,
    aspectRatio: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionKey: {
    backgroundColor: Colors.background,
  },
  keyPressed: {
    backgroundColor: Colors.surfacePressed,
    borderColor: Colors.primary,
  },
  keyDisabled: {
    opacity: 0.4,
  },
  keyLabel: {
    fontSize: FontSize.keypad,
    fontWeight: '700',
    color: Colors.text,
  },
  actionKeyLabel: {
    fontSize: FontSize.label,
    color: Colors.textSecondary,
  },
  keyLabelDisabled: {
    color: Colors.textDisabled,
  },
});
