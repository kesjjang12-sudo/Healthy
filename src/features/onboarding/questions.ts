import type { AgeGroup, Gender, Goal, PainArea, ProfileData } from '@/lib/database.types';

type Option<V> = {
  readonly value: V;
  readonly label: string;
  /** 시니어가 선택지를 헷갈리지 않게 붙이는 한 줄 설명 */
  readonly caption?: string;
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

export type ProfileQuestion =
  | SingleQuestion<'gender', Gender>
  | SingleQuestion<'age_group', AgeGroup>
  | MultiQuestion<'goals', Goal>
  | MultiQuestion<'pain_areas', PainArea>;

/**
 * 태블릿에서 받는 설문.
 *
 * 입구 태블릿은 1대뿐이라 문항이 길면 그대로 줄이 된다. 그래서 AI 루틴 생성에
 * 반드시 필요한 것만 남겼다. 키·몸무게는 여기서 묻지 않는다 — 아파트 헬스장은
 * 이웃이 뒤에서 화면을 보는 곳이라 공용 화면에 띄우면 안 된다.
 * 반면 아픈 부위는 무게를 낮출지 판단하는 안전 입력이라 반드시 받아야 한다.
 *
 * 선택지가 적은 것부터 물어 첫 화면에서 막히지 않게 한다.
 */
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
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

/** 설문 문항 뒤에 붙는 최종 확인 화면의 인덱스 */
export const CONFIRM_STEP_INDEX = PROFILE_QUESTIONS.length;

/** 이 문항에 답을 했는지. 목적은 최소 1개, 아픈 곳은 "없습니다"(빈 배열)도 답으로 친다. */
export function isAnswered(question: ProfileQuestion, values: Partial<ProfileData>): boolean {
  const value = values[question.key];

  if (question.mode === 'single') return value !== undefined;
  if (!Array.isArray(value)) return false;

  return question.noneLabel ? true : value.length > 0;
}

/**
 * 아직 답하지 않은 첫 문항. 전부 답했으면 최종 확인 화면으로 보낸다.
 * 지난번에 중간에 나갔더라도 남은 문항부터 이어서 물을 수 있다.
 */
export function findFirstUnansweredIndex(values: Partial<ProfileData> | null | undefined): number {
  const index = PROFILE_QUESTIONS.findIndex((question) => !isAnswered(question, values ?? {}));
  return index === -1 ? CONFIRM_STEP_INDEX : index;
}

/** 최종 확인 화면에 보여줄 답변 문구 */
export function formatAnswer(question: ProfileQuestion, values: Partial<ProfileData>): string {
  const value = values[question.key];

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
