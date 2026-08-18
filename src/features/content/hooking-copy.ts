/**
 * 근력운동의 필요성을 짧게 설득하는 카피.
 *
 * 이 세대는 "유산소만 하면 건강해진다"는 인식이 강해서, 앱을 처음 여는
 * 순간부터 "근력도 같이 해야 하는 이유"를 눈에 띄게 말해 둔다.
 *
 * **의학적으로 과장된 주장은 넣지 않는다.** 수명이 몇 년 늘어난다거나 병이
 * 낫는다는 식의 문장은 여기 들어올 수 없다 — 일반적으로 통용되는 상식
 * 수준이면서, 틀려도 사람이 다치지 않는 말만 쓴다. 문구를 늘릴 때도 이
 * 기준을 지킨다.
 *
 * 문구가 셋뿐이면 며칠만 써도 다 외워져서 눈에 안 들어온다. 그래서 열두 개를
 * 두고 화면을 열 때마다 무작위로 하나를 고른다.
 */
export type HookMessage = {
  headline: string;
  body: string;
};

export const STRENGTH_HOOK_MESSAGES: readonly HookMessage[] = [
  {
    headline: '걷기만으론 근육이 늘지 않아요',
    body: '근력이 있어야 넘어지지 않고, 계단을 오르고, 무거운 걸 들 수 있어요. 유산소와 근력은 같이 해야 효과가 있어요.',
  },
  {
    headline: '40대부터는 매년 근육이 줄어들어요',
    body: '가만히 있으면 근육이 자연히 빠져요. 일주일에 두세 번, 짧게라도 근력 운동을 하면 그 속도를 늦출 수 있어요.',
  },
  {
    headline: '근력은 지금 시작해도 늘어나요',
    body: '나이와 상관없이 꾸준히 하면 근력은 붙어요. 오늘 처음이어도 늦지 않았어요.',
  },
  {
    headline: '넘어지지 않는 힘은 다리에서 나와요',
    body: '발이 걸렸을 때 몸을 다시 세우는 건 허벅지 힘이에요. 다리 운동은 그 순간을 위한 준비예요.',
  },
  {
    headline: '일주일에 두 번이면 충분해요',
    body: '매일 하지 않으셔도 돼요. 쉬는 날에 근육이 자라기 때문에, 이틀에 한 번이 오히려 나아요.',
  },
  {
    headline: '앉았다 일어서기가 편해져요',
    body: '의자에서 일어날 때 손으로 짚게 되셨다면 다리 근육이 줄어든 신호예요. 다시 늘릴 수 있어요.',
  },
  {
    headline: '근육은 안 쓴 시간에 반응해요',
    body: '나이보다 안 쓴 기간이 더 커요. 일주일만 누워 있어도 줄고, 다시 쓰면 다시 돌아와요.',
  },
  {
    headline: '장바구니가 무거워지셨나요',
    body: '같은 짐이 무거워졌다면 짐이 는 게 아니라 힘이 준 거예요. 오늘 한 세트가 그걸 되돌려요.',
  },
  {
    headline: '무릎이 불편할수록 주변 근육이 필요해요',
    body: '허벅지 근육이 받쳐 주면 무릎이 지는 부담이 줄어들어요. 아픈 곳은 무게를 낮춰서 안전하게 해 드려요.',
  },
  {
    headline: '10분도 안 한 것보다 나아요',
    body: '오늘 다 못 하셔도 괜찮아요. 하나만 하고 가셔도 안 나온 날과는 달라요.',
  },
  {
    headline: '근육은 저축과 같아요',
    body: '지금 모아 두면 몸이 힘들어질 때 꺼내 써요. 나중에 급하게 모으기는 어려워요.',
  },
  {
    headline: '숨이 차는 건 부끄러운 게 아니에요',
    body: '숨이 찬다는 건 심장이 일하고 있다는 뜻이에요. 말은 되고 노래는 안 되는 정도가 딱 좋아요.',
  },
] as const;

/**
 * 운동을 하나 마쳤을 때 띄우는 한마디.
 *
 * 완료 화면은 다시 오게 만들 수 있는 자리다. "저장됐어요"만 뜨면 그냥
 * 절차가 되지만, 방금 한 일을 알아봐 주면 다음에 한 번 더 누르게 된다.
 */
export const COMPLETION_PRAISES: readonly string[] = [
  '오늘 하나 해내셨어요.',
  '몸은 오늘 하신 걸 기억해요.',
  '이렇게 쌓이면 어느 날 계단이 편해져요.',
  '안 나온 날과는 분명히 다른 하루예요.',
  '잘하셨어요. 다음에도 이 자리에서 봬요.',
  '한 세트씩 늘어난 힘은 없어지지 않아요.',
] as const;

/** 배열에서 하나 무작위로. seed 를 주면 같은 값이 나온다(테스트용). */
function pick<T>(list: readonly T[], seed?: number): T {
  const index =
    seed === undefined
      ? Math.floor(Math.random() * list.length)
      : Math.abs(Math.trunc(seed)) % list.length;

  return list[Math.min(index, list.length - 1)];
}

/**
 * 화면을 열 때마다 다른 문구가 보이도록.
 *
 * 화면 안에서 문구를 저절로 바꾸지는 않는다 — 천천히 읽는 분이 많아서, 읽는
 * 중에 글자가 바뀌면 처음부터 다시 읽어야 한다. 대신 앱을 열 때마다,
 * 탭을 옮길 때마다 새로 고른다.
 */
export function pickHookMessage(seed?: number): HookMessage {
  return pick(STRENGTH_HOOK_MESSAGES, seed);
}

export function pickCompletionPraise(seed?: number): string {
  return pick(COMPLETION_PRAISES, seed);
}
