import type { PairingStatus, User } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = [
  'AUTH_REQUIRED',
  'PAIRING_NOT_FOUND',
  'PAIRING_ALREADY_USED',
  'PAIRING_EXPIRED',
] as const;

export type PairingErrorCode = (typeof RPC_ERROR_CODES)[number] | 'NETWORK' | 'UNKNOWN';

const MESSAGES: Record<PairingErrorCode, string> = {
  AUTH_REQUIRED: '로그인 후 다시 시도해 주세요.',
  PAIRING_NOT_FOUND: '연결 코드를 찾을 수 없습니다. 태블릿에서 다시 확인해 주세요.',
  PAIRING_ALREADY_USED: '이미 연결된 코드입니다.',
  PAIRING_EXPIRED: '연결 시간이 지났습니다. 태블릿에서 다시 시도해 주세요.',
  NETWORK: NETWORK_ERROR_MESSAGE,
  UNKNOWN: GENERIC_ERROR_MESSAGE,
};

export class PairingError extends Error {
  readonly code: PairingErrorCode;

  constructor(code: PairingErrorCode, cause?: unknown) {
    super(MESSAGES[code]);
    this.name = 'PairingError';
    this.code = code;
    this.cause = cause;
  }
}

function toPairingError(error: RpcError): PairingError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new PairingError(code, error);
  if (isNetworkError(error)) return new PairingError('NETWORK', error);
  return new PairingError('UNKNOWN', error);
}

/** 키오스크가 2초 간격으로 폴링. PII 없이 상태 문자열만 돌아온다. */
export async function getPairingStatus(pairingCode: string): Promise<PairingStatus> {
  const { data, error } = await supabase.rpc('get_pairing_status', {
    p_pairing_code: pairingCode,
  });

  if (error) throw toPairingError(error);
  return (data?.status ?? 'not_found') as PairingStatus;
}

/** 폰 앱이 QR 을 스캔했거나 코드를 직접 입력한 뒤 호출한다. */
export async function completePairing(pairingCode: string): Promise<User> {
  const { data, error } = await supabase.rpc('complete_pairing', {
    p_pairing_code: pairingCode,
  });

  if (error) throw toPairingError(error);
  if (!data) throw new PairingError('UNKNOWN');

  return data.user;
}
