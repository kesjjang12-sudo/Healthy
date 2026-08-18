import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 한 기구를 세트 단위로 진행시키는 상태.
 *
 * 목록만 보여주면 몇 세트까지 했는지 본인이 세야 한다. 기구 앞에서 그걸 기억하는
 * 사람은 없다. 그래서 한 번에 한 세트만 띄우고, 세트 사이 쉬는 시간을 앱이 잰다.
 *
 * ready → working(1세트) → resting → working(2세트) → … → logging
 */
export type SessionPhase = 'ready' | 'working' | 'resting' | 'logging';

/**
 * 세트 사이 쉬는 시간(초).
 *
 * 시니어 기준으로 잡았다. 젊은 사람 기준 30~45초는 숨이 덜 돌아온 채로 다음 세트에
 * 들어가게 되고, 그 상태로 무게를 들다 자세가 무너진다.
 */
const REST_SECONDS = 60;

/** 시간을 "1:05" 로. 1분 미만이면 "45초". 쉬는 시간(줄어듦)과 경과 시간(늘어남) 양쪽에 쓴다. */
export function formatClock(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * 유산소를 실제로 몇 분 했는지 앱이 직접 잰다.
 *
 * 시니어에게 "몇 분 하셨어요?"만 묻고 끝내면 대개 처방 시간을 그대로 답한다
 * (기억이 아니라 화면에 적힌 숫자를 읽는 것에 가깝다). 시작~완료 사이를 앱이
 * 재서 채워 두면 대부분 그대로 두면 되고, 틀렸을 때만 고치면 된다.
 *
 * `active` 가 false 로 바뀌면 그 시점 값에서 멈추고 그대로 유지한다.
 */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      // 멈추는 순간 값을 한 번 더 맞춘다. 안 그러면 마지막 틱 이후 흐른 시간
      // (최대 1초)이 빠진 채로 굳는다.
      if (startedAt.current !== null) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }
      return;
    }

    // 시작 시각 기준으로 계산한다. 화면이 잠깐 멈춰도(앱을 내렸다 올려도)
    // 실제로 흐른 시간이 그대로 나온다 — 틱 수를 세면 멈춘 동안이 빠진다.
    startedAt.current ??= Date.now();

    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current!) / 1000));
    }, 1000);

    return () => clearInterval(tick);
  }, [active]);

  return elapsed;
}

/** 잰 시간을 기록용 분으로. 30초라도 눌렀으면 0분이 아니라 1분으로 친다. */
export function elapsedToMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export function useWorkoutSession(totalSets: number) {
  const [phase, setPhase] = useState<SessionPhase>('ready');
  const [completedSets, setCompletedSets] = useState(0);
  const [restRemaining, setRestRemaining] = useState(REST_SECONDS);

  // 끝나는 시각을 기준으로 남은 시간을 계산한다. 화면이 잠깐 멈춰도 시간은 맞는다.
  const restEndsAt = useRef(0);

  const start = useCallback(() => {
    setCompletedSets(0);
    setPhase('working');
  }, []);

  /** 한 세트를 마쳤다. 남은 세트가 있으면 쉬는 시간으로, 없으면 기록 입력으로. */
  const finishSet = useCallback(() => {
    setCompletedSets((current) => {
      const next = current + 1;

      if (next >= totalSets) {
        setPhase('logging');
        return next;
      }

      restEndsAt.current = Date.now() + REST_SECONDS * 1000;
      setRestRemaining(REST_SECONDS);
      setPhase('resting');
      return next;
    });
  }, [totalSets]);

  /** 쉬는 시간을 기다리지 않고 다음 세트로 넘어간다. */
  const skipRest = useCallback(() => {
    setPhase('working');
  }, []);

  useEffect(() => {
    if (phase !== 'resting') return;

    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((restEndsAt.current - Date.now()) / 1000));
      setRestRemaining(left);
      // 다 쉬면 알아서 다음 세트로 넘어간다. 한 번 더 누르게 하지 않는다.
      if (left === 0) setPhase('working');
    }, 250);

    return () => clearInterval(tick);
  }, [phase]);

  return {
    phase,
    completedSets,
    /** 지금 하고 있는 세트 번호 (1부터) */
    currentSet: Math.min(completedSets + 1, totalSets),
    restRemaining,
    start,
    finishSet,
    skipRest,
  };
}
