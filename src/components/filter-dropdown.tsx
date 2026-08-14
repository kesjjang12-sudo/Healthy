import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CheckMark } from '@/components/check-mark';
import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

export type FilterOption<V extends string> = {
  value: V;
  label: string;
  /** 그 값을 고르면 몇 개가 남는지. 0 이면 눌러도 빈 화면이라 미리 알려준다. */
  count?: number;
};

type Props<V extends string> = {
  label: string;
  value: V;
  options: readonly FilterOption<V>[];
  onChange: (value: V) => void;
};

/**
 * 목록 위에 다는 필터. 눌러서 펼치고, 고르면 닫힌다.
 *
 * 칩을 가로로 늘어놓지 않고 펼침 목록으로 만든 이유는 부위가 7~8개라서다.
 * 좁은 폰에서 칩으로 깔면 가로 스크롤이 생기고, 스크롤 밖의 항목은 있는 줄도
 * 모른다. 펼치면 전부 한 번에 보인다.
 *
 * 선택지마다 개수를 같이 보여준다 — 골랐는데 빈 화면이 나오는 것만큼
 * 고장난 것처럼 느껴지는 게 없다.
 */
export function FilterDropdown<V extends string>({ label, value, options, onChange }: Props<V>) {
  const [isOpen, setIsOpen] = useState(false);

  const select = useCallback(
    (next: V) => {
      onChange(next);
      setIsOpen(false);
    },
    [onChange],
  );

  const current = options.find((option) => option.value === value);

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}. 눌러서 바꾸기`}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <Text style={styles.triggerLabel} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Text style={styles.triggerValue} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {current?.label ?? ''}
        </Text>
        {/* 아래 화살표. 글리프 대신 직접 그려야 기기 폰트에 안 흔들린다. */}
        <View style={styles.caret} />
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          {/* 안쪽을 눌렀을 때는 닫히면 안 된다. 목록을 고르려다 창이 사라진다. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle} maxFontSizeMultiplier={1.2}>
              {label}
            </Text>

            <ScrollView>
              {options.map((option) => {
                const selected = option.value === value;
                const empty = option.count === 0;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => select(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                    <Text
                      style={[
                        styles.optionLabel,
                        selected && styles.optionLabelSelected,
                        empty && styles.optionLabelEmpty,
                      ]}
                      maxFontSizeMultiplier={1.3}>
                      {option.label}
                      {option.count !== undefined ? `  ${option.count}` : ''}
                    </Text>
                    {selected ? <CheckMark size={22} thickness={3} color={Colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    minHeight: 52,
  },
  triggerPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  triggerLabel: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  triggerValue: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.text,
  },
  caret: {
    width: 9,
    height: 9,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: Colors.textSecondary,
    transform: [{ rotate: '45deg' }],
    marginTop: -4,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    maxHeight: '70%',
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.background,
  },
  sheetTitle: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.md,
    minHeight: TouchTarget.min * 0.7,
  },
  optionPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  optionLabel: {
    fontSize: FontSize.subtitle,
    fontWeight: '600',
    letterSpacing: LetterSpacing.subtitle,
    color: Colors.text,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  // 0개인 선택지는 눌러도 빈 화면이다. 막지는 않되 미리 흐리게 보여준다.
  optionLabelEmpty: {
    color: Colors.textDisabled,
  },
});
