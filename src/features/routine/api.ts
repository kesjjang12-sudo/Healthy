import type {
  DailyRoutine,
  GenerateRoutineResult,
  RoutineCourse,
  VisitStats,
} from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = [
  'USER_NOT_FOUND',
  'ROUTINE_TEMPLATE_NOT_FOUND',
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'ROUTINE_NOT_FOUND',
] as const;

type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

const MESSAGES: Record<RpcErrorCode, string> = {
  USER_NOT_FOUND: '회원 정보를 찾지 못했습니다. 다시 로그인해 주세요.',
  ROUTINE_TEMPLATE_NOT_FOUND: '운동을 준비하지 못했습니다. 관리사무소에 알려주세요.',
  AUTH_REQUIRED: '로그인 후 다시 시도해 주세요.',
  FORBIDDEN: '이 정보를 볼 수 없습니다.',
  ROUTINE_NOT_FOUND: '운동을 찾지 못했습니다.',
};

export class RoutineError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RoutineError';
    this.cause = cause;
  }
}

function toRoutineError(error: RpcError): RoutineError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new RoutineError(MESSAGES[code], error);
  return new RoutineError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/**
 * 오늘의 루틴을 가져온다. 아직 없으면 만들고, 이미 있으면 그대로 돌려준다
 * (서버에서 no-op 이라 몇 번 불러도 안전하다).
 *
 * 이사 대응: 오늘 체크인한 헬스장이 있으면 그곳 기구로, 없으면 주 소속으로
 * 루틴을 만든다 — get_todays_checkin 이 그 판단을 대신 해 준다.
 */
export async function loadDailyRoutine(userId: string): Promise<GenerateRoutineResult> {
  const { data: checkin, error: checkinError } = await supabase.rpc('get_todays_checkin', {
    p_user_id: userId,
  });
  if (checkinError) throw toRoutineError(checkinError);

  const { data, error } = await supabase.rpc('generate_daily_routine', {
    p_user_id: userId,
    p_apt_id: checkin?.apt_id ?? undefined,
  });

  if (error) throw toRoutineError(error);
  if (!data) throw new RoutineError(GENERIC_ERROR_MESSAGE);

  return data;
}

/**
 * 코스(짧게 / 충분히)를 바꾸고 오늘 루틴을 그 자리에서 다시 짠다.
 * "내일부터 적용됩니다" 는 이미 헬스장에 와 있는 사람에게 쓸모가 없다.
 */
export async function setRoutineCourse(course: RoutineCourse): Promise<GenerateRoutineResult> {
  const { data, error } = await supabase.rpc('set_routine_course', { p_course: course });

  if (error) throw toRoutineError(error);
  if (!data) throw new RoutineError(GENERIC_ERROR_MESSAGE);

  return data;
}

/** 세트를 다 마친 뒤 실제 기록을 저장하고 포인트를 받는다. */
export async function completeRoutine(
  routineId: string,
  actualWeightKg: number | null,
  actualReps: number | null,
): Promise<{ routine: DailyRoutine; pointsAwarded: number }> {
  const { data, error } = await supabase.rpc('complete_routine', {
    p_routine_id: routineId,
    p_actual_weight_kg: actualWeightKg ?? undefined,
    p_actual_reps: actualReps ?? undefined,
  });

  if (error) throw toRoutineError(error);
  if (!data) throw new RoutineError(GENERIC_ERROR_MESSAGE);

  return { routine: data.routine, pointsAwarded: data.points_awarded };
}

/**
 * "올려볼게요" / "조금 내릴게요" 를 눌렀을 때 그 무게를 이 기구의 기준으로 삼는다.
 *
 * 제안은 서버가 하지만 적용은 여기서만 일어난다 — 앱이 알아서 올리면 다쳤을 때
 * 앱의 판단이 되고, 무게가 무거운지는 화면이 아니라 그 사람 몸만 안다.
 */
export async function applyWeightSuggestion(equipId: string, weightKg: number): Promise<void> {
  const { error } = await supabase.rpc('apply_weight_suggestion', {
    p_equip_id: equipId,
    p_weight_kg: weightKg,
  });

  if (error) throw toRoutineError(error);
}

/** 운동 탭 상단 "DAY_N" 배지용. */
export async function getVisitStats(userId: string): Promise<VisitStats> {
  const { data, error } = await supabase.rpc('get_visit_stats', { p_user_id: userId });

  if (error) throw toRoutineError(error);
  if (!data) throw new RoutineError(GENERIC_ERROR_MESSAGE);

  return data;
}
