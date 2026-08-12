import type { GenerateRoutineResult } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['USER_NOT_FOUND', 'ROUTINE_TEMPLATE_NOT_FOUND'] as const;

const MESSAGES: Record<(typeof RPC_ERROR_CODES)[number], string> = {
  USER_NOT_FOUND: '회원 정보를 찾지 못했습니다. 번호부터 다시 눌러주세요.',
  ROUTINE_TEMPLATE_NOT_FOUND: '운동을 준비하지 못했습니다. 관리사무소에 알려주세요.',
};

export class RoutineError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RoutineError';
    this.cause = cause;
  }
}

/**
 * 오늘의 루틴을 가져온다. 아직 없으면 만들고, 이미 있으면 그대로 돌려준다
 * (서버에서 no-op 이라 몇 번 불러도 안전하다).
 *
 * 미리 조합해 둔 템플릿에서 고르는 방식이라 AI 응답을 기다리지 않는다.
 */
export async function loadDailyRoutine(userId: string): Promise<GenerateRoutineResult> {
  const { data, error } = await supabase.rpc('generate_daily_routine', { p_user_id: userId });

  if (error) {
    const code = matchErrorCode(error, RPC_ERROR_CODES);
    if (code) throw new RoutineError(MESSAGES[code], error);
    throw new RoutineError(
      isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
      error,
    );
  }

  if (!data) throw new RoutineError(GENERIC_ERROR_MESSAGE);

  return data;
}
