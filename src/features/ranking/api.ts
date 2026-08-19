import type {
  ApartmentWeek,
  GlobalLeaderboardRow,
  LeaderboardOrder,
  LeaderboardRow,
} from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['AUTH_REQUIRED'] as const;

export class RankingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RankingError';
    this.cause = cause;
  }
}

function toRankingError(error: RpcError): RankingError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new RankingError('로그인 후 다시 시도해 주세요.', error);
  return new RankingError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/** 같은 단지 랭킹. 닉네임/포인트만 오고 전화번호 등 PII 는 없다. */
export async function getApartmentLeaderboard(
  aptId: string,
  order: LeaderboardOrder = 'attendance',
  limit = 50,
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_apartment_leaderboard', {
    p_apt_id: aptId,
    p_limit: limit,
    p_order: order,
  });

  if (error) throw toRankingError(error);
  return data ?? [];
}

/** 모든 단지 통합 랭킹. 단지 이름이 같이 온다. */
export async function getGlobalLeaderboard(
  order: LeaderboardOrder = 'attendance',
  limit = 50,
): Promise<GlobalLeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_global_leaderboard', {
    p_limit: limit,
    p_order: order,
  });

  if (error) throw toRankingError(error);
  return data ?? [];
}

/** 이번 주 단지 현황(요일별 출석·공동 목표·응원). */
export async function getApartmentWeek(aptId: string): Promise<ApartmentWeek> {
  const { data, error } = await supabase.rpc('get_apartment_week', { p_apt_id: aptId });
  if (error) throw toRankingError(error);
  return data as ApartmentWeek;
}

/** 오늘의 응원 남기기(하루 하나, 다시 누르면 바꾼다). 갱신된 주간 현황이 돌아온다. */
export async function cheerApartment(aptId: string, emoji: string): Promise<ApartmentWeek> {
  const { data, error } = await supabase.rpc('cheer_apartment', {
    p_apt_id: aptId,
    p_emoji: emoji,
  });
  if (error) throw toRankingError(error);
  return data as ApartmentWeek;
}
