import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, LetterSpacing, Radius, Spacing, TouchTarget } from '@/constants/theme';

/**
 * 하단 탭 바를 직접 그린다.
 *
 * 이 앱은 이모지·아이콘 글리프를 쓰지 않는다는 원칙이 있다(CheckMark 컴포넌트가
 * 체크 표시를 도형으로 직접 그리는 것과 같은 이유). 기본 탭 바는 아이콘을
 * 전제로 하므로, 글자 + 활성 상태를 나타내는 작은 알약 도형만으로 다시 그린다.
 */
export function TextTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom || Spacing.sm }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
            style={styles.tab}>
            <View style={[styles.indicator, isFocused && styles.indicatorActive]} />
            <Text style={[styles.label, isFocused && styles.labelActive]} maxFontSizeMultiplier={1.2}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    paddingTop: Spacing.sm,
  },
  tab: {
    flex: 1,
    minHeight: TouchTarget.tab,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  indicator: {
    width: 20,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: Colors.primary,
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
