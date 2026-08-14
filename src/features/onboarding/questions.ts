import type { AgeGroup, Gender, Goal, PainArea, ProfileData } from '@/lib/database.types';

type Option<V> = {
  readonly value: V;
  readonly label: string;
  /** 시니어가 선택지를 헷갈리지 않게 붙이는 한 줄 설명 */
  readonly caption?: string;
};

/**
 * 자유 입력 문항. 지금은 이름 하나뿐이다.
 *
 * 나머지 문항은 전부 버튼인데 이것만 자판을 쓴다 — 이름은 고를 수가 없어서다.
 * 대신 카카오·구글로 로그인하신 분은 제공자가 준 이름이 이미 채워져 있어
 * 그대로 두고 넘어가면 된다(`bootstrap_oauth_profile`).
 */
type TextQuestion<K extends 'nickname'> = {
  readonly key: K;
  readonly mode: 'text';
  readonly title: string;
  readonly summaryLabel: string;
  readonly helper: string;
  readonly placeholder: string;
  readonly maxLength: number;
};

type SingleQuestion<K extends 'gender' | 'age_group', V> = {
  readonly key: K;
  readonly mode: 'single';
  readonly title: string;
  /** 최종 확인 화면에 쓰는 짧은 이름 */
  readonly summaryLabel: string;
  readonly options: readonly Option<V>[];
};

type MultiQuestion<K extends 'goals' | 'pain_areas', V> = {
  readonly key: K;
  readonly mode: 'multi';
  readonly title: string;
  /** 최종 확인 화면에 쓰는 짧은 이름 */
  readonly summaryLabel: string;
  readonly helper: string;
  /**
   * 다른 선택지와 같이 고를 수 없는 "없음" 항목. 고르면 빈 배열로 저장한다.
   * (undefined = 아직 안 물어봄, [] = 없다고 답함)
   */
  readonly noneLabel?: string;
  readonly options: readonly Option<V>[];
};

/**
 * 키·몸무게처럼 선택지가 아니라 숫자를 받는 문항. 값은 question.key 가 아니라
 * profile_data 의 height_cm / weight_kg 두 칸에 직접 들어간다.
 */
type BodyQuestion = {
  readonly key: 'body';
  readonly mode: 'body';
  readonly title: string;
  readonly summaryLabel: string;
  readonly helper: string;
};

export type ProfileQuestion =
  | TextQuestion<'nickname'>
  | SingleQuestion<'gender', Gender>
  | SingleQuestion<'age_group', AgeGroup>
  | BodyQuestion
  | MultiQuestion<'goals', Goal>
  | MultiQuestion<'pain_areas', PainArea>;

/** 이름이 이보다 길면 인사말이 두 줄로 밀린다. */
export const NICKNAME_MAX_LENGTH = 12;

/**
 * 신규 회원 설문.
 *
 * 예전에 키·몸무게를 안 물은 이유는 이 설문이 입구 태블릿(이웃이 뒤에서
 * 화면을 보는 공용 기기)에서 돌았기 때문이다. 지금은 개인 폰에서 돌므로
 * 그 근거가 사라졌고, 몸무게는 칼로리 계산과 변화 관리에 바로 쓰여서 받는다.
 * 아픈 부위는 무게를 낮출지 판단하는 안전 입력이라 반드시 받아야 한다.
 *
 * 선택지가 적은 것부터 물어 첫 화면에서 막히지 않게 한다.
 */
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  {
    key: 'nickname',
    mode: 'text',
    title: '어떻게 불러 드릴까요?',
    summaryLabel: '이름',
    helper: '앱에서 부를 이름입니다. 실명이 아니어도 되고, 성만 적으셔도 됩니다.',
    placeholder: '예) 김철수',
    maxLength: NICKNAME_MAX_LENGTH,
  },
  {
    key: 'gender',
    mode: 'single',
    title: '성별을 골라주세요',
    summaryLabel: '성별',
    options: [
      { value: 'male', label: '남성' },
      { value: 'female', label: '여성' },
    ],
  },
  {
    key: 'age_group',
    mode: 'single',
    title: '연령대를 골라주세요',
    summaryLabel: '연령대',
    options: [
      { value: 10, label: '10대' },
      { value: 20, label: '20대' },
      { value: 30, label: '30대' },
      { value: 40, label: '40대' },
      { value: 50, label: '50대' },
      { value: 60, label: '60대' },
      { value: 70, label: '70대 이상' },
    ],
  },
  {
    key: 'body',
    mode: 'body',
    title: '키와 몸무게를 알려주세요',
    summaryLabel: '키 · 몸무게',
    helper: '운동 무게와 소모 칼로리 계산에 쓰입니다. 다른 회원에게는 보이지 않아요.',
  },
  {
    key: 'goals',
    mode: 'multi',
    title: '어떤 목적으로 운동하시나요?',
    summaryLabel: '운동 목적',
    helper: '여러 개 고르셔도 됩니다.',
    options: [
      { value: 'diet', label: '체중 줄이기', caption: '뱃살, 체중 관리' },
      { value: 'muscle', label: '근력 키우기', caption: '힘, 근육량 늘리기' },
      { value: 'health', label: '건강 유지', caption: '꾸준히 몸 관리' },
      { value: 'rehab', label: '통증 관리', caption: '아픈 곳 회복' },
    ],
  },
  {
    key: 'pain_areas',
    mode: 'multi',
    title: '아프거나 불편한 곳이 있나요?',
    summaryLabel: '아픈 곳',
    helper: '고르신 곳은 무게를 낮춰서 루틴을 만들어 드립니다. 여러 개 고르셔도 됩니다.',
    noneLabel: '없습니다',
    options: [
      { value: 'knee', label: '무릎' },
      { value: 'lower_back', label: '허리' },
      { value: 'shoulder', label: '어깨' },
      { value: 'neck', label: '목' },
      { value: 'wrist', label: '손목' },
      { value: 'ankle', label: '발목' },
    ],
  },
] as const;

