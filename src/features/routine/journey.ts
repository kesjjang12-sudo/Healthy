import { supabase } from '@/lib/supabase';

/**
 * 국토 종주 둘레길.
 *
 * 유산소 시간을 거리로 바꿔 대한민국 지도 위 가상의 종주 코스를 걷게 한다.
 * 오늘 20분이 아니라 "서울에서 강릉까지 가는 중"이라는 긴 이야기가 생기면,
 * 하루하루의 지루한 반복이 이어지는 여정의 한 걸음이 된다.
 *
 * 1분 = 0.15km. 빠르게 걷는 속도(시속 9km)로 잡았다 — 실제 속도가 아니라
 * 여정이 너무 늘어지지 않게 고른 환산 배율이다(214km ≈ 24시간 분량, 하루
 * 15분씩 약 석 달). ⚠️ 배율과 코스 구성은 트레이너·운영 검수 대상.
 */
export const KM_PER_MINUTE = 0.15;

export type Checkpoint = {
  /** 코스 시작점부터의 거리 */
  readonly km: number;
  readonly name: string;
};

export type Course = {
  readonly name: string;
  readonly totalKm: number;
  /** km 오름차순. 0(출발)과 totalKm(도착)을 반드시 포함한다. */
  readonly checkpoints: readonly Checkpoint[];
};

/**
 * 1코스: 서울 → 강릉.
 *
 * 지명은 실존하는 길·명소에서 땄지만 거리는 코스 연출용 가상값이다.
 * 코스를 다 걸으면 다음 코스로 넘어간다(지금은 1코스를 반복).
 */
export const COURSE: Course = {
  name: '국토 종주 둘레길 · 1코스 서울→강릉',
  totalKm: 214,
  checkpoints: [
    { km: 0, name: '서울 한강 출발!' },
    { km: 18, name: '남양주 한강나루길' },
    { km: 42, name: '양평 물소리길' },
    { km: 78, name: '홍천 강변 산책길' },
    { km: 112, name: '횡성 숲체원 둘레길' },
    { km: 138, name: '평창 효석문학길' },
    { km: 163, name: '강원도 오대산 숲길 진입!' },
    { km: 191, name: '대관령 옛길' },
    { km: 214, name: '강릉 경포 바닷길 도착!' },
  ],
};

export type JourneyPoint = {
  /** 이번 코스 안에서의 위치(km, 소수 1자리) */
  km: number;
  totalKm: number;
  /** 코스를 몇 바퀴째 도는 중인지 (1부터) */
  round: number;
  /** 마지막으로 지난 체크포인트 */
  current: Checkpoint;
  /** 다음 체크포인트. 도착점을 지났으면 null 이 아니라 다음 바퀴 첫 지점이 된다. */
  next: Checkpoint;
  /** 다음 체크포인트까지 남은 거리(km, 올림) */
  nextKm: number;
};

/** 누적 유산소 분(minutes)을 코스 위 위치로 바꾼다. */
export function journeyPoint(totalMinutes: number): JourneyPoint {
  const totalKmWalked = Math.max(0, totalMinutes) * KM_PER_MINUTE;
  const round = Math.floor(totalKmWalked / COURSE.totalKm) + 1;
  const km = totalKmWalked % COURSE.totalKm;

  let current = COURSE.checkpoints[0];
  let next = COURSE.checkpoints[COURSE.checkpoints.length - 1];
  for (let i = 0; i < COURSE.checkpoints.length; i++) {
    if (COURSE.checkpoints[i].km <= km) current = COURSE.checkpoints[i];
    else {
      next = COURSE.checkpoints[i];
      break;
    }
  }
  // 도착점까지 지난 상태(km 가 딱 totalKm 직전에서 나눠떨어진 직후)면
  // 다음 목적지는 새 바퀴의 첫 체크포인트다.
  if (current.km >= next.km) next = COURSE.checkpoints[1];

  return {
    km: Math.round(km * 10) / 10,
    totalKm: COURSE.totalKm,
    round,
    current,
    next,
    nextKm: Math.max(1, Math.ceil(next.km - km)),
  };
}

/**
 * 지금까지 완료한 유산소 총 시간(분). 실패하면 0 — 여정 표시는 재미 요소라
 * 서버가 안 닿아도 운동 자체(타이머·기록)는 그대로 굴러가야 한다.
 */
export async function fetchJourneyMinutes(): Promise<number> {
  const { data, error } = await supabase.rpc('get_journey_minutes');
  if (error || typeof data !== 'number') return 0;
  return data;
}
