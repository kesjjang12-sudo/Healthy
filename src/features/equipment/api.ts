import type { Equipment, EquipmentLookup } from '@/lib/database.types';
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

/** 가이드 목록 한 줄에 필요한 만큼만 가져온다. */
export type GuideEquipment = Pick<
  Equipment,
  'id' | 'name' | 'name_ko' | 'description' | 'target_muscle' | 'station_kind' | 'qr_code_val'
>;

export type EquipmentGuideSection = {
  muscle: string;
  items: GuideEquipment[];
};

/**
 * 부위 섹션이 화면에 나오는 순서. 유산소를 맨 앞에 두는 이유: 4060 은
 * 유산소만 하러 오는 사람이 가장 많고, 근력 기구가 낯선 사람도 여기서부터
 * 읽기 시작하면 부담이 없다.
 */
const MUSCLE_ORDER = ['유산소', '가슴', '등', '어깨', '하체', '복부', '팔'];

/**
 * 섹션 안 정렬: 맨몸 먼저, 그다음 기구. 맨몸은 기구가 차 있어도·집에서도
 * 되는 "지금 당장 할 수 있는" 운동이라 목록 앞에서 크게 보여준다.
 */
function sortBodyweightFirst(items: GuideEquipment[]): GuideEquipment[] {
  return [...items].sort((a, b) => {
    const aBody = a.station_kind === '맨몸' ? 0 : 1;
    const bBody = b.station_kind === '맨몸' ? 0 : 1;
    if (aBody !== bBody) return aBody - bBody;
    return (a.name_ko ?? a.name).localeCompare(b.name_ko ?? b.name, 'ko');
  });
}

/**
 * 헬스장의 모든 기구를 부위별 섹션으로 묶어서 돌려준다. 오늘 루틴과
 * 무관한 고정 참고 자료라서 처방 RPC 를 거치지 않고 목록만 읽는다.
 *
 * aptId 가 없으면(태블릿을 아직 안 거친 계정) 전체에서 같은 이름의 기구를
 * 하나로 접어서 보여준다 — 어느 헬스장이든 하는 방법은 같기 때문이다.
 */
export async function listEquipmentGuide(aptId: string | null): Promise<EquipmentGuideSection[]> {
  let query = supabase
    .from('equipments')
    .select('id,name,name_ko,description,target_muscle,station_kind,qr_code_val')
    .order('name');
  if (aptId) query = query.eq('apt_id', aptId);

  const { data, error } = await query;
  if (error) throw toEquipmentError(error);

  const seen = new Set<string>();
  const byMuscle = new Map<string, GuideEquipment[]>();

  for (const item of data ?? []) {
    const muscle = item.target_muscle ?? '기타';
    const key = `${muscle}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket = byMuscle.get(muscle);
    if (bucket) bucket.push(item);
    else byMuscle.set(muscle, [item]);
  }

  return [...byMuscle.entries()]
    .sort(([a], [b]) => {
      const ia = MUSCLE_ORDER.indexOf(a);
      const ib = MUSCLE_ORDER.indexOf(b);
      return (ia === -1 ? MUSCLE_ORDER.length : ia) - (ib === -1 ? MUSCLE_ORDER.length : ib);
    })
    .map(([muscle, items]) => ({ muscle, items: sortBodyweightFirst(items) }));
}
