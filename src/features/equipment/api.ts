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

/**
 * 가이드 목록 한 줄에 필요한 만큼만.
 *
 * 운동 정보(이름·설명·부위)는 exercise_catalog 에 있고 equipments 는 "그
 * 헬스장에 그 운동을 할 기구가 있다"는 사실과 QR 만 갖는다. 그래서 이 줄은
 * 두 테이블에서 온다 — id 는 카탈로그 것이고, qr_code_val 은 기구 것이다.
 */
export type GuideEquipment = {
  id: string;
  name: string;
  name_ko: string | null;
  description: string | null;
  target_muscle: string | null;
  station_kind: string | null;
  /** 시작 자세 사진. 어느 기구인지 글보다 사진이 빠르다. */
  image_url: string | null;
  /** 이 헬스장에 기구가 없는 맨몸 운동은 QR 이 없다. */
  qr_code_val: string | null;
};

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
 * 운동 백과사전. 부위별 섹션으로 묶어서 돌려준다. 오늘 루틴과 무관한 고정
 * 참고 자료라서 처방 RPC 를 거치지 않고 목록만 읽는다.
 *
 * 카탈로그를 기준으로 삼고 기구는 붙이기만 한다. 기구 기준으로 읽으면 이
 * 헬스장에 기구가 없는 맨몸 운동(집에서도 되는 것들)이 통째로 빠진다 —
 * 백과사전에서 그게 빠지면 "기구 없이 할 수 있는 운동"을 찾을 데가 없다.
 */
export async function listEquipmentGuide(aptId: string | null): Promise<EquipmentGuideSection[]> {
  const { data, error } = await supabase
    .from('exercise_catalog')
    .select('id,name,name_ko,description,target_muscle,station_kind,image_url,equipments(qr_code_val,apt_id)')
    .order('name');

  if (error) throw toEquipmentError(error);

  const byMuscle = new Map<string, GuideEquipment[]>();

  for (const row of data ?? []) {
    const muscle = row.target_muscle ?? '기타';
    // 이 헬스장의 기구를 먼저 찾고, 없으면 아무 기구의 QR 이나 쓴다(다른
    // 단지 것이라도 화면은 카탈로그로 찾으므로 설명은 똑같이 나온다).
    const equipments = row.equipments ?? [];
    const mine = aptId ? equipments.find((e) => e.apt_id === aptId) : null;
    const item: GuideEquipment = {
      id: row.id,
      name: row.name,
      name_ko: row.name_ko,
      description: row.description,
      target_muscle: row.target_muscle,
      station_kind: row.station_kind,
      image_url: row.image_url,
      qr_code_val: (mine ?? equipments[0])?.qr_code_val ?? null,
    };

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

/**
 * 카탈로그 id 로 운동 하나를 찾는다.
 *
 * QR 이 없는 운동 — 이 헬스장에 기구가 없는 맨몸 운동 — 도 백과사전에서
 * 열 수 있어야 해서 QR 조회와 짝을 이룬다. 돌려주는 모양은 같다.
 */
export async function getExerciseByCatalogId(catalogId: string): Promise<EquipmentLookup> {
  const { data, error } = await supabase.rpc('get_exercise_by_catalog_id', {
    p_catalog_id: catalogId,
  });

  if (error) throw toEquipmentError(error);
  if (!data) throw new EquipmentError(MESSAGES.EQUIPMENT_NOT_FOUND);

  return data;
}
