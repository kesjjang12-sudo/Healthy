/**
 * 근력운동 완료 기록만으로 대략적인 소모 칼로리를 추정한다.
 *
 * 심박수·산소소비량 같은 실측값이 없으니 정확한 값이 아니다 — MET(대사당량)
 * 표의 "저항운동, 일반" 통용치(약 5.0)를 쓰는 일반적인 근사식이다. 화면엔
 * 반드시 "대략치"라고 밝힌다. 유산소/러닝 기록은 이번 스코프가 아니라 여기
 * 안 들어간다.
 *
 * 공식이 데모 피드백으로 자주 바뀔 걸 대비해 RPC(SQL)가 아니라 여기(클라이언트
 * 순수 함수)에서 계산한다 — 숫자 하나 조정하려고 매번 마이그레이션을 만들지
 * 않아도 된다.
 */

const DEFAULT_MET = 5.0;
const DEFAULT_BODY_WEIGHT_KG = 65;
const DEFAULT_SET_DURATION_SEC = 40;
const DEFAULT_REST_SEC = 60;

export type CalorieEstimateInput = {
  /** 완료한 운동 개수(=daily_routines 행 수). */
  completedCount: number;
  /** 완료한 세트 총합. 없으면 completedCount 로 대략 어림잡는다. */
  totalSets?: number;
  bodyWeightKg?: number;
  metValue?: number;
};

/** kcal = 시간(분) × (MET × 3.5 × 체중kg) / 200. 흔히 쓰는 운동 칼로리 근사식. */
export function estimateCalories({
  completedCount,
  totalSets,
  bodyWeightKg = DEFAULT_BODY_WEIGHT_KG,
  metValue = DEFAULT_MET,
}: CalorieEstimateInput): number {
  const sets = totalSets ?? completedCount * 3; // 세트 수 정보가 없으면 운동당 3세트로 가정
  const totalMinutes = (sets * (DEFAULT_SET_DURATION_SEC + DEFAULT_REST_SEC)) / 60;
  const kcal = (totalMinutes * (metValue * 3.5 * bodyWeightKg)) / 200;
  return Math.round(kcal);
}
