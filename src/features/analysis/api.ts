import type { ProgressSummary, WorkoutSummary } from '@/lib/database.types';
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
 * 최근 p_days 와 직전 같은 길이 기간을 나란히 + 연속 출석 주 수.
 * 화면은 이 둘을 비교해 "잘하고 있나"를 한 줄로 만든다(progress.ts).
 */
export async function getProgressSummary(userId: string, days: number): Promise<ProgressSummary> {
  const { data, error } = await supabase.rpc('get_progress_summary', {
    p_user_id: userId,
    p_days: days,
  });

  if (error) throw toAnalysisError(error);
  if (!data) throw new AnalysisError(GENERIC_ERROR_MESSAGE);

  return data;
}
