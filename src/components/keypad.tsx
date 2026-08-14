import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

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
            // 테두리 없이 흰 바탕에 숫자만 두고, 누를 때만 회색 면이 올라온다.
            style={({ pressed }) => [
              styles.key,
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
    rowGap: Spacing.xs,
  },
  key: {
    // 3열 격자. gap 대신 각 칸이 폭의 1/3 을 차지하게 두어 눌리는 면을 넓게 잡는다.
    width: '33.333%',
    minHeight: TouchTarget.min,
    aspectRatio: 1.9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  keyPressed: {
    backgroundColor: Colors.surface,
  },
  keyDisabled: {
    opacity: 0.35,
  },
  keyLabel: {
    fontSize: FontSize.keypad,
    fontWeight: '600',
    letterSpacing: LetterSpacing.title,
    color: Colors.text,
  },
  actionKeyLabel: {
    fontSize: FontSize.body,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  keyLabelDisabled: {
    color: Colors.textDisabled,
  },
});