/**
 * 이 사람에게 실제로 물어볼 문항.
 *
 * 아픈 곳은 건강에 관한 정보라 별도 동의를 받는데, 그 동의를 안 하신 분께는
 * **묻지도 않아야 한다.** 물어보고 저장만 안 하는 건 동의 없이 수집한 것과
 * 다르지 않다 — 화면에 띄우는 순간 답을 하시게 된다.
 */
export function questionsFor(
  profile: Partial<ProfileData> | null | undefined,
): readonly ProfileQuestion[] {
  const allowsPainAreas = profile?.consent?.pain_areas === true;
  return PROFILE_QUESTIONS.filter((question) => question.key !== 'pain_areas' || allowsPainAreas);
}

/** 최종 확인 화면의 인덱스. 문항 수가 사람마다 달라서 목록을 받아 센다. */
export function confirmStepIndex(questions: readonly ProfileQuestion[]): number {
  return questions.length;
}

/** 이 문항에 답을 했는지. 목적은 최소 1개, 아픈 곳은 "없습니다"(빈 배열)도 답으로 친다. */
export function isAnswered(question: ProfileQuestion, values: Partial<ProfileData>): boolean {
  if (question.mode === 'body') {
    return values.height_cm !== undefined && values.weight_kg !== undefined;
  }

  const value = values[question.key];

  // 공백만 친 이름은 답한 걸로 치지 않는다 — "  님, 안녕하세요"가 뜬다.
  if (question.mode === 'text') return typeof value === 'string' && value.trim() !== '';
  if (question.mode === 'single') return value !== undefined;
  if (!Array.isArray(value)) return false;

  return question.noneLabel ? true : value.length > 0;
}

/**
 * 아직 답하지 않은 첫 문항. 전부 답했으면 최종 확인 화면으로 보낸다.
 * 지난번에 중간에 나갔더라도 남은 문항부터 이어서 물을 수 있다.
 */
export function findFirstUnansweredIndex(values: Partial<ProfileData> | null | undefined): number {
  const questions = questionsFor(values);
  const index = questions.findIndex((question) => !isAnswered(question, values ?? {}));
  return index === -1 ? confirmStepIndex(questions) : index;
}

/** 최종 확인 화면에 보여줄 답변 문구 */
export function formatAnswer(question: ProfileQuestion, values: Partial<ProfileData>): string {
  if (question.mode === 'body') {
    if (values.height_cm === undefined || values.weight_kg === undefined) {
      return '아직 안 적으셨어요';
    }
    return `${values.height_cm}cm · ${values.weight_kg}kg`;
  }

  const value = values[question.key];

  if (question.mode === 'text') {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : '아직 안 적으셨어요';
  }

  if (question.mode === 'single') {
    return question.options.find((option) => option.value === value)?.label ?? '아직 안 고르셨어요';
  }

  if (!Array.isArray(value)) return '아직 안 고르셨어요';
  if (value.length === 0) return question.noneLabel ?? '없음';

  return question.options
    .filter((option) => (value as readonly string[]).includes(option.value))
    .map((option) => option.label)
    .join(', ');
}
