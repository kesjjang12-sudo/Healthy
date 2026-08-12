/**
 * 근력운동의 필요성을 짧게 설득하는 카피.
 *
 * 이 세대는 "유산소만 하면 건강해진다"는 인식이 강해서, 앱을 처음 여는
 * 순간부터 "근력도 같이 해야 하는 이유"를 눈에 띄게 말해 둔다. 의학적으로
 * 과장된 주장(예: 정확한 수명 연장 수치)은 넣지 않는다 — 일반적으로 통용되는
 * 상식 수준의 문장만 쓴다.
 */
export type HookMessage = {
  headline: string;
  body: string;
};

export const STRENGTH_HOOK_MESSAGES: readonly HookMessage[] = [
  {
    headline: '걷기만으론 근육이 늘지 않습니다',
    body: '근력이 있어야 넘어지지 않고, 계단을 오르고, 무거운 걸 들 수 있습니다. 유산소와 근력은 같이 해야 효과가 있습니다.',
  },
  {
    headline: '40대부터는 매년 근육이 줄어듭니다',
    body: '가만히 있으면 근육이 자연히 빠집니다. 일주일에 두세 번, 짧게라도 근력 운동을 하면 그 속도를 늦출 수 있습니다.',
  },
  {
    headline: '근력은 지금 시작해도 늘어납니다',
    body: '나이와 상관없이 꾸준히 하면 근력은 붙습니다. 오늘 처음이어도 늦지 않았습니다.',
  },
] as const;

/** 매번 다른 문구가 보이도록. seed 를 안 주면 지금 시각 기준으로 고른다. */
export function pickHookMessage(seed: number = Date.now()): HookMessage {
  const index = Math.abs(Math.trunc(seed)) % STRENGTH_HOOK_MESSAGES.length;
  return STRENGTH_HOOK_MESSAGES[index];
}
