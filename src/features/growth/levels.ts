/**
 * 명예 호칭 7단계.
 *
 * 포인트(total_points)를 경험치로 읽어 호칭을 올린다. 무게가 아니라
 * 꾸준함이 평가받는 앱이라, 경험치도 출석(+30)·운동 완료(+10)·주 3회
 * 보너스(+50) 같은 꾸준함 신호로만 쌓인다(20260817000001 참고).
 *
 * 이름은 4060 이 실제로 쓰고 인정하는 말에서 골랐다 — "살림 9단",
 * "생활의 달인", "천하장사". 문턱값은 주 3회 나오는 회원 기준으로
 * 성실회원까지 1주, 모범회원 1달, 고수 3달, 달인 반년, 9단 1년,
 * 천하장사 2년쯤 걸리게 잡았다. ⚠️ 수치는 운영 검수 대상.
 */

export type GrowthLevel = {
  /** 0부터. 배지 색·모양 선택에 쓴다. */
  readonly index: number;
  readonly name: string;
  /** 이 호칭이 되는 데 필요한 누적 경험치 */
  readonly minXp: number;
};

export const GROWTH_LEVELS: readonly GrowthLevel[] = [
  { index: 0, name: '새내기', minXp: 0 },
  { index: 1, name: '성실회원', minXp: 300 },
  { index: 2, name: '모범회원', minXp: 1000 },
  { index: 3, name: '운동 고수', minXp: 3000 },
  { index: 4, name: '운동 달인', minXp: 7000 },
  { index: 5, name: '운동 9단', minXp: 15000 },
  { index: 6, name: '천하장사', minXp: 30000 },
] as const;

export type GrowthStatus = {
  level: GrowthLevel;
  /** 다음 호칭. 천하장사면 null. */
  next: GrowthLevel | null;
  /** 다음 호칭까지 남은 경험치. 천하장사면 0. */
  remaining: number;
  /** 이번 구간에서 얼마나 왔는지 (0~1). 진행 바용. 천하장사면 1. */
  progress: number;
};

export function growthStatus(xp: number): GrowthStatus {
  const safe = Math.max(0, xp);
  let level = GROWTH_LEVELS[0];
  for (const candidate of GROWTH_LEVELS) {
    if (safe >= candidate.minXp) level = candidate;
  }
  const next = GROWTH_LEVELS[level.index + 1] ?? null;
  if (!next) return { level, next: null, remaining: 0, progress: 1 };

  const span = next.minXp - level.minXp;
  return {
    level,
    next,
    remaining: next.minXp - safe,
    progress: Math.min(1, (safe - level.minXp) / span),
  };
}

/**
 * 경험치가 before → after 로 늘 때 승급했는지. 승급했다면 새 호칭을 준다.
 * 운동을 마친 직후 "진화" 축하를 띄울지 판단하는 데 쓴다.
 */
export function levelUpBetween(before: number, after: number): GrowthLevel | null {
  const a = growthStatus(before).level;
  const b = growthStatus(after).level;
  return b.index > a.index ? b : null;
}
