import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/app-text';

import { Colors, FontSize, LetterSpacing, Radius } from '@/constants/theme';

type Option<T extends string> = {
  value: T;
  label: string;
  /** 라벨 밑에 작게 붙는 보조 정보(예: "약 12분") */
  sub?: string;
};

type Props<T extends string> = {
  options: readonly [Option<T>, Option<T>];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /**
   * 바꾸는 중. 두 번 누르는 것만 막고 흐리게는 하지 않는다 — 방금 미끄러진
   * 썸까지 같이 흐려지면 반응한 게 아니라 멈춘 것처럼 보인다.
   */
  busy?: boolean;
};

/**
 * 두 값 사이를 오가는 슬라이딩 토글(FIT ROTEIN 시안의 코스 선택).
 *
 * 아이폰 설정의 세그먼트처럼 흰 썸이 미끄러진다. 칩 두 개를 나란히 두던
 * 이전 방식은 글자 정렬이 흔들렸는데, 여기서는 각 칸의 정가운데에 라벨을
 * 두어 구조적으로 어긋날 수 없다. 트랙 높이는 시니어 손가락 기준으로 키웠다.
 */
export function CourseToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
  busy,
}: Props<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const isSecond = value === options[1].value;
  // useRef(...).current 는 렌더 중 ref 접근이라 lint 에 걸린다. lazy state 로
  // 한 번만 만들고 값은 Animated 가 내부에서 움직인다.
  const [anim] = useState(() => new Animated.Value(isSecond ? 1 : 0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isSecond ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [anim, isSecond]);

  const thumbWidth = Math.max(0, (trackWidth - PADDING * 2) / 2);
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, thumbWidth] });

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
      {thumbWidth > 0 ? (
        <Animated.View style={[styles.thumb, { width: thumbWidth, transform: [{ translateX }] }]} />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.sub ? `${option.label}, ${option.sub}` : option.label}
            style={styles.segment}>
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              maxFontSizeMultiplier={1.2}>
              {option.label}
            </Text>
            {option.sub ? (
              <Text
                style={[styles.sub, selected && styles.subSelected]}
                maxFontSizeMultiplier={1.2}>
                {option.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const PADDING = 4;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    padding: PADDING,
    minHeight: 56,
  },
  trackDisabled: {
    opacity: 0.6,
  },
  thumb: {
    position: 'absolute',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    // 썸이 트랙과 같은 흰색 계열이라 그림자로 떠 있음을 알린다.
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: FontSize.body,
    fontWeight: '700',
    letterSpacing: LetterSpacing.body,
    color: Colors.textSecondary,
  },
  labelSelected: {
    color: Colors.text,
  },
  sub: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    letterSpacing: LetterSpacing.body,
    color: Colors.textTertiary,
  },
  subSelected: {
    color: Colors.textSecondary,
  },
});
