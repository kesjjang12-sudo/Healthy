import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';
import type { User } from '@/lib/database.types';

import { CONSENT_VERSION, type ConsentKey } from './consent-items';

const RPC_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'USER_NOT_FOUND',
  'CONSENT_REQUIRED',
  'CONSENT_NOT_REVOCABLE',
  'CONSENT_VERSION_REQUIRED',
  'UNKNOWN_CONSENT_KEY',
  'INVALID_CONSENT_PAYLOAD',
] as const;

type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

const MESSAGES: Record<RpcErrorCode, string> = {
  AUTH_REQUIRED: '로그인 후 다시 시도해 주세요.',
  FORBIDDEN: '이 정보를 볼 수 없습니다.',
  USER_NOT_FOUND: '회원 정보를 찾지 못했습니다. 다시 로그인해 주세요.',
  CONSENT_REQUIRED: '필수 항목에 모두 동의하셔야 서비스를 이용하실 수 있습니다.',
  CONSENT_NOT_REVOCABLE:
    '이 항목은 서비스 이용에 반드시 필요해서 따로 거둘 수 없습니다. 회원 탈퇴를 원하시면 문의해 주세요.',
  // 아래 둘은 화면이 제대로 동작하면 나올 수 없다. 사용자에게는 일반 문구를 보인다.
  CONSENT_VERSION_REQUIRED: GENERIC_ERROR_MESSAGE,
  UNKNOWN_CONSENT_KEY: GENERIC_ERROR_MESSAGE,
  INVALID_CONSENT_PAYLOAD: GENERIC_ERROR_MESSAGE,
};

export class ConsentError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConsentError';
    this.cause = cause;
  }
}

function toConsentError(error: RpcError): ConsentError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new ConsentError(MESSAGES[code], error);
  return new ConsentError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

export type ConsentState = Record<string, { agreed: boolean; version: string; recorded_at: string }>;

/**
 * 동의 화면에서 받은 항목을 한 번에 기록한다.
 *
 * 어느 버전 문서에 동의했는지가 같이 남아야 나중에 증명이 된다 — 그래서
 * 화면이 버전을 고르는 게 아니라 여기서 지금 앱에 들어 있는 버전을 붙인다.
 */
export async function recordConsents(
  userId: string,
  checked: Partial<Record<ConsentKey, boolean>>,
): Promise<User> {
  const { data, error } = await supabase.rpc('record_consents', {
    p_user_id: userId,
    p_version: CONSENT_VERSION,
    // undefined 를 그대로 보내면 서버에서 "안 물어본 것"과 "거부"가 구분되지
    // 않는다. 화면에 띄운 항목은 전부 true/false 로 확정해서 보낸다.
    p_consents: Object.fromEntries(
      Object.entries(checked).map(([key, value]) => [key, value === true]),
    ),
  });

  if (error) throw toConsentError(error);
  if (!data) throw new ConsentError(GENERIC_ERROR_MESSAGE);

  return data.user;
}

/** 선택 동의 철회. 서버가 기록만 남기는 게 아니라 저장된 값도 지운다. */
export async function revokeConsent(userId: string, key: ConsentKey): Promise<User> {
  const { data, error } = await supabase.rpc('revoke_consent', {
    p_user_id: userId,
    p_consent_key: key,
  });

  if (error) throw toConsentError(error);
  if (!data) throw new ConsentError(GENERIC_ERROR_MESSAGE);

  return data.user;
}

/** 항목별 현재 동의 상태. 프로필 화면이 철회 스위치를 그릴 때 쓴다. */
export async function getMyConsents(userId: string): Promise<ConsentState> {
  const { data, error } = await supabase.rpc('get_my_consents', { p_user_id: userId });

  if (error) throw toConsentError(error);

  return data ?? {};
}

/**
 * 키오스크에서 전화번호 수집 고지에 대한 동의를 기록한다.
 *
 * 태블릿 앞에 줄이 서 있으므로 실패해도 체크인을 막지 않는다 — 기록이
 * 목적이지 관문이 아니다. 대신 조용히 삼키지 않고 호출한 쪽이 판단하게 둔다.
 */
export async function recordKioskConsent(userId: string): Promise<void> {
  const { error } = await supabase.rpc('record_kiosk_consent', {
    p_user_id: userId,
    p_version: CONSENT_VERSION,
  });

  if (error) throw toConsentError(error);
}

/**
 * 이 사람에게 동의를 (다시) 받아야 하는지.
 *
 * 문서를 고치고 CONSENT_VERSION 을 올리면 기존 회원도 여기서 걸려 동의 화면을
 * 한 번 더 보게 된다.
 */
export function needsConsent(user: Pick<User, 'profile_data'> | null | undefined): boolean {
  return user?.profile_data?.consent?.version !== CONSENT_VERSION;
}
