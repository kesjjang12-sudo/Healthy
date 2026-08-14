import { Children, useMemo } from 'react';
import { Platform, Text as RNText, type TextProps } from 'react-native';

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
 * 스타일은 일부러 안 넣는다. 글자 크기·색은 theme.ts 가 담당하는 일이고,
 * 이 컴포넌트는 줄바꿈 동작 하나만 맡는다.
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

export function Text({ children, ...props }: TextProps) {
  const content = useMemo(() => {
    if (Platform.OS !== 'android') return children;
    return Children.map(children, (child) =>
      typeof child === 'string' ? keepAll(child) : child,
    );
  }, [children]);

  return (
    <RNText lineBreakStrategyIOS="hangul-word" {...props}>
      {content}
    </RNText>
  );
}
