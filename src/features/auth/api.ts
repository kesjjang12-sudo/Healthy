import type { SignInResult } from '@/lib/database.types';
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
  'PHONE_REGISTERED_TO_OTHER_APARTMENT',
] as const;

export type AuthErrorCode = (typeof RPC_ERROR_CODES)[number] | 'NETWORK' | 'UNKNOWN';

/** 시니어가 읽고 바로 다음 행동을 알 수 있는 문구로만 쓴다. */
const MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_PHONE_NUMBER: '전화번호를 다시 확인해 주세요.',
  APARTMENT_NOT_FOUND: '태블릿 설정에 문제가 있습니다. 관리사무소에 알려주세요.',
  PHONE_REGISTERED_TO_OTHER_APARTMENT: '다른 단지에 등록된 번호입니다. 관리사무소에 문의해 주세요.',
  NETWORK: NETWORK_ERROR_MESSAGE,
  UNKNOWN: GENERIC_ERROR_MESSAGE,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'AuthError';
    this.code = code;
    this.cause = cause;
  }
}

function toAuthError(error: RpcError): AuthError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new AuthError(code, error);
  if (isNetworkError(error)) return new AuthError('NETWORK', error);
  return new AuthError('UNKNOWN', error);
}

/**
 * 태블릿 번호 입력 인증.
 * 신규 번호면 가입, 기존 번호면 로그인이고 하루 첫 인증이면 출석까지 기록된다.
 */
export async function signInWithPhone(phoneNumber: string): Promise<SignInResult> {
  const { data, error } = await supabase.rpc('sign_in_with_phone', {
    p_apt_id: APT_ID,
    p_phone_number: toDigits(phoneNumber),
  });

  if (error) throw toAuthError(error);
  if (!data) throw new AuthError('UNKNOWN');

  return data;
}
