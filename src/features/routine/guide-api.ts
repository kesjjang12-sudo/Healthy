import { supabase } from '@/lib/supabase';

/**
 * routine-guide Edge Function 호출.
 *
 * 이 함수가 실패해도 앱이 멈추면 안 된다 — 안내 문장은 "있으면 더 좋은"
 * 값이고, 세트·횟수·기구는 이미 DB 에서 받아 화면에 있다. 그래서 실패를
 * 예외로 올리지 않고 null 로 돌려준다.
 */
export type GuidedMachine = {
  machine_name: string;
  sets: number;
  reps: number | null;
  duration_minutes: number | null;
  rpe_guide: string;
  image_url: string | null;
};

export type RoutineGuideResult = {
  routine_id: string;
  machines: GuidedMachine[];
  /** 몇 개가 실제로 LLM 문장인지. 나머지는 규칙 기반 문구로 채워진 것이다. */
  generated_by_llm: number;
};

export type SafeMachineInput = {
  machine_id: string;
  machine_name: string;
  sets: number;
  reps: number | null;
  duration_minutes: number | null;
  image_url: string | null;
  target_muscle: string | null;
  station_kind: string | null;
};

export async function fetchRoutineGuide(
  userId: string,
  safeMachineList: SafeMachineInput[],
): Promise<RoutineGuideResult | null> {
  // invoke 는 로그인 세션의 access token 을 Authorization 헤더로 자동으로
  // 실어 보낸다. Edge Function 이 그 토큰으로 "정말 이 회원인지"를 확인하므로
  // 여기서 따로 헤더를 만들 필요가 없다.
  const { data, error } = await supabase.functions.invoke<RoutineGuideResult>('routine-guide', {
    body: { user_id: userId, safe_machine_list: safeMachineList },
  });

  if (error) {
    console.warn('routine-guide 호출 실패 — 기본 안내로 진행합니다.', error);
    return null;
  }

  return data ?? null;
}
