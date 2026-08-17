import type { RoutineItem } from '@/lib/database.types';

/**
 * 기구 앞에서 읽는 안내 문구.
 *
 * 운동별 동작 순서는 도감(exercise_catalog.how_to_steps)에 있다. 이 파일은
 * 그 뒤에 붙는 공통 규칙과 무게 고르는 법을 맡는다.
 */
/**
 * 모든 근력운동 뒤에 공통으로 붙는 규칙.
 *
 * 기구마다 동작은 달라도 호흡·속도·휴식은 같다. 운동별 순서는 도감
 * (exercise_catalog.how_to_steps)이 갖고 있고, 여기 있는 건 그 뒤에
 * 덧붙는 공통분모다 — 75개 운동에 같은 문장을 복사해 두지 않으려고 나눴다.
 *
 * 출처: CDC/NIA 「Growing Stronger: Strength Training for Older Adults」
 * (미국 질병통제예방센터 발행, Tufts 대학 개발). 원문의 규칙을 그대로 옮겼다.
 *   · "raising the weight (to a count of two to four) and then lowering it
 *      (to a count of four) in a smooth, fluid motion"
 *   · "breathe regularly throughout the exercises — don't hold your breath!"
 *   · "Don't lock your elbows; keep a slight bend in your arms"
 *   · "Don't let momentum do the work"
 */
export const COMMON_STRENGTH_STEPS: readonly string[] = [
  '힘을 주는 동안 둘을 세고, 돌아올 때는 넷을 세며 천천히 움직입니다.',
  '힘줄 때 숨을 내쉬고 돌아올 때 들이마십니다. 숨을 참지 마세요.',
  '팔꿈치나 무릎을 끝까지 펴서 잠그지 말고, 살짝 굽힌 상태로 두세요.',
  '반동을 쓰지 말고, 한 세트가 끝나면 1분쯤 쉬었다가 다음 세트를 합니다.',
];

/**
 * 유산소용 공통 규칙. 근력과 달리 "세트"가 없고 "이어서 하는 시간"이 핵심이라
 * 따로 둔다.
 */
export const COMMON_CARDIO_STEPS: readonly string[] = [
  '숨이 너무 차거나 어지러우면 속도를 낮추거나 잠시 멈춥니다.',
];

/**
 * 도감에 순서가 아직 안 채워진 운동을 위한 최소한의 안내.
 *
 * 예전에는 이 자리에 "자리에 앉아 등받이에 붙이고 …" 같은 머신 전용 문장이
 * 있었다. 그게 랫 풀다운·의자 스쿼트·데드버그에도 똑같이 나갔다 — 기구와
 * 다른 말을 하는 안내는 없느니만 못하다. 그래서 어떤 운동에도 틀리지 않는
 * 말만 남겼다.
 */
export const FALLBACK_STEPS: readonly string[] = [
  '기구에 붙은 안내 그림을 보고 자리와 높이를 몸에 맞춥니다.',
  '자세를 잡은 뒤 천천히 힘을 주고, 천천히 처음 자리로 돌아옵니다.',
];

/** 근력: "3세트 × 12회", 유산소: "15분" 처럼 오늘 할 양을 한 줄로. 값이 없으면 null. */
export function formatVolume(item: RoutineItem): string | null {
  if (item.target_duration_minutes !== null) return `${item.target_duration_minutes}분`;
  if (item.target_sets === null || item.target_reps === null) return null;
  return `${item.target_sets}세트 × ${item.target_reps}회`;
}

/** 처방 단위가 시간(분)인 유산소 항목인지. */
export function isCardioItem(item: RoutineItem): boolean {
  return item.target_duration_minutes !== null;
}

/**
 * 마친 뒤 "핀 몇 칸이었나요?"를 물어도 되는 운동인지.
 *
 * 유산소만 예외로 두면 안 된다 — 의자 스쿼트·벽 팔굽혀펴기 같은 맨몸운동도
 * 꽂을 핀이 없다. 그런 운동에 핀을 물으면 대답할 수 없는 것을 요구하는 셈이라,
 * 입력이 빌 수밖에 없고 "기록하고 마치기"가 영영 눌리지 않는다.
 * 무게가 있는 기구 운동일 때만 참이다.
 */
export function needsWeightLog(item: RoutineItem): boolean {
  return !isCardioItem(item) && item.target_weight !== null;
}

/**
 * 무게 안내.
 *
 * kg 을 단정해서 알려주지 않는다. 같은 10kg 라도 기구마다 핀 칸 수가 다르고,
 * 그날 컨디션도 다르다. 대신 "마지막 한 개가 얼마나 힘든가"로 판단하게 한다 —
 * 개인이 알아서 맞추게 되고, 무리해서 다칠 일이 적다.
 * DB 가 계산한 무게는 시작점으로만 참고하게 둔다.
 */
export function weightHint(item: RoutineItem): string {
  if (item.target_weight === null) {
    return '기구에 무게가 없는 운동입니다. 몸으로만 천천히 하세요.';
  }
  // 지난번에 꽂았던 칸이 있으면 그게 가장 좋은 시작점이다 — 본인이 실제로
  // 해 본 값이라 kg 환산 계산보다 정확하고, 기구 앞에서 바로 따라 할 수 있다.
  if (item.last_pin !== null) {
    return `지난번엔 ${item.last_pin}번째 칸이었어요. 거기서 시작하세요.`;
  }
  return `${item.target_weight}kg 근처에서 시작해 보세요.`;
}

export const WEIGHT_RULE =
  '마지막 한 개를 들 때 "두세 개는 더 하겠다" 싶으면 다음에 한 칸 올리고, "더는 못 들겠다" 싶으면 한 칸 내리세요.';

export const FIRST_TIME_RULE = '처음 해 보시는 기구라면 맨 위 한두 칸에서 시작하세요.';

/**
 * 이 운동의 "하는 방법" 전체. 도감의 운동별 순서 뒤에 공통 규칙을 붙인다.
 * 도감이 비어 있으면 어떤 운동에도 틀리지 않는 최소 안내로 대신한다.
 */
export function howToSteps(item: RoutineHowTo): string[] {
  const own = item.how_to_steps?.length ? item.how_to_steps : FALLBACK_STEPS;
  const common = item.target_duration_minutes != null ? COMMON_CARDIO_STEPS : COMMON_STRENGTH_STEPS;
  return [...own, ...common];
}

/** howToSteps 가 필요로 하는 최소한의 모양. RoutineItem 과 EquipmentLookup 둘 다 만족한다. */
export type RoutineHowTo = {
  how_to_steps: string[] | null;
  /** 유산소인지 가르는 값. 기구 조회(EquipmentLookup)에는 없으므로 없어도 된다. */
  target_duration_minutes?: number | null;
};
