import type { GenerateRoutineResult } from '@/lib/database.types';

export type EquipmentResolution = { kind: 'prescribed'; routineId: string } | { kind: 'explore' };

/**
 * 스캔한 기구 QR 이 오늘 처방 루틴에 있는 기구와 같은지 본다.
 *
 * 같으면 그 처방 화면(세트 진행·쉬는 시간·기록까지 도는 화면, workout/[id])
 * 으로 보낸다 — 이미 만들어진 처방 흐름을 그대로 타는 게 맞다.
 * 다르면(오늘 루틴엔 없지만 궁금해서 찍은 기구) 탐색 전용 화면
 * (workout/explore/[qr])으로 보낸다 — 세트 수·목표 무게가 없으니 기록/포인트
 * 없이 설명과 영상만 보여준다.
 */
export function resolveEquipmentQr(
  qrCode: string,
  dailyRoutine: GenerateRoutineResult | null,
): EquipmentResolution {
  const match = dailyRoutine?.routines.find((item) => item.qr_code_val === qrCode);
  return match ? { kind: 'prescribed', routineId: match.routine_id } : { kind: 'explore' };
}
