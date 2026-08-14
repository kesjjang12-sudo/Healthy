/**
 * 시니어 맞춤 운동 가이드 생성.
 *
 * DB 가 1차로 걸러낸 "안전한 기구 목록"과 유저 프로필을 받아, 기구마다
 * 자각도(RPE) 기반 안내 문장 하나씩을 만들어 돌려준다.
 *
 * ── 설계의 핵심: LLM 에게 숫자를 맡기지 않는다 ──────────────────
 *
 * 세트·횟수·기구 이름·이미지는 전부 DB 값을 그대로 쓰고, LLM 은 rpe_guide
 * 문장 **하나만** 쓴다. 이유는 비용이 아니라 안전이다. LLM 이 세트 수를
 * 지어내면 "3세트"가 "5세트"가 되고, 그건 무릎이 아픈 60대에게 실제 부상이
 * 된다. 문장은 틀려도 어색할 뿐이지만 숫자는 틀리면 사람이 다친다.
 *
 * 그래서 이 함수는 이런 순서로 움직인다.
 *
 *   1. DB 에서 뼈대를 만든다 (기구·세트·횟수·이미지 — 전부 확정값)
 *   2. LLM 에게 문장만 요청한다 (machine_id 는 스키마 enum 으로 고정)
 *   3. 돌아온 문장을 검사한다 (kg 표기·길이·존댓말·금칙어)
 *   4. 검사에 걸리면 그 문장만 규칙 기반 문구로 바꾼다
 *
 * 4번 덕분에 LLM 이 죽어도, 느려도, 엉뚱한 말을 해도 사용자는 항상 쓸 수
 * 있는 루틴을 받는다. LLM 은 "있으면 더 좋은" 부품이지 단일 장애점이 아니다.
 *
 * 필요한 시크릿 (supabase secrets set 으로 넣는다. 코드에 절대 적지 말 것):
 *   ANTHROPIC_API_KEY          Claude API 키
 *   SUPABASE_URL               런타임이 자동으로 넣어 준다
 *   SUPABASE_SERVICE_ROLE_KEY  런타임이 자동으로 넣어 준다
 */
import Anthropic from 'npm:@anthropic-ai/sdk@^0.110.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

/** LLM 이 늦으면 기다리지 않고 규칙 기반 문구로 넘어간다. 헬스장에서 12초는 길다. */
const LLM_TIMEOUT_MS = 12_000;

/** 안내 문장 길이. 너무 짧으면 정보가 없고, 길면 기구 앞에서 안 읽는다. */
const GUIDE_MIN_CHARS = 10;
const GUIDE_MAX_CHARS = 120;

/**
 * 문장에 절대 나오면 안 되는 말.
 *
 * - 무게 단위: 기구마다 같은 "20kg" 이 다른 무게다. 칸(핀) 으로만 말한다.
 * - 의학적 단정: 이 앱은 의료기기가 아니다. "치료된다" 는 말은 못 한다.
 * - 통증 감내: 4060 에게 "아파도 참으세요" 는 그대로 부상이 된다.
 */
const BANNED_PATTERNS: RegExp[] = [
  /\d\s*(kg|킬로|파운드|lb|lbs)/i,
  /(치료|완치|낫습니다|낫게|의사|처방전|약을)/,
  /(참고 하세요|참으세요|버티세요|무리해서|아파도)/,
];

export type SafeMachine = {
  /** exercise_catalog.id — 응답을 되짚을 때 쓰는 키다. */
  machine_id: string;
  machine_name: string;
  sets: number;
  reps: number | null;
  /** 유산소는 횟수 대신 시간으로 처방한다. 둘 중 하나만 채워진다. */
  duration_minutes: number | null;
  image_url: string | null;
  target_muscle: string | null;
  station_kind: string | null;
};

type RequestBody = {
  user_id: string;
  safe_machine_list: SafeMachine[];
};

type GuidedMachine = {
  machine_name: string;
  sets: number;
  reps: number | null;
  duration_minutes: number | null;
  rpe_guide: string;
  image_url: string | null;
};

type ProfileData = {
  gender?: string;
  age_group?: number;
  goals?: string[];
  pain_areas?: string[];
  nickname?: string;
};

// ── 응답 도우미 ─────────────────────────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function fail(status: number, code: string, message: string): Response {
  // code 는 앱이 분기할 값, message 는 사람이 읽을 값이다. 둘을 섞지 않는다.
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: JSON_HEADERS,
  });
}

