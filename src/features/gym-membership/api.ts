import type { GymMembershipSummary } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'FORBIDDEN', 'USER_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND'] as const;

export class GymMembershipError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'GymMembershipError';
    this.cause = cause;
  }
}

function toMembershipError(error: RpcError): GymMembershipError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new GymMembershipError('처리하지 못했습니다. 다시 시도해 주세요.', error);
  return new GymMembershipError(
    isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE,
    error,
  );
}

/** 내가 다닌 헬스장 목록(주 소속 우선, 최근 방문순). */
export async function listMyGymMemberships(userId: string): Promise<GymMembershipSummary[]> {
  const { data, error } = await supabase.rpc('list_my_gym_memberships', { p_user_id: userId });

  if (error) throw toMembershipError(error);
  return data ?? [];
}

/**
 * 지금 로그인한 사람을 이 단지 헬스장에 소속시킨다.
 *
 * 태블릿을 한 번도 안 거친 계정은 users.apt_id 가 null 이라, 루틴을 짤 때
 * "이 단지 기구" 가 0건으로 잡혀 오늘의 운동이 통째로 비어 버린다.
 * 출석은 만들지 않는다 — 출석은 실제로 왔다는 기록이라 여기서 올리면 안 된다.
 */
export async function joinGym(aptId: string): Promise<void> {
  const { error } = await supabase.rpc('join_gym', { p_apt_id: aptId });

  if (error) throw toMembershipError(error);
}

/** 이 헬스장을 주 소속으로 바꾼다. */
export async function makeGymPrimary(userId: string, aptId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_gym_membership', {
    p_user_id: userId,
    p_apt_id: aptId,
    p_make_primary: true,
  });

  if (error) throw toMembershipError(error);
}
