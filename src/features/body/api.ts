import type { BodyStatus } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['AUTH_REQUIRED', 'USER_NOT_FOUND', 'INVALID_WEIGHT', 'INVALID_HEIGHT'] as const;

const MESSAGES: Record<(typeof RPC_ERROR_CODES)[number], string> = {
  AUTH_REQUIRED: '로그인 후 다시 시도해 주세요.',
  USER_NOT_FOUND: '회원 정보를 찾지 못했습니다.',
  INVALID_WEIGHT: '몸무게는 25~250kg 사이로 입력해 주세요.',
  INVALID_HEIGHT: '키는 100~220cm 사이로 입력해 주세요.',
};

export class BodyError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BodyError';
    this.cause = cause;
  }
}

function toBodyError(error: RpcError): BodyError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new BodyError(MESSAGES[code], error);
  return new BodyError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/** 내 키·몸무게 현황과 최근 기록. 분석 탭과 운동 탭 팝업이 같이 쓴다. */
export async function getBodyStatus(): Promise<BodyStatus> {
  const { data, error } = await supabase.rpc('get_body_status');

  if (error) throw toBodyError(error);
  if (!data) throw new BodyError(GENERIC_ERROR_MESSAGE);

  return data;
}

/** 오늘 몸무게를 기록한다. 같은 날 다시 기록하면 덮어쓴다. */
export async function logBodyWeight(weightKg: number, heightCm?: number): Promise<BodyStatus> {
  const { data, error } = await supabase.rpc('log_body_weight', {
    p_weight_kg: weightKg,
    p_height_cm: heightCm,
  });

  if (error) throw toBodyError(error);
  if (!data) throw new BodyError(GENERIC_ERROR_MESSAGE);

  return data;
}

/**
 * "72.5" 같은 입력을 몸무게 숫자로. 소수점 한 자리까지만 받는다.
 * 잘못된 값이면 null — 저장 버튼을 비활성화하는 근거가 된다.
 */
export function parseWeightInput(text: string): number | null {
  if (!/^\d{2,3}(\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return value >= 25 && value <= 250 ? value : null;
}

/** 키 입력(정수 cm). */
export function parseHeightInput(text: string): number | null {
  if (!/^\d{3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 100 && value <= 220 ? value : null;
}

/** 몸무게 입력 칸에 허용되는 중간 상태(숫자 + 소수점 하나)만 남긴다. */
export function sanitizeWeightText(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const match = /^(\d{0,3})(\.\d?)?/.exec(cleaned);
  return match ? `${match[1]}${match[2] ?? ''}` : '';
}
