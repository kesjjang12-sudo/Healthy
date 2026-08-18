import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Colors, LetterSpacing, Spacing, TouchTarget } from '@/constants/theme';

/**
 * 하단 탭 바를 직접 그린다.
 *
 * 토스 하단 탭처럼 아이콘 + 글자를 세로로 쌓는다. 글자만 있을 때보다 멀리서도
 * 어느 탭인지 먼저 보인다(직관성). 아이콘은 폰트 글리프가 아니라 icon.tsx 에서
 * SVG 로 직접 그린 것이라 기기마다 모양이 흔들리지 않는다.
 */
const TAB_ICONS: Record<string, IconName> = {
  // 운동 탭은 첫 화면이자 돌아오는 자리라 집으로 그린다. 번개는 "운동"보다
  // "빠름"으로 읽혀서, 어느 탭이 처음인지 알려주지 못했다.
  workout: 'home',
  calendar: 'calendar',
  ranking: 'trophy',
  analysis: 'column',
  profile: 'person',
};

export function TextTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // 안전영역만큼 그대로 띄우면 탭 글자 아래가 휑하게 남는다 — 안드로이드
  // 제스처 내비게이션은 이 값이 48 까지 올라가고, 웹은 viewport-fit=cover 라
  // 브라우저에서도 그 값이 들어온다. 홈 인디케이터를 가리지 않을 만큼만
  // 남기고 자른다(이러면 총 높이가 iOS 기본 탭바 83pt 근처로 맞는다).
  const bottomInset = Math.min(insets.bottom, Spacing.lg) || Spacing.sm;

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const isFocused = state.index === index;
        // _layout 이 없는 탭(ranking/analysis/profile)은 라우트 이름이
        // "ranking/index" 로 들어와 매핑이 빗나간다 — 그래서 그 세 탭만
        // 아이콘이 안 그려졌다. 디렉터리 이름으로 정규화해서 찾는다.
        const iconName = TAB_ICONS[route.name] ?? TAB_ICONS[route.name.split('/')[0]];

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
            {iconName ? (
              <Icon
                name={iconName}
                size={26}
                color={isFocused ? Colors.primary : Colors.textTertiary}
                strokeWidth={isFocused ? 2.3 : 1.9}
                filled={isFocused}
              />
            ) : null}
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
  label: {
    // 아이콘(26)이 주인공이라 글자는 한 단계 작게 간다. caption(14)은 아이콘보다
    // 글자가 커 보여 탭바가 무거웠다. 여기만 스케일 밖 값을 쓴다.
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