// ── 입력 검증 ───────────────────────────────────────────────────

/**
 * 몸통을 검사한다.
 *
 * safe_machine_list 가 비어 있으면 만들 가이드가 없다 — 이건 오류가 아니라
 * "오늘 처방할 기구가 없다"는 정상 상태일 수 있으므로 호출한 쪽이 구분할 수
 * 있게 별도 코드로 돌려준다.
 */
function parseBody(raw: unknown): { body: RequestBody } | { error: Response } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: fail(400, 'INVALID_BODY', '요청 형식이 올바르지 않습니다.') };
  }

  const { user_id, safe_machine_list } = raw as Partial<RequestBody>;

  if (typeof user_id !== 'string' || user_id.length === 0) {
    return { error: fail(400, 'USER_ID_REQUIRED', 'user_id 가 필요합니다.') };
  }

  if (!Array.isArray(safe_machine_list)) {
    return { error: fail(400, 'MACHINE_LIST_REQUIRED', 'safe_machine_list 가 필요합니다.') };
  }

  // 기구 하나라도 모양이 어긋나면 통째로 거절한다. 일부만 처리하면 사용자는
  // "왜 세 개만 나왔지" 하고 앱을 의심하게 된다 — 조용한 누락이 제일 나쁘다.
  for (const m of safe_machine_list) {
    if (
      typeof m?.machine_id !== 'string' ||
      typeof m?.machine_name !== 'string' ||
      typeof m?.sets !== 'number'
    ) {
      return { error: fail(400, 'MACHINE_SHAPE_INVALID', '기구 목록 형식이 올바르지 않습니다.') };
    }
  }

  return { body: { user_id, safe_machine_list } };
}

// ── 규칙 기반 대체 문구 ─────────────────────────────────────────

/**
 * LLM 없이도 성립하는 안내 문장.
 *
 * LLM 이 실패했을 때만 쓰는 게 아니라, 이 함수가 있다는 사실 자체가 설계의
 * 근거다. 규칙만으로도 쓸 만한 문장이 나오기 때문에 LLM 을 "더 자연스럽게
 * 만들어 주는 부품"으로 낮춰 둘 수 있다.
 */
export function fallbackGuide(m: SafeMachine): string {
  if (m.duration_minutes !== null) {
    return `${m.duration_minutes}분 동안, 숨은 조금 차지만 옆 사람과 말은 되는 속도로 하세요.`;
  }

  if (m.station_kind === '맨몸') {
    return `${m.reps ?? 10}개째에 "이제 좀 힘드네" 싶으면 알맞습니다. 자세가 흔들리면 거기서 멈추세요.`;
  }

  return `${m.reps ?? 12}개째 밀어낼 때 "조금 무겁네" 싶은 칸에 핀을 꽂으세요. 자세가 무너지면 한 칸 내리시고요.`;
}

// ── 문장 검사 ───────────────────────────────────────────────────

/**
 * LLM 이 쓴 문장을 그대로 사용자에게 보여도 되는지 판단한다.
 *
 * 스키마(구조)는 API 가 보장해 주지만 **내용**은 보장해 주지 않는다.
 * "20kg 을 꽂으세요" 는 완벽하게 스키마를 지킨 위험한 문장이다.
 */
