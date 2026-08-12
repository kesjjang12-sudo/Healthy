import type { RoutineItem } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

import { toDateKey } from './date-utils';

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'FORBIDDEN'] as const;

export class CalendarError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CalendarError';
    this.cause = cause;
  }
}

function toCalendarError(error: RpcError): CalendarError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new CalendarError('로그인 후 다시 시도해 주세요.', error);
  return new CalendarError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/** 해당 월에 출석한 날짜 집합. 어느 헬스장이든 상관없이 하루라도 갔으면 포함된다. */
export async function getAttendanceDays(userId: string, month: Date): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_attendance_days', {
    p_user_id: userId,
    p_month: toDateKey(month),
  });

  if (error) throw toCalendarError(error);
  return new Set(data ?? []);
}

/** 특정 날짜에 한 운동 목록. 새로 만들지 않고 그날 이미 있던 것만 읽는다. */
export async function getRoutineForDate(userId: string, date: Date): Promise<RoutineItem[]> {
  const { data, error } = await supabase.rpc('get_daily_routine', {
    p_user_id: userId,
    p_date: toDateKey(date),
  });

  if (error) throw toCalendarError(error);
  return data ?? [];
}
