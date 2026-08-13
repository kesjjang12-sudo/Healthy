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
 * 이 헬스장을 주 소속으로 바꾼다 — 곧 "이사했다"는 뜻이므로 다니던 다른
 * 헬스장에서는 빠진다(그 단지 랭킹에 더는 안 나온다). 방문 이력과 운동 기록은
 * 그대로 남는다.
 *
 * 떠나게 된 헬스장 수를 돌려준다. 화면이 "이전 헬스장에서 빠졌습니다"를
 * 실제로 그런 경우에만 말할 수 있게 하기 위해서다.
 */
export async function makeGymPrimary(userId: string, aptId: string): Promise<number> {
  const { data, error } = await supabase.rpc('confirm_gym_membership', {
    p_user_id: userId,
    p_apt_id: aptId,
    p_make_primary: true,
  });

  if (error) throw toMembershipError(error);
  return data?.left_count ?? 0;
}

/**
 * "오늘만 방문했어요". 소속은 그대로 두고, 30일간 같은 헬스장에서 이사 여부를
 * 다시 묻지 않는다 — 두 헬스장을 정말로 번갈아 쓰는 사람에게 올 때마다 같은
 * 팝업을 띄우지 않기 위해서다.
 */
export async function declineGymSwitch(userId: string, aptId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_gym_membership', {
    p_user_id: userId,
    p_apt_id: aptId,
    p_make_primary: false,
  });

  if (error) throw toMembershipError(error);
}
