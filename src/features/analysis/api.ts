import type { WorkoutSummary } from '@/lib/database.types';
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