export function isSafeGuide(text: unknown): text is string {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (trimmed.length < GUIDE_MIN_CHARS || trimmed.length > GUIDE_MAX_CHARS) return false;

  // 존댓말로 끝나야 한다. 4060 대상 화면에서 반말은 그 자체로 사고다.
  if (!/(요|다|시오)[.!]?$/.test(trimmed)) return false;

  return !BANNED_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ── 프롬프트 ────────────────────────────────────────────────────

/**
 * 역할과 금지사항을 못 박는다.
 *
 * 프롬프트를 길게 쓰는 대신 **지킬 수 없는 것을 구조로 막았다** — 숫자는
 * 애초에 요청하지 않고, machine_id 는 스키마 enum 으로 잠갔다. 그래서 여기
 * 남은 건 문체와 안전 규칙뿐이다. 프롬프트가 짧을수록 싼 모델도 잘 지킨다.
 */
const SYSTEM_PROMPT = `당신은 아파트 단지 헬스장에서 40~60대 회원을 안내하는 운동 지도사입니다.
기구마다 "얼마나 무겁게 할지"를 한 문장으로 안내하는 일만 합니다.

지켜야 할 것:
- kg, 파운드 같은 무게 단위를 절대 쓰지 마세요. 기구마다 같은 숫자가 다른 무게라 위험합니다.
  대신 핀을 꽂는 "칸"과, 마지막 횟수에서 느껴지는 힘든 정도로 말하세요.
- 마지막 횟수를 기준으로 잡으세요. 예: "15개째에 '조금 무겁네' 싶은 칸".
- 한 문장, 존댓말, 60자 안팎. 기구 앞에 서서 읽을 문장입니다.
- 자세가 무너지면 어떻게 하라는 안내를 짧게 덧붙이세요.
- 아파도 참으라는 말, 병이 낫는다는 말은 절대 하지 마세요. 이 앱은 의료기기가 아닙니다.
- 세트 수나 횟수를 새로 지어내지 마세요. 그 숫자는 이미 정해져 있습니다.`;

function buildUserPrompt(profile: ProfileData, machines: SafeMachine[]): string {
  const painAreas = profile.pain_areas?.length ? profile.pain_areas.join(', ') : '없음';

  // 통증 부위를 넘기지만 "이 기구를 빼라"고는 시키지 않는다. 뺄 기구는 DB 가
  // 이미 뺐다. 여기서는 문장 톤만 조절하는 재료로 쓴다.
  return [
    `회원 정보: ${profile.age_group ?? 60}대, ${profile.gender === 'male' ? '남성' : '여성'}, ` +
      `운동 목적 ${profile.goals?.join('/') ?? '건강 유지'}, 불편한 곳 ${painAreas}`,
    '',
    '아래 기구마다 안내 문장을 하나씩 써 주세요. 세트와 횟수는 이미 정해진 값이니 그대로 두고,',
    '그 횟수를 기준으로 얼마나 무겁게 할지만 말하면 됩니다.',
    '',
    ...machines.map((m) => {
      const volume =
        m.duration_minutes !== null
          ? `${m.duration_minutes}분`
          : `${m.sets}세트 ${m.reps ?? 12}회`;
      return `- machine_id: ${m.machine_id} / ${m.machine_name} (${m.target_muscle ?? '전신'}, ${m.station_kind ?? '머신'}) / ${volume}`;
    }),
  ].join('\n');
}

/**
 * 응답 스키마.
 *
 * machine_id 를 enum 으로 잠그는 게 이 스키마의 핵심이다. 검증으로 걸러내는
 * 게 아니라 **애초에 다른 값을 만들 수 없게** 한다 — 없는 기구를 지어내는
 * 종류의 환각은 이 한 줄로 사라진다.
 */
function buildSchema(machines: SafeMachine[]) {
  return {
    type: 'object',
    properties: {
      guides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            machine_id: { type: 'string', enum: machines.map((m) => m.machine_id) },
            rpe_guide: { type: 'string' },
          },
          required: ['machine_id', 'rpe_guide'],
          additionalProperties: false,
        },
      },
    },
    required: ['guides'],
    additionalProperties: false,
  };
}

// ── LLM 호출 ────────────────────────────────────────────────────

/**
 * 기구 id → 안내 문장. 실패하면 빈 Map 을 돌려준다(예외를 던지지 않는다).
 *
 * 예외를 안 던지는 게 의도다. 호출하는 쪽은 "문장이 없으면 규칙 기반으로
 * 채운다"는 한 갈래만 처리하면 되고, LLM 이 죽었는지 느렸는지 이상한 말을
 * 했는지는 알 필요가 없다.
 */
async function generateGuides(
  client: Anthropic,
  profile: ProfileData,
  machines: SafeMachine[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  try {
    const response = await client.messages.create(
      {
        model: 'claude-opus-5',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        // 문장 몇 줄 쓰는 데 깊은 추론이 필요하지 않다. effort 를 낮추면
        // 토큰과 지연이 같이 줄어든다 — 이게 비용을 줄이는 올바른 손잡이다.
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: buildSchema(machines) },
        },
        messages: [{ role: 'user', content: buildUserPrompt(profile, machines) }],
      },
      { timeout: LLM_TIMEOUT_MS },
    );

    // 안전 분류기가 요청을 거절하면 content 가 비어 있다. content[0] 을
    // 그냥 읽으면 여기서 터진다.
    if (response.stop_reason === 'refusal') return result;

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return result;

    const parsed = JSON.parse(block.text) as { guides?: { machine_id: string; rpe_guide: string }[] };
    const allowed = new Set(machines.map((m) => m.machine_id));

    for (const guide of parsed.guides ?? []) {
      // 스키마가 이미 막아 주지만 한 번 더 본다 — 스키마는 API 쪽 기능이라
      // 버전이 바뀌거나 모델을 갈아 끼우면 보장이 달라질 수 있다.
      if (!allowed.has(guide.machine_id)) continue;
      if (!isSafeGuide(guide.rpe_guide)) continue;
      result.set(guide.machine_id, guide.rpe_guide.trim());
    }
  } catch {
    // 타임아웃·네트워크·JSON 파싱 실패 전부 여기로 온다. 전부 같은 뜻이다:
    // "이번엔 LLM 문장을 못 받았다". 루틴은 그대로 나가야 한다.
  }

  return result;
}

