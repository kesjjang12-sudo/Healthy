import type { RoutineItem } from '@/lib/database.types';

/**
 * 기구 앞에서 읽는 안내 문구.
 *
 * 기구별 개별 설명은 아직 DB에 없다(equipments 에 name / target_muscle / video_url 뿐).
 * 그래서 여기 있는 건 웨이트 기구에 공통으로 맞는 순서다. 억지로 기구 이름을 넣어
 * 그럴듯한 문장을 지어내면 틀린 자세를 알려주게 되므로, 맞는 말만 적었다.
 * 기구마다 다른 설명은 equipments 에 칸을 만들고 트레이너가 채우는 게 맞다.
 */
export const HOW_TO_STEPS: readonly string[] = [
  '자리에 앉아 등과 허리를 등받이에 붙입니다.',
  '손잡이나 발판을 잡고, 팔다리가 너무 굽지 않게 자리를 맞춥니다.',
  '힘을 주면서 둘 셀 동안 밀고, 셋 셀 동안 천천히 돌아옵니다.',
  '밀 때 숨을 내쉬고, 돌아올 때 들이마십니다.',
  '한 세트가 끝나면 1분쯤 쉬었다가 다음 세트를 합니다.',
];

/** "3세트 × 12회" 처럼 오늘 할 양을 한 줄로. 값이 없으면 null. */
export function formatVolume(item: RoutineItem): string | null {
  if (item.target_sets === null || item.target_reps === null) return null;
  return `${item.target_sets}세트 × ${item.target_reps}회`;
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
  return `${item.target_weight}kg 근처에서 시작해 보세요.`;
}

export const WEIGHT_RULE =
  '마지막 한 개를 들 때 "두세 개는 더 하겠다" 싶으면 다음에 한 칸 올리고, "더는 못 들겠다" 싶으면 한 칸 내리세요.';

export const FIRST_TIME_RULE = '처음 해 보시는 기구라면 맨 위 한두 칸에서 시작하세요.';
