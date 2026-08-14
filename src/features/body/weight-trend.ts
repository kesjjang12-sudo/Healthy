import type { BodyWeightLog } from '@/lib/database.types';

/**
 * 몸무게 추이 그래프의 좌표 계산. 그리는 일(weight-chart.tsx)과 나눠 둔다.
 *
 * 여기서 정하는 것이 사실상 "이 그래프가 무엇을 말하는가"라서, 눈금을 어떻게
 * 잡느냐에 따라 같은 기록이 "잘 빠지고 있다"로도 "요동친다"로도 보인다.
 * 아래 두 상수가 그 판단이다.
 */

/**
 * 세로축이 아무리 좁아도 이만큼(kg)은 잡는다.
 *
 * 몸무게는 하루에도 1~2kg 오르내린다(화면 아래 안내문에도 그렇게 적어 뒀다).
 * 실제 변화 폭에 딱 맞춰 축을 잡으면 그 하루치 잡음이 화면 전체를 채워서,
 * 0.3kg 늘어난 날이 절벽처럼 보인다. 그 그래프를 본 사람은 겁을 먹고 기록을
 * 그만둔다 — 기록이 끊기는 것이 가장 나쁜 결과다.
 *
 * 4kg 을 깔아 두면 1kg 짜리 흔들림은 화면의 4분의 1만 차지한다. 보이기는
 * 하지만 사건처럼 보이지는 않는다.
 */
const MIN_SPAN_KG = 4;

/**
 * 이 일수보다 오래 비면 그 구간은 점선으로 잇는다.
 *
 * 한 달 만에 잰 두 값을 실선으로 이으면 그 사이를 아는 것처럼 보이는데, 모른다.
 * 안 잰 기간을 실선으로 메워 주면 "꾸준히 쟀다"는 착각까지 준다.
 *
 * 기준을 일주일로 둔 이유: 매일 잴 거라고 기대하면 안 된다. 주 1회는 그 자체로
 * 멀쩡한 습관인데 그것까지 점선으로 그으면 선 전체가 점선이 되고, 잘 하고 있는
 * 사람에게 뭔가 잘못했다고 말하는 그래프가 된다. 일주일을 넘겨야 공백이다.
 */
const GAP_DAYS = 7;

export type TrendPoint = {
  x: number;
  y: number;
  logDate: string;
  weightKg: number;
};

export type TrendSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 측정이 오래 빈 구간 — 점선으로 긋는다 */
  isGap: boolean;
};

export type WeightTrend = {
  points: TrendPoint[];
  segments: TrendSegment[];
  /** 세로축 위/아래 눈금(kg). 라벨로 그대로 쓰려고 정수로 맞춰 둔다 */
  maxKg: number;
  minKg: number;
  /** 처음 잰 몸무게의 y 좌표 — 기준선을 여기에 긋는다 */
  baselineY: number;
};

/** 'YYYY-MM-DD' → 일 단위 정수. UTC 로 읽어야 시간대 때문에 하루가 밀리지 않는다. */
function toDayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** 2026-08-14 → 8월 14일 */
export function formatMonthDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/** 오래된 것부터. RPC 는 최신순으로 주는데 그래프는 왼쪽이 과거다. */
function oldestFirst(logs: BodyWeightLog[]): BodyWeightLog[] {
  return [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
}

/**
 * 기록을 그래프 좌표로 옮긴다. 점이 두 개는 있어야 선이 되므로 그 전에는 null.
 *
 * 가로축은 순서가 아니라 날짜다. 일정한 간격으로 찍으면 2주 만에 잰 값과
 * 어제 잰 값이 같은 거리에 놓여서, 안 잰 기간이 그래프에서 사라진다.
 */
export function buildWeightTrend(
  logs: BodyWeightLog[],
  width: number,
  height: number,
  /** 점 반지름만큼은 띄워야 가장자리 점이 잘리지 않는다 */
  inset: number,
): WeightTrend | null {
  if (logs.length < 2) return null;
  if (width <= inset * 2 || height <= inset * 2) return null;

  const ordered = oldestFirst(logs);
  const days = ordered.map((log) => toDayNumber(log.log_date));
  const weights = ordered.map((log) => log.weight_kg);

  const firstDay = days[0];
  const daySpan = days[days.length - 1] - firstDay;
  // unique(user_id, log_date) 라 같은 날이 둘일 수 없지만, 0 으로 나누느니 접는다.
  if (daySpan <= 0) return null;

  const lowest = Math.min(...weights);
  const highest = Math.max(...weights);
  const middle = (lowest + highest) / 2;
  const span = Math.max(highest - lowest, MIN_SPAN_KG);
  // 눈금을 정수로 내리고 올린다. 라벨에 적히는 값과 선의 위치가 정확히 맞는다.
  const minKg = Math.floor(middle - span / 2);
  const maxKg = Math.ceil(middle + span / 2);

  const plotWidth = width - inset * 2;
  const plotHeight = height - inset * 2;
  const xOf = (day: number) => inset + ((day - firstDay) / daySpan) * plotWidth;
  const yOf = (kg: number) => inset + ((maxKg - kg) / (maxKg - minKg)) * plotHeight;

  const points: TrendPoint[] = ordered.map((log, index) => ({
    x: xOf(days[index]),
    y: yOf(log.weight_kg),
    logDate: log.log_date,
    weightKg: log.weight_kg,
  }));

  const segments: TrendSegment[] = points.slice(0, -1).map((point, index) => ({
    x1: point.x,
    y1: point.y,
    x2: points[index + 1].x,
    y2: points[index + 1].y,
    isGap: days[index + 1] - days[index] > GAP_DAYS,
  }));

  return { points, segments, maxKg, minKg, baselineY: yOf(weights[0]) };
}

/**
 * 그래프를 말로 옮긴다. 화면 읽기 프로그램에는 선과 점이 안 보이니, 그래프가
 * 하는 말("처음보다 얼마나 달라졌는가")을 한 문장으로 대신 준다.
 */
export function describeWeightTrend(logs: BodyWeightLog[]): string {
  if (logs.length === 0) return '몸무게 추이 그래프. 아직 기록이 없습니다.';

  const ordered = oldestFirst(logs);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  if (ordered.length === 1) {
    return `몸무게 추이 그래프. ${formatMonthDay(first.log_date)} ${first.weight_kg}킬로그램 한 번만 기록했습니다.`;
  }

  const delta = Math.round((last.weight_kg - first.weight_kg) * 10) / 10;
  const change =
    delta === 0
      ? '처음과 같습니다'
      : `${Math.abs(delta)}킬로그램 ${delta < 0 ? '줄었습니다' : '늘었습니다'}`;

  return (
    `몸무게 추이 그래프. ${formatMonthDay(first.log_date)} ${first.weight_kg}킬로그램에서 ` +
    `${formatMonthDay(last.log_date)} ${last.weight_kg}킬로그램으로 ${change}. ` +
    `기록 ${ordered.length}회.`
  );
}