// ── 본체 ────────────────────────────────────────────────────────

export async function handleRoutineGuide(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return fail(405, 'METHOD_NOT_ALLOWED', 'POST 만 받습니다.');
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    // 어느 값이 비었는지는 로그에만 남긴다. 응답에 적으면 배포 구성이 밖으로 샌다.
    console.error('missing secrets', {
      anthropic: Boolean(apiKey),
      url: Boolean(supabaseUrl),
      serviceRole: Boolean(serviceRoleKey),
    });
    return fail(500, 'SERVER_MISCONFIGURED', '서버 설정이 완료되지 않았습니다.');
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON', '요청 본문을 읽지 못했습니다.');
  }

  const parsed = parseBody(raw);
  if ('error' in parsed) return parsed.error;
  const { user_id, safe_machine_list } = parsed.body;

  if (safe_machine_list.length === 0) {
    return fail(422, 'NO_SAFE_MACHINE', '오늘 안전하게 하실 수 있는 기구가 없습니다.');
  }

  // 호출자가 정말 그 회원인지 확인한다.
  //
  // user_id 를 몸통으로 받는 이상 이 검사가 없으면 남의 id 를 넣어 프로필을
  // 열람할 수 있다. service_role 키로 DB 를 읽기 때문에 RLS 도 우회된다 —
  // 그래서 이 함수가 직접 막아야 한다.
  const accessToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return fail(401, 'AUTH_REQUIRED', '로그인 후 다시 시도해 주세요.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData?.user) {
    return fail(401, 'AUTH_INVALID', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, profile_data, auth_user_id')
    .eq('id', user_id)
    .maybeSingle();

  if (userError) {
    console.error('user lookup failed', userError);
    return fail(502, 'PROFILE_LOOKUP_FAILED', '회원 정보를 불러오지 못했습니다.');
  }
  if (!user) {
    return fail(404, 'USER_NOT_FOUND', '회원 정보를 찾지 못했습니다.');
  }
  if (user.auth_user_id !== authData.user.id) {
    // 남의 프로필을 요청했다. 404 가 아니라 403 으로 돌려준다 — 이미 위에서
    // 존재는 확인됐고, 여기서 404 를 주면 오히려 "있다/없다"가 새어 나간다.
    return fail(403, 'FORBIDDEN', '다른 회원의 정보는 볼 수 없습니다.');
  }

  const profile = (user.profile_data ?? {}) as ProfileData;

  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const guides = await generateGuides(client, profile, safe_machine_list);

  // 뼈대는 전부 DB 값이다. LLM 이 준 건 rpe_guide 한 칸뿐이고, 그마저
  // 없거나 검사에 걸리면 규칙 기반 문구로 메운다.
  const machines: GuidedMachine[] = safe_machine_list.map((m) => ({
    machine_name: m.machine_name,
    sets: m.sets,
    reps: m.reps,
    duration_minutes: m.duration_minutes,
    rpe_guide: guides.get(m.machine_id) ?? fallbackGuide(m),
    image_url: m.image_url,
  }));

  return new Response(
    JSON.stringify({
      routine_id: crypto.randomUUID(),
      machines,
      // 몇 개가 규칙 기반으로 대체됐는지 알려준다. 이 값이 계속 machines.length
      // 와 같다면 LLM 이 사실상 안 붙어 있는 것이다 — 조용히 망가진 상태를
      // 대시보드에서 알아챌 수 있는 유일한 신호다.
      generated_by_llm: guides.size,
    }),
    { status: 200, headers: JSON_HEADERS },
  );
}
