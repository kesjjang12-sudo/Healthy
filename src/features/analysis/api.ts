import type {
  EffortTotals,
  ProgressSummary,
  WorkoutShareCard,
  WorkoutSummary,
  WorkoutTrend,
} from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';
import { toDateKey } from '@/features/calendar/date-utils';

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'FORBIDDEN'] as const;

export class AnalysisError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AnalysisError';
    this.cause = cause;
  }
}

function toAnalysisError(error: RpcError): AnalysisError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new AnalysisError('로그인 후 다시 시도해 주세요.', error);
  return new AnalysisError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/** 기간 내 완료 운동 원시 집계. 칼로리 등 가공은 calorie.ts 가 클라이언트에서 계산한다. */
export async function getWorkoutSummary(
  userId: string,
  from: Date,
  to: Date,
): Promise<WorkoutSummary> {
  const { data, error } = await supabase.rpc('get_workout_summary', {
    p_user_id: userId,
    p_from: toDateKey(from),
    p_to: toDateKey(to),
  });

  if (error) throw toAnalysisError(error);
  if (!data) throw new AnalysisError(GENERIC_ERROR_MESSAGE);

  return data;
}

/**
 * 추이 그래프용 시계열. 운동이 없는 구간도 0 으로 채워져서 온다.
 *
 * bucket='week' 은 기간이 7의 배수일 때만 받는다 — 30일을 7일씩 자르면
 * 마지막 칸이 이틀짜리가 되어 그 칸만 낮게 나오고, "요즘 덜 한다"로 잘못
 * 읽힌다. 그래서 화면은 28일(4주)로 부른다.
 */
export async function getWorkoutTrend(
  userId: string,
  from: Date,
  to: Date,
  bucket: 'day' | 'week',
): Promise<WorkoutTrend> {
  const { data, error } = await supabase.rpc('get_workout_trend', {
    p_user_id: userId,
    p_from: toDateKey(from),
    p_to: toDateKey(to),
    p_bucket: bucket,
  });

  if (error) throw toAnalysisError(error);
  if (!data) throw new AnalysisError(GENERIC_ERROR_MESSAGE);

  return data;
}

/**
 * 오늘 운동 한 장 요약. 완료한 운동이 하나도 없으면 null 을 돌려준다
 * (오류가 아니다 — 아직 안 한 것뿐이라 화면에서 조용히 넘어가면 된다).
 */
export async function getWorkoutShareCard(
  userId: string,
  date?: Date,
): Promise<WorkoutShareCard | null> {
  const { data, error } = await supabase.rpc('get_workout_share_card', {
    p_user_id: userId,
    p_date: date ? toDateKey(date) : undefined,
  });

  if (error) throw toAnalysisError(error);
  return data ?? null;
}

/**
 * 최근 p_days 와 직전 같은 길이 기간을 나란히 + 연속 출석 주 수.
 * 화면은 이 둘을 비교해 "잘하고 있나"를 한 줄로 만든다(progress.ts).
 */
/** 이번 주·이번 달·전체 누적 노력(유산소 분, 든 무게, 운동 횟수). */
export async function getEffortTotals(): Promise<EffortTotals> {
  const { data, error } = await supabase.rpc('get_effort_totals', {});
  if (error) throw toAnalysisError(error);
  if (!data) throw new AnalysisError(GENERIC_ERROR_MESSAGE);
  return data;
}

export async function getProgressSummary(userId: string, days: number): Promise<ProgressSummary> {
  const { data, error } = await supabase.rpc('get_progress_summary', {
    p_user_id: userId,
    p_days: days,
  });

  if (error) throw toAnalysisError(error);
  if (!data) throw new AnalysisError(GENERIC_ERROR_MESSAGE);

  return data;
}
