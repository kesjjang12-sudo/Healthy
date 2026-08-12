import type { EquipmentLookup } from '@/lib/database.types';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  matchErrorCode,
  type RpcError,
} from '@/lib/rpc-error';
import { supabase } from '@/lib/supabase';

const RPC_ERROR_CODES = ['EQUIPMENT_NOT_FOUND'] as const;

type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

const MESSAGES: Record<RpcErrorCode, string> = {
  EQUIPMENT_NOT_FOUND: '이 QR 은 등록된 기구가 아닙니다.',
};

export class EquipmentError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EquipmentError';
    this.cause = cause;
  }
}

function toEquipmentError(error: RpcError): EquipmentError {
  const code = matchErrorCode(error, RPC_ERROR_CODES);
  if (code) return new EquipmentError(MESSAGES[code], error);
  return new EquipmentError(isNetworkError(error) ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE, error);
}

/**
 * QR 코드 값으로 기구를 바로 찾는다. 오늘 처방 루틴에 있는지는 여기서
 * 신경 쓰지 않는다 — 그 판단(처방 루틴과 일치하면 그 화면으로, 아니면
 * 탐색용 화면으로)은 호출하는 쪽(scan.tsx)이 한다.
 */
export async function getEquipmentByQr(qrCode: string): Promise<EquipmentLookup> {
  const { data, error } = await supabase.rpc('get_equipment_by_qr', { p_qr_code: qrCode });

  if (error) throw toEquipmentError(error);
  if (!data) throw new EquipmentError(GENERIC_ERROR_MESSAGE);

  return data;
}
