import type { ProfileData } from '@/lib/database.types';

/**
 * 태블릿에서 받는 문항은 딱 3개다.
 *
 * 입구 태블릿은 1대뿐이라 뒤에 줄이 선다. AI 루틴 생성에 반드시 필요한 값만 남기고
 * 키·몸무게·부상 부위는 여기서 묻지 않는다 — 시간도 시간이지만, 아파트 헬스장은
 * 이웃이 뒤에서 화면을 보는 곳이라 몸무게를 공용 화면에 띄우면 안 된다.
 * 나머지는 폰 앱이나 운동 종료 화면에서 한 문항씩 받는다.
 */
export type ProfileQuestionKey = 'gender' | 'age_group' | 'goal';

type Question<K extends ProfileQuestionKey> = {
  key: K;
  title: string;
  options: ReadonlyArray<{
    value: NonNullable<ProfileData[K]>;
    label: string;
    /** 시니어가 선택지를 헷갈리지 않게 붙이는 한 줄 설명 */
    caption?: string;
  }>;
};

export type ProfileQuestion =
  | Question<'gender'>
  | Question<'age_group'>
  | Question<'goal'>;

/** 선택지가 적은 것부터 물어 첫 화면에서 막히지 않게 한다. */
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  {
    key: 'gender',
    title: '성별을 골라주세요',
    options: [
      { value: 'male', label: '남성' },
      { value: 'female', label: '여성' },
    ],
  },
  {
    key: 'age_group',
    title: '연령대를 골라주세요',
    options: [
      { value: 40, label: '40대' },
      { value: 50, label: '50대' },
      { value: 60, label: '60대' },
      { value: 70, label: '70대 이상' },
    ],
  },
  {
    key: 'goal',
    title: '어떤 목적으로 운동하시나요?',
    options: [
      { value: 'diet', label: '체중 줄이기', caption: '뱃살, 체중 관리' },
      { value: 'muscle', label: '근력 키우기', caption: '힘, 근육량 늘리기' },
      { value: 'health', label: '건강 유지', caption: '꾸준히 몸 관리' },
      { value: 'rehab', label: '통증 관리', caption: '무릎, 허리 등 불편한 곳' },
    ],
  },
] as const;

/**
 * 아직 답하지 않은 첫 문항을 찾는다.
 * 지난번에 중간에 나갔더라도 남은 문항부터 이어서 물을 수 있다.
 */
export function findFirstUnansweredIndex(profileData: ProfileData | null | undefined): number {
  const index = PROFILE_QUESTIONS.findIndex(
    (question) => profileData?.[question.key] === undefined,
  );
  return index === -1 ? PROFILE_QUESTIONS.length - 1 : index;
}
