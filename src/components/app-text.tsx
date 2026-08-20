import { Children, useMemo } from 'react';
import { Platform, StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { useFontScale } from '@/features/settings/font-scale';
import type { FontScale } from '@/lib/database.types';

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

/**
 * 단계별 글자 크기 표 (디자인 피드백 5번).
 *
 * 예전엔 배율(×1.15, ×1.3)을 곱했는데, 그러면 큰 글자는 너무 커지고 작은
 * 글자는 덜 커진다. 피드백의 방식대로 **단계마다 손으로 정한 크기 표**로
 * 바꾼다 — 제목은 22→24→26 처럼 조금씩, 보조는 14→16→18 처럼 많이 커져서
 * 단계가 올라가도 위계가 안 무너진다.
 *
 * 열쇠는 기준(작게) 크기다. theme.ts 의 FontSize 값들과 짝을 이룬다.
 * 표에 없는 크기는 예전처럼 배율로 어림한다.
 */
const SIZE_STEPS: Record<FontScale, Record<number, number>> = {
  small: {}, // 기준 그대로
  medium: { 14: 16, 16: 18, 17: 19, 18: 20, 19: 21, 22: 24, 26: 28, 40: 42 },
  large: { 14: 18, 16: 20, 17: 21, 18: 22, 19: 23, 22: 26, 26: 30, 40: 44 },
};

const HAS_HANGUL = /[가-힣]/;

function keepWordTogether(word: string): string {
  // 라틴 문자·숫자·코드("FIT-DEMO-LEG-01")는 원래 중간에서 안 끊기므로
  // 손대지 않는다 — 괜히 붙여 놓으면 좁은 화면에서 넘칠 수만 있다.
  if (!HAS_HANGUL.test(word)) return word;
  return Array.from(word).join('\u2060');
}

function keepAll(text: string): string {
  // 공백(줄바꿈 포함)은 그대로 두고 어절만 손댄다. split(' ') 로 하면
  // 문장 단위 줄바꿈으로 넣은 \n 이 어절 안쪽으로 들어가 버린다.
  return text
    .split(/(\s+)/)
    .map((part) => (/^\s/.test(part) ? part : keepWordTogether(part)))
    .join('');
}

/**
 * 문장이 끝나는 자리(. ? !) 뒤에서 줄을 넘긴다.
 *
 * 어절 단위로만 안 끊기게 해 놨어도, 한 줄에 앞 문장의 꼬리와 다음 문장의
 * 머리가 같이 놓이면 읽는 사람이 문장의 시작을 눈으로 찾아야 한다
 * ("…등받이에 붙이세요. 목과" 처럼). 폭이 좁은 폰에서 특히 피곤하다.
 * 그래서 여러 문장짜리 안내문은 문장마다 새 줄에서 시작하게 한다.
 *
 * 마침표 뒤에 공백이 있을 때만 자른다 — "1.5kg", "3.5" 같은 소수점은
 * 뒤에 공백이 없으므로 그대로 남는다.
 */
const SENTENCE_END = /([.?!]+["')\]]?)[ \t]+/g;

/**
 * @param trimEdges 앞뒤 공백을 떼도 되는지. Text 안에 조각이 여럿이면
 *   ("…쌓으면 " + {이름} + "이 돼요.") 조각의 끝 공백이 곧 단어 사이 띄어쓰기라
 *   떼면 글자가 붙어 버린다(오너 피드백 "띄어쓰기 좀 하고"). 조각이 하나일
 *   때만 뗀다.
 */
export function bySentence(text: string, trimEdges = true): string {
  const collapsed = text.replace(/\s+/g, ' ').replace(SENTENCE_END, '$1\n');
  return trimEdges ? collapsed.trim() : collapsed;
}

type Props = TextProps & {
  /** 여러 문장짜리 안내문에 켠다. 문장마다 새 줄에서 시작한다. */
  sentenceBreak?: boolean;
};

export function Text({ children, style, sentenceBreak, ...props }: Props) {
  const { scale, multiplier } = useFontScale();

  const content = useMemo(() => {
    if (!sentenceBreak && Platform.OS !== 'android') return children;
    const single = Children.count(children) === 1;
    return Children.map(children, (child) => {
      if (typeof child !== 'string') return child;
      const broken = sentenceBreak ? bySentence(child, single) : child;
      return Platform.OS === 'android' ? keepAll(broken) : broken;
    });
  }, [children, sentenceBreak]);

  const scaled = useMemo(() => {
    if (scale === 'small') return style;

    const flat = StyleSheet.flatten(style);
    if (!flat) return style;

    // fontSize 를 안 정한 텍스트는 건드리지 않는다. 그런 텍스트는 대개 감싼
    // Text 의 크기를 물려받는데, 그 부모가 이미 키워진 값이라 여기서 또
    // 키우면 두 번 커진다.
    if (typeof flat.fontSize !== 'number') return style;

    const size = flat.fontSize;
    const stepped = SIZE_STEPS[scale][size] ?? Math.round(size * multiplier);

    const next = { ...flat, fontSize: stepped };
    // 줄 간격은 글자가 커진 비율만큼 같이 키운다. 안 키우면 줄끼리 붙는다.
    if (typeof flat.lineHeight === 'number') {
      next.lineHeight = Math.round(flat.lineHeight * (stepped / size));
    }
    return next;
  }, [style, scale, multiplier]);

  return (
    <RNText lineBreakStrategyIOS="hangul-word" style={scaled} {...props}>
      {content}
    </RNText>
  );
}
