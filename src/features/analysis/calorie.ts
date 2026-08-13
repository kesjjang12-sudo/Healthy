/**
 * 완료 기록만으로 대략적인 소모 칼로리를 추정한다.
 *
 * 심박수·산소소비량 같은 실측값이 없으니 정확한 값이 아니다 — MET(대사당량)
 * 표의 통용치를 쓰는 일반적인 근사식이다. 화면엔 반드시 "대략치"라고 밝힌다.
 *
 * 근력과 유산소를 따로 계산해 더한다. 둘은 강도도 다르고, 무엇보다 시간을
 * 아는 방식이 다르다 — 근력은 세트 수로 운동 시간을 어림잡지만, 유산소는
 * 앱이 잰 실제 수행 시간(daily_routines.actual_duration_minutes)이 그대로 있다.
 *
 * 공식이 데모 피드백으로 자주 바뀔 걸 대비해 RPC(SQL)가 아니라 여기(클라이언트
 * 순수 함수)에서 계산한다 — 숫자 하나 조정하려고 매번 마이그레이션을 만들지
 * 않아도 된다.
 */

/** 저항운동, 일반 */
const STRENGTH_MET = 5.0;
/**
 * 걷기·가벼운 유산소. 앱이 안내하는 강도가 "말은 할 수 있지만 노래는 못 부를
 * 정도"라 중간 강도 보행에 해당하는 값을 쓴다. 시니어 대상이라 뛰는 쪽(8~10)이
 * 아니라 걷는 쪽으로 잡았다 — 넘겨 잡으면 실제보다 많이 태운 것처럼 보인다.
 */
const CARDIO_MET = 4.0;

const DEFAULT_BODY_WEIGHT_KG = 65;
const DEFAULT_SET_DURATION_SEC = 40;
const DEFAULT_REST_SEC = 60;

export type CalorieEstimateInput = {
  /** 완료한 근력 운동 개수(=daily_routines 행 수). */
  strengthCount: number;
  /** 완료한 근력 세트 총합. 없으면 strengthCount 로 대략 어림잡는다. */
  strengthSets?: number;
  /** 실제로 움직인 유산소 시간 합계(분). */
  cardioMinutes?: number;
  bodyWeightKg?: number;
};

/** kcal = 시간(분) × (MET × 3.5 × 체중kg) / 200. 흔히 쓰는 운동 칼로리 근사식. */
function burned(minutes: number, met: number, bodyWeightKg: number): number {
  return (minutes * (met * 3.5 * bodyWeightKg)) / 200;
}

export function estimateCalories({
  strengthCount,
  strengthSets,
  cardioMinutes = 0,
  bodyWeightKg = DEFAULT_BODY_WEIGHT_KG,
}: CalorieEstimateInput): number {
  const sets = strengthSets ?? strengthCount * 3; // 세트 수 정보가 없으면 운동당 3세트로 가정
  // 근력은 "몇 분 했는지"를 안 받는다. 한 세트에 드는 시간과 세트 사이 쉬는
  // 시간을 더해 운동 시간을 되짚는다.
  const strengthMinutes = (sets * (DEFAULT_SET_DURATION_SEC + DEFAULT_REST_SEC)) / 60;

  return Math.round(
    burned(strengthMinutes, STRENGTH_MET, bodyWeightKg) +
      burned(cardioMinutes, CARDIO_MET, bodyWeightKg),
  );
}
