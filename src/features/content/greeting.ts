/**
 * 로그인 뒤 첫 화면에서 이름을 부르는 인사말.
 *
 * "회원 님 오늘도 나오셨네요" 한 줄만 계속 뜨면 며칠 만에 배경이 된다. 사람은
 * 자기 이름이 불릴 때 화면을 한 번 더 본다 — 그래서 이름을 앞에 두고, 시간대와
 * 방문 이력에 따라 뒷줄을 바꾼다.
 *
 * 시간대는 기기 시각을 그대로 쓴다. 서버 시각(Asia/Seoul)과 다를 수 있지만,
 * 인사말은 "지금 이 사람이 느끼는 시간"에 맞는 편이 맞다.
 */

export type Greeting = {
  /** 이름을 부르는 줄. 이름이 없으면 이름 없이 인사만 한다. */
  headline: string;
  /** 그 아래 한 줄. 방문 이력에 따라 달라진다. */
  sub: string;
};

type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night';

function timeOfDay(hour: number): TimeOfDay {
  if (hour < 5) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/**
 * 시간대별 인사. 낮에는 평범하게, 이른 아침과 늦은 밤에는 알아봐 주는 쪽으로.
 * 'dawn' 은 지금 쓰지 않지만 새벽 운동을 따로 대접하고 싶을 때 자리를 남겨 뒀다.
 */
const SALUTATIONS: Record<TimeOfDay, string> = {
  dawn: '이른 새벽부터 대단하세요',
  morning: '좋은 아침이에요',
  afternoon: '안녕하세요',
  evening: '안녕하세요',
  night: '늦은 시간에도 대단하세요',
};

/** 두 번째 줄. 특별한 날(첫날·복귀)이 아니면 여기서 무작위로 고른다. */
const REGULAR_SUBS: readonly string[] = [
  '오늘도 나오셨네요',
  '오늘도 딱 하실 만큼만 하시면 됩니다',
  '천천히 하셔도 다 됩니다',
  '오늘은 어디부터 해 볼까요',
  '꾸준한 게 제일 어려운데, 잘하고 계세요',
  '무리하지 않는 게 제일 빠른 길입니다',
] as const;

export type GreetingInput = {
  /** profile_data.nickname. 아직 안 받았으면 null */
  name?: string | null;
  /** 평생 출석일 수(get_visit_stats). 모르면 null */
  visitDays?: number | null;
  /** 테스트용 고정 시각 */
  now?: Date;
  /** 테스트용 고정 seed */
  seed?: number;
};

export function pickGreeting({ name, visitDays, now, seed }: GreetingInput = {}): Greeting {
  const trimmed = name?.trim();
  const salutation = SALUTATIONS[timeOfDay((now ?? new Date()).getHours())];

  // 이름을 아직 안 받은 사람에게 "회원 님"이라고 부르지 않는다. 그렇게 부르면
  // 이름을 넣을 수 있다는 사실 자체를 모른 채로 계속 쓰게 된다 — 화면 쪽에서
  // 이름 등록을 권하는 버튼을 따로 띄운다.
  const headline = trimmed ? `${trimmed} 님,\n${salutation}` : salutation;

  return { headline, sub: pickSub(visitDays, seed) };
}

/**
 * 출석일 수는 get_visit_stats 가 늦게 도착하므로 아직 모를 수 있다(null).
 * 그때 "첫날입니다"를 띄우면 100일 나오신 분께 첫날이라고 말하게 된다 —
 * 모르는 동안에는 어느 쪽에도 안 걸리는 평범한 문장을 쓴다.
 */
function pickSub(visitDays: number | null | undefined, seed?: number): string {
  if (visitDays === 1) return '오늘이 첫 방문이시네요. 천천히 둘러보셔도 좋아요';
  if (visitDays === 2) return '두 번째 방문이시네요. 시작이 제일 어렵습니다';

  const index =
    seed === undefined
      ? Math.floor(Math.random() * REGULAR_SUBS.length)
      : Math.abs(Math.trunc(seed)) % REGULAR_SUBS.length;

  return REGULAR_SUBS[Math.min(index, REGULAR_SUBS.length - 1)];
}
