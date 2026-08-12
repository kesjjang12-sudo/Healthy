import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { Colors, FontSize, LetterSpacing, Radius, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
} & Pick<TextInputProps, 'keyboardType' | 'autoCapitalize' | 'returnKeyType' | 'onSubmitEditing'>;

/**
 * 닉네임처럼 자유 입력이 필요한 값에 쓴다. 테두리 대신 면으로 상태를 나타낸다
 * — 포커스가 오면 배경이 옅은 파랑으로 바뀐다(이 앱은 선을 최후의 수단으로만 쓴다).
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  ...inputProps
}: Props) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        maxLength={maxLength}
        maxFontSizeMultiplier={1.3}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[styles.input, isFocused && styles.inputFocused]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.text,
  },
  inputFocused: {
    backgroundColor: Colors.primaryFaint,
  },
});
