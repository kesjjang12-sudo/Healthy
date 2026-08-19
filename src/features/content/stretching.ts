/**
 * 스트레칭 안내. "스트레칭 자세도 알려줘야대" 요구사항.
 *
 * 기구별 운동과 달리 특정 기구에 매인 동작이 아니라서, 오늘 루틴(daily_routines)에
 * 끼워 넣지 않고 운동 탭에서 언제든 펼쳐 보는 고정 안내로 둔다 — 매일 달라질
 * 이유가 없는 내용이라, 개인화된 처방처럼 보이게 만들 필요도 없다.
 *
 * 여기 담긴 동작은 특정 기구나 병력을 전제하지 않는, 일반적으로 널리 쓰이는
 * 맨몸 스트레칭만 골랐다 — 특정 통증에 좋다는 식의 의학적 효능 주장은 넣지
 * 않는다. 아프면 그 동작만 빼고 하시라고 안내한다.
 */
export type Stretch = {
  name: string;
  /** 자세를 잡는 순서. 두세 문장 안에서 끝낸다 — 길면 기구 안내와 마찬가지로 시니어가 따라가기 어렵다. */
  steps: readonly string[];
  /** 유지 시간 안내. 동적 스트레칭(운동 전)은 없을 수 있다. */
  hold?: string;
  /** 자세 사진. 기구 도감과 같은 퍼블릭 도메인 저장소(free-exercise-db)에서 온다. */
  image?: string;
};

/** 기구 사진과 같은 저장소 — 퍼블릭 도메인(Unlicense)이라 출처 표기 의무도 없다. */
const IMG = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

export const WARM_UP_STRETCHES: readonly Stretch[] = [
  {
    name: '목 좌우로 기울이기',
    image: `${IMG}/Side_Neck_Stretch/0.jpg`,
    steps: ['정면을 보고 편하게 서요.', '한쪽 귀를 어깨 쪽으로 천천히 기울여요.', '반대쪽도 같은 만큼 기울여요.'],
    hold: '양쪽 각 5초씩, 3번',
  },
  {
    name: '어깨 돌리기',
    image: `${IMG}/Shoulder_Circles/0.jpg`,
    steps: ['양쪽 어깨를 귀 쪽으로 으쓱 올렸다 내려요.', '이어서 어깨를 앞에서 뒤로 크게 돌려요.'],
    hold: '10회',
  },
  {
    name: '팔 벌려 크게 돌리기',
    image: `${IMG}/Arm_Circles/0.jpg`,
    steps: ['양팔을 옆으로 벌려요.', '작은 원에서 시작해 점점 크게 돌려요.'],
    hold: '앞으로 10회, 뒤로 10회',
  },
  {
    name: '제자리 걷기',
    steps: ['팔을 자연스럽게 흔들며 제자리에서 걸어요.', '숨이 살짝 가빠질 정도로만 해요.'],
    hold: '1~2분',
  },
] as const;

export const COOL_DOWN_STRETCHES: readonly Stretch[] = [
  {
    name: '앉아서 다리 뻗어 앞으로 숙이기',
    image: `${IMG}/Seated_Floor_Hamstring_Stretch/0.jpg`,
    steps: [
      '의자에 앉거나 바닥에 앉아 한쪽 다리를 앞으로 펴요.',
      '무릎을 편 채로 허리부터 천천히 숙여요.',
      '허벅지 뒤쪽이 당기는 느낌이 들면 멈춰요.',
    ],
    hold: '양쪽 각 15~20초',
  },
  {
    name: '종아리 늘리기',
    image: `${IMG}/Calf_Stretch_Hands_Against_Wall/0.jpg`,
    steps: [
      '벽이나 의자를 짚고 서요.',
      '한쪽 다리를 뒤로 뻗고 뒤꿈치를 바닥에 붙인 채 무릎을 펴요.',
      '앞다리를 살짝 굽혀 체중을 앞으로 보내요.',
    ],
    hold: '양쪽 각 15~20초',
  },
  {
    name: '가슴 펴고 양손 뒤로 잡기',
    image: `${IMG}/Chest_And_Front_Of_Shoulder_Stretch/0.jpg`,
    steps: ['등받이 없는 의자나 선 자세에서 양손을 등 뒤로 모아요.', '어깨를 뒤로 펴며 가슴을 열어요.'],
    hold: '15~20초',
  },
  {
    name: '허리 좌우로 비틀기',
    image: `${IMG}/Torso_Rotation/0.jpg`,
    steps: ['의자에 앉아 등을 곧게 펴요.', '상체만 천천히 한쪽으로 돌려요.', '반대쪽도 같은 만큼 돌려요.'],
    hold: '양쪽 각 10초',
  },
] as const;

export const STRETCHING_SAFETY_RULE =
  '아프거나 저리면 그 동작만 건너뛰세요. 통증이 있는데 억지로 늘리면 다칠 수 있어요.';

export const STRETCHING_TIMING_RULE =
  '운동 전엔 몸을 움직이며 데우는 동작을, 운동 후엔 가만히 늘리는 동작을 하는 게 순서에 맞아요.';
