import { Children, useMemo } from 'react';
import { Platform, StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { useFontScale } from '@/features/settings/font-scale';

/**
 * 한글 어절이 중간에 끊기지 않게 하는 앱 공통 Text.
 *
 * 흔히 쓰는 "공백을   로 치환" 트릭은 여기서 통하지 않는다 — 한글은
 * 음절 사이 어디서나 줄바꿈이 허용되는 문자라서, 공백을 붙여 놓아도 어절
 * 중간 끊김은 그대로이고 오히려 유일하게 자연스러운 줄바꿈 지점(공백)만
 * 사라진다. 그래서 반대 방향으로 간다:
 *
 * - iOS: 네이티브 지원(lineBreakStrategyIOS="hangul-word")이 있어 그걸 쓴다.
 *   문자열 조작이 전혀 없다.
 * - Android: 같은 옵션이 없어서, 한글이 든 어절의 글자 사이에만
 *   WORD JOINER(U+2060)를 끼워 어절 안에서의 줄바꿈을 막는다. 공백은 그대로
 *   둬서 어절 단위로만 줄이 바뀐다. 어절이 한 줄보다 길면 레이아웃이 알아서
 *   비상 줄바꿈을 하므로 글이 잘려 나가지는 않는다.
 *
 * 색·굵기 같은 나머지 스타일은 여전히 theme.ts 가 담당한다. 다만 글자 크기만은
 * 여기서 한 번 더 곱한다 — 회원이 고른 크기(작게·중간·크게)를 화면 서른몇 개에
 * 일일이 심는 대신, 모든 텍스트가 지나가는 이 길목에서 처리한다.
 */

const HAS_HANGUL = /[가-힣]/;

function keepWordTogether(word: string): string {
  // 라틴 문자·숫자·코드("FIT-DEMO-LEG-01")는 원래 중간에서 안 끊기므로
  // 손대지 않는다 — 괜히 붙여 놓으면 좁은 화면에서 넘칠 수만 있다.
  if (!HAS_HANGUL.test(word)) return word;
  return Array.from(word).join('\u2060');
}

function keepAll(text: string): string {
  return text.split(' ').map(keepWordTogether).join(' ');
}

export function Text({ children, style, ...props }: TextProps) {
  const { multiplier } = useFontScale();

  const content = useMemo(() => {
    if (Platform.OS !== 'android') return children;
    return Children.map(children, (child) =>
      typeof child === 'string' ? keepAll(child) : child,
    );
  }, [children]);

  const scaled = useMemo(() => {
    if (multiplier === 1) return style;

    const flat = StyleSheet.flatten(style);
    if (!flat) return style;

    // fontSize 를 안 정한 텍스트는 건드리지 않는다. 그런 텍스트는 대개 감싼
    // Text 의 크기를 물려받는데, 그 부모가 이미 곱해진 값이라 여기서 또
    // 곱하면 두 번 커진다.
    if (typeof flat.fontSize !== 'number') return style;

    const next = { ...flat, fontSize: Math.round(flat.fontSize * multiplier) };
    // 줄 간격을 같이 안 키우면 글자가 커진 만큼 줄끼리 붙어 오히려 읽기 나빠진다.
    if (typeof flat.lineHeight === 'number') {
      next.lineHeight = Math.round(flat.lineHeight * multiplier);
    }
    return next;
  }, [style, multiplier]);

  return (
    <RNText lineBreakStrategyIOS="hangul-word" style={scaled} {...props}>
      {content}
    </RNText>
  );
}
