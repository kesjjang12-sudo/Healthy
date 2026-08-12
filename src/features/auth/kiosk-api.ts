import type { KioskCheckInResult } from '@/lib/database.types';
import { APT_ID } from '@/lib/env';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

import { toDigits } from './phone';

const RPC_ERROR_CODES = [
  'INVALID_PHONE_NUMBER',
  'APARTMENT_NOT_FOUND',
  'PAIRING_CODE_GENERATION_FAILED',
] as const;

export type CheckInErrorCode = (typeof RPC_ERROR_CODES)[number] | 'NETWORK' | 'UNKNOWN';

const MESSAGES: Record<CheckInErrorCode, string> = {
  INVALID_PHONE_NUMBER: '전화번호를 다시 확인해 주세요.',
  APARTMENT_NOT_FOUND: '태블릿 설정에 문제가 있습니다. 관리사무소에 알려주세요.',
  PAIRING_CODE_GENERATION_FAILED: '잠시 후 다시 시도해 주세요.',
  NETWORK: NETWORK_ERROR_MESSAGE,
  UNKNOWN: GENERIC_ERROR_MESSAGE,
};

export class CheckInError extends Error {
  readonly code: CheckInErrorCode;

  constructor(code: CheckInErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'CheckInError';
    this.code = code;
    this.cause = cause;
  }
}

function toCheckInError(error: RpcError): CheckInError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new CheckInError(code, error);
  if (isNetworkError(error)) return new CheckInError('NETWORK', error);
  return new CheckInError('UNKNOWN', error);
}

/**
 * 키오스크 출입 체크인. sign_in_with_phone 을 대체한다.
 * 개인정보(이름/포인트/루틴)는 절대 돌아오지 않는다 — user_id, 방문 횟수,
 * 페어링 필요 여부뿐이다.
 */
export async function kioskCheckIn(phoneNumber: string): Promise<KioskCheckInResult> {
  const { data, error } = await supabase.rpc('kiosk_check_in', {
    p_apt_id: APT_ID,
    p_phone_number: toDigits(phoneNumber),
  });

  if (error) throw toCheckInError(error);
  if (!data) throw new CheckInError('UNKNOWN');

  return data;
}
