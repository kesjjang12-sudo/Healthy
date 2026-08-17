/**
 * Supabase 스키마 타입.
 *
 * supabase/migrations 와 손으로 맞춘 파일이다. 스키마를 바꾸면
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 * 로 재생성하고 아래 ProfileData 정의만 다시 붙이면 된다.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Gender = 'male' | 'female';

/** 앱 글자 크기. 가입 설문에서 고르고 프로필에서 바꾼다. */
export type FontScale = 'small' | 'medium' | 'large';
/** 10년 단위. 10 은 "10대", 70 은 "70대 이상"을 뜻한다. */
export type AgeGroup = 10 | 20 | 30 | 40 | 50 | 60 | 70;
export type Goal = 'diet' | 'muscle' | 'health' | 'rehab';
/** 루틴 생성 시 무게·동작을 낮춰야 하는 부위 */
export type PainArea = 'knee' | 'lower_back' | 'shoulder' | 'neck' | 'wrist' | 'ankle';

/**
 * users.profile_data 의 기대 형태.
 *
 * 하이브리드 설계의 "가변" 쪽이라 컬럼과 달리 DB가 형태를 강제하지 않는다.
 * 모든 필드를 optional 로 두고, 읽는 쪽에서 없을 수 있다고 가정한다.
 */
export type ProfileData = {
  /**
   * 랭킹 등 남에게 보이는 이름. update_nickname RPC 로만 바뀐다(비속어 필터와
   * 2주 변경 제한이 걸려 있다). 실명을 여기 넣으면 안 된다 — 랭킹에 그대로
   * 노출된다. 실명은 real_name 이 따로 갖는다.
   */
  nickname?: string;
  /** 마지막 닉네임 변경 시각. 2주 제한의 기준점 — 서버(update_nickname)가 찍는다. */
  nickname_changed_at?: string;
  /**
   * 가입 때 받는 실명. 회원 확인용이라 화면 어디에도 남에게 보이지 않는다.
   */
  real_name?: string;
  gender?: Gender;
  age_group?: AgeGroup;
  height_cm?: number;
  weight_kg?: number;
  /** 운동 목적. 여러 개 고를 수 있다 */
  goals?: Goal[];
  /** 주당 운동 목표 횟수 */
  weekly_target?: number;
  /** 아픈 부위. 빈 배열은 "아픈 곳 없음"을 답했다는 뜻이고, undefined 는 아직 안 물어본 것이다. */
  pain_areas?: PainArea[];
  /** 생년월일 (YYYY-MM-DD). 가입 화면에서 받는다. age_group 은 여기서 뽑는다. */
  birth_date?: string;
  /** 개인정보 수집·이용에 동의한 시각. 동의했다는 사실만으로는 기록이 안 된다. */
  privacy_consent_at?: string;
  /** 온보딩 설문 완료 여부 */
  onboarded_at?: string;
  /**
   * 글자 크기. 가입 설문에서 직접 고르고, 프로필에서 언제든 바꾼다.
   *
   * 기기 설정을 따르지 않고 앱이 따로 갖는 이유: 폰 전체 글자를 키우면
   * 카카오톡·문자까지 다 커져서 부담스러워하는 분이 많다. 이 앱에서만
   * 크게 보고 싶다는 요구가 실제로 있었다.
   */
  font_scale?: FontScale;
  /**
   * 마지막으로 받은 동의의 요약.
   *
   * 정본은 `user_consents` 테이블이다(동의·철회 이력 전체). 여기 두는 건
   * 화면이 매번 이력을 조회하지 않고도 "이 사람에게 다시 동의를 받아야 하나"를
   * 판단하기 위한 사본이다 — 로그인 직후 라우팅에서 쓰기 때문에 왕복을 한 번
   * 줄이는 게 체감이 크다.
   */
  consent?: {
    /** 동의할 때 보여준 문서/항목 구성의 버전 */
    version?: string;
    agreed_at?: string;
    /** 선택 동의(아픈 곳)에 동의했는지 */
    pain_areas?: boolean;
  };
  [key: string]: Json | undefined;
};

export type UserRole = 'resident' | 'manager' | 'admin';

export type Apartment = {
  id: string;
  name: string;
  address: string | null;
  /** 관리사무소가 태블릿 최초 설정 시 입력하는 6자리 단지 코드. 이 값 + PIN 으로 태블릿이 apt_id 를 받아 간다. */
  enroll_code: string;
  /** crypt() 로 해시된 키오스크 설정 PIN. 클라이언트는 절대 이 값을 직접 읽지 않는다(RPC로만 검증). */
  kiosk_pin_hash: string | null;
  created_at: string | null;
};

/** 태블릿이 기기에 저장해 두고 체크인마다 쓰는 단지. */
export type KioskApartment = {
  apt_id: string;
  apt_name: string;
};

/**
 * resolve_apartment_for_kiosk 응답.
 *
 * 다른 RPC 와 달리 실패가 예외가 아니라 status 로 온다 — 실패를 예외로 던지면
 * 그 호출의 트랜잭션이 롤백되면서 서버가 방금 기록한 "실패 시도"까지 지워져
 * 무차별 대입 잠금이 아예 작동하지 않는다.
 */
export type KioskEnrollmentResult =
  | ({ status: 'ok' } & KioskApartment)
  | { status: 'invalid' | 'pin_not_set' | 'locked' };

export type User = {
  id: string;
  apt_id: string | null;
  /** 카카오/구글로 먼저 가입하면 QR 페어링 전까지 null. */
  phone_number: string | null;
  /** Supabase Auth(카카오/구글/익명) 신원과의 연결. 키오스크로만 생긴 계정은 아직 null. */
  auth_user_id: string | null;
  total_points: number | null;
  role: UserRole | null;
  profile_data: ProfileData;
  /**
   * 고객대응용 계정번호("1234-5678"). uuid 는 전화로 불러줄 수 없어서 만든
   * 사람이 읽을 수 있는 고유 번호다. 서버가 가입 때 자동 발급한다.
   */
  support_code: string | null;
  created_at: string | null;
};

/** 유저-헬스장 방문 이력. is_primary 인 행이 지금의 "주 소속"이다. */
export type UserGymMembership = {
  id: string;
  user_id: string;
  apt_id: string;
  is_primary: boolean;
  visit_count: number;
  first_checked_in_at: string;
  last_checked_in_at: string;
  /** 이사로 이 헬스장을 떠난 시각. null 이면 지금 다니는 곳 — 랭킹은 null 인 행만 센다. */
  left_at: string | null;
  /** "오늘만 방문했어요" 응답 시각. 30일간은 이사 여부를 다시 묻지 않는다. */
  switch_declined_at: string | null;
  created_at: string | null;
};

/** 키오스크 체크인 후 발급되는 1회성 QR 페어링 코드. */
export type DevicePairing = {
  id: string;
  pairing_code: string;
  candidate_user_id: string;
  apt_id: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by_auth_user_id: string | null;
  created_at: string | null;
};

/** 단지 등록 실패 기록. PIN 무차별 대입을 막는 용도로만 쓰고, 성공하면 지워진다. */
export type KioskEnrollAttempt = {
  id: string;
  enroll_code: string;
  attempted_at: string;
};

/**
 * 운동 그 자체. "체스트 프레스는 이런 운동이고 이렇게 한다"는 헬스장과
 * 무관한 사실이라 여기 한 번만 둔다. equipments 는 "이 헬스장에 그 운동을 할
 * 기구가 있다"는 사실과 QR 만 갖는다 — 같은 설명을 단지마다 복사하던 구조를
 * 갈라낸 결과다.
 */
export type ExerciseCatalog = {
  id: string;
  name: string;
  /** "위에서 당기기"처럼 기구 이름보다 먼저 와닿는 쉬운 말 이름 */
  name_ko: string | null;
  /** 머신 / 스미스머신 / 케이블 / 덤벨 / 맨몸 / 유산소. '맨몸'은 기구가 없어도 처방할 수 있다 */
  station_kind: string;
  /** 시니어가 이해하기 쉬운 한 줄 설명. 비어 있으면 화면에서 부위명으로 대체한다. */
  description: string | null;
  /** 이 운동이 생활에서 왜 중요한지. 시니어 동기부여용 한 단락 */
  why_it_matters: string | null;
  /** 이 운동에서만 맞는 동작 순서. 공통 호흡·템포 규칙은 앱이 붙인다 */
  how_to_steps: string[] | null;
  /** "이것만은 지키세요" 한두 줄 */
  form_caution: string | null;
  target_muscle: string | null;
  video_url: string;
  /** 시작 자세 사진. free-exercise-db(퍼블릭 도메인) 사진을 쓰고, 직접 찍은 것이 생기면 갈아 끼운다. */
  image_url: string | null;
  /** 표준 성인 남성 시작 무게. null 이면 무게 없이 맨몸으로 안내한다 */
  base_weight_kg: number | null;
  weight_step_kg: number;
  created_at: string | null;
};

/** weight_suggestion RPC 가 계산해 루틴 항목에 끼워 주는 무게 조정 제안 */
export type WeightSuggestion = {
  action: 'increase' | 'decrease';
  current_kg: number;
  suggested_kg: number;
  reason: string;
};

/**
 * 단지별 보유 기구. "이 단지에 도감의 이 운동 기구가 몇 번 구역에 있다"만
 * 담는다. 이름·설명·영상은 catalog_id 로 도감을 따라간다.
 */
export type Equipment = {
  id: string;
  apt_id: string | null;
  catalog_id: string;
  qr_code_val: string;
  /** 헬스장 안 위치 표기. 예: "13번 구역". 없으면 화면에서 위치 줄을 생략한다. */
  location_label: string | null;
  /** 단지별 기구 사양 보정값. null 이면 도감 기본값을 쓴다 */
  base_weight_kg: number | null;
  weight_step_kg: number | null;
  created_at: string | null;
};

export type DailyRoutine = {
  id: string;
  user_id: string | null;
  /** 처방된 운동(도감). 기구가 철거돼도 기록의 정체는 이걸로 남는다 */
  catalog_id: string;
  /** 그 운동을 수행할 단지 보유 기구. 맨몸운동이면 null */
  equip_id: string | null;
  routine_date: string | null;
  target_weight: number | null;
  target_sets: number | null;
  target_reps: number | null;
  is_completed: boolean | null;
  /** 루틴 내 운동 순서. 작을수록 먼저 한다 */
  sort_order: number;
  /** 실제로 꽂은 무게(kg 환산). target_weight 는 처방값, 이건 실제 수행값. complete_routine 이 채운다. */
  actual_weight_kg: number | null;
  actual_reps: number | null;
  /** 유산소를 실제로 수행한 시간(분). 근력 운동이거나 아직 안 받았으면 null. */
  actual_duration_minutes: number | null;
  completed_at: string | null;
  points_awarded: number;
  created_at: string | null;
};

export type AttendanceLog = {
  id: string;
  user_id: string | null;
  /** 그날 체크인한 헬스장. 주 소속이 아닌 곳에서도 체크인할 수 있어 users.apt_id 와 다를 수 있다. */
  apt_id: string | null;
  attended_at: string | null;
};

/** get_daily_routine 이 돌려주는 한 줄. 루틴 + 도감 + 기구 위치를 합쳐 놓은 형태다. */
export type RoutineItem = {
  routine_id: string;
  catalog_id: string;
  /** 이 단지가 보유한 기구. null 이면 기구 없이 하는 맨몸운동이다. */
  equip_id: string | null;
  name: string;
  /** 운동 이름의 한글 직역. 예: 체스트 프레스 → "가슴 밀기". 없으면 화면에서 생략한다. */
  name_ko: string | null;
  /** 머신 / 스미스머신 / 케이블 / 덤벨 / 맨몸 / 유산소 */
  station_kind: string;
  description: string | null;
  /** 이 운동을 왜 해야 하는지. 건너뛰기 쉬운 부위와 흔한 오해를 짚어 준다. */
  why_it_matters: string | null;
  /** 이 운동에서만 맞는 동작 순서. 공통 호흡·템포 규칙은 앱이 붙인다 */
  how_to_steps: string[] | null;
  /** "이것만은 지키세요" 한두 줄 */
  form_caution: string | null;
  target_muscle: string | null;
  video_url: string;
  /** 시작 자세 사진. 글만으로는 어느 기구인지부터 막힌다. */
  image_url: string | null;
  /** 맨몸운동은 기구가 없어서 QR 도 없다. */
  qr_code_val: string | null;
  /** 기구가 있는 위치. 예: "13번 구역". 맨몸운동이거나 미입력이면 null */
  location_label: string | null;
  target_weight: number | null;
  target_sets: number | null;
  target_reps: number | null;
  /** 유산소 처방 시간(분). 근력 운동이면 null — target_reps 와 동시에 채워지지 않는다. */
  target_duration_minutes: number | null;
  /**
   * 유산소를 실제로 수행한 시간(분). 완료 전이거나 근력 운동이면 null.
   * 이 컬럼이 생기기 전에 완료한 옛 기록도 null 이다("모른다"는 뜻).
   */
  actual_duration_minutes: number | null;
  is_completed: boolean;
  /**
   * 이 기구에서 가장 최근에 꽂았던 핀 칸. 처음이거나 유산소·맨몸이면 null.
   * (daily_routines.actual_weight_kg 에는 kg 이 아니라 핀 칸이 들어 있다)
   */
  last_pin: number | null;
  /**
   * 지난 수행 기록에 근거한 무게 조정 제안. 제안일 뿐 적용은 본인이 누를 때만
   * 된다. 근거가 없거나(처음 하는 기구) 무게 개념이 없는 운동이면 null.
   */
  weight_suggestion: WeightSuggestion | null;
};

/** 몸무게 기록 한 줄. 하루에 하나만 남는다(같은 날 다시 재면 덮어씀). */
export type BodyWeightLog = {
  log_date: string;
  weight_kg: number;
};

/**
 * get_body_status RPC 결과. 기구 무게(WeightSuggestion)와 완전히 다른,
 * "몸"무게 쪽이다.
 */
export type BodyStatus = {
  height_cm: number | null;
  /** 기록이 없으면 설문 때 적은 프로필 값. 그것도 없으면 null. */
  current_weight_kg: number | null;
  current_log_date: string | null;
  first_weight_kg: number | null;
  first_log_date: string | null;
  /** null = 아직 한 번도 기록 안 함. 업데이트 팝업 판단에 쓴다. */
  days_since_last_log: number | null;
  logs: BodyWeightLog[];
};

/**
 * get_equipment_by_qr RPC 응답. 오늘 처방 여부와 무관하게 QR 로 바로 찾은
 * 기구 정보 — target_weight/sets/reps/is_completed 처럼 "이 사람에게 처방된
 * 값"은 없다(그건 RoutineItem 만 갖는다). 트레이너에게 문의하라는 안내로
 * 대신한다.
 */
export type EquipmentLookup = {
  id: string;
  catalog_id: string;
  name: string;
  /** 운동 이름의 한글 직역. 예: 체스트 프레스 → "가슴 밀기". 없으면 화면에서 생략한다. */
  name_ko: string | null;
  /** 머신 / 스미스머신 / 케이블 / 덤벨 / 맨몸 / 유산소 */
  station_kind: string;
  description: string | null;
  why_it_matters: string | null;
  /** 이 운동에서만 맞는 동작 순서. 공통 호흡·템포 규칙은 앱이 붙인다 */
  how_to_steps: string[] | null;
  /** "이것만은 지키세요" 한두 줄 */
  form_caution: string | null;
  target_muscle: string | null;
  video_url: string;
  /** 시작 자세 사진. 글만으로는 어느 기구인지부터 막힌다. */
  image_url: string | null;
  qr_code_val: string;
  /** 기구가 있는 위치. 예: "13번 구역" */
  location_label: string | null;
  base_weight_kg: number | null;
  weight_step_kg: number;
};

/** generate_daily_routine RPC 응답 */
/** 오늘 할 운동의 분량. 짧은 코스는 30분 안팎, 긴 코스는 1시간 안팎이다. */
export type RoutineCourse = 'short' | 'long';

export type GenerateRoutineResult = {
  routine_date: string;
  template: { gender: string; age_group: number; goals_key: string };
  /** 지금 적용된 코스. 고른 적이 없으면 'short'. */
  course: RoutineCourse;
  /** 오늘 목록을 다 하는 데 걸리는 예상 시간(분). 쉬는 시간과 기구 이동까지 센 값. */
  estimated_minutes: number;
  /** 코스 선택 버튼에 붙일 "이 코스는 몇 분짜리인가". 고르기 전에도 알아야 해서 템플릿에서 센다. */
  course_options: { course: RoutineCourse; minutes: number }[];
  /** 이번 호출로 새로 만들어진 운동 수. 이미 있으면 0 (재호출은 no-op) */
  created: number;
  excluded_by_pain: number;
  /** 이 단지에 해당 기구가 없어서 넣지 못한 운동 수 */
  missing_equipment: number;
  /** 아픈 곳이 많아 규칙만으로 처방하기 어려운 경우. 사람이 봐야 한다 */
  needs_trainer_review: boolean;
  routines: RoutineItem[];
};

/**
 * kiosk_check_in RPC 응답.
 * 개인정보(이름/포인트/루틴)는 절대 담지 않는다 — 태블릿 공용 화면에 뜨는 값이라서다.
 */
export type KioskCheckInResult = {
  user_id: string;
  /** 아직 한 번도 폰을 연결한 적 없는 사람. true 면 태블릿이 QR 화면으로 바로 보낸다. */
  needs_pairing: boolean;
  /**
   * 항상 내려온다. 이미 연결된 사람에게도 주는 이유는, 폰을 바꾸거나 앱을
   * 지운 경우 다시 연결할 방법이 이것뿐이기 때문이다(익명 세션은 자격
   * 증명이 없어 그 계정으로 재로그인할 수 없다). 3분 뒤 만료된다.
   */
  pairing_code?: string;
  /** 이 헬스장에서의 방문 횟수(멤버십 기준, 오늘 재체크인해도 안 올라간다) */
  visit_count: number;
  /**
   * 주 소속이 아닌 헬스장에 온 날. "이 헬스장으로 옮기셨나요?"를 물어야 한다.
   * 같은 날 두 번 찍거나, "오늘만 방문했어요"를 누른 뒤 30일간은 false 다.
   */
  prompt_gym_switch: boolean;
};

export type PairingStatus = 'pending' | 'consumed' | 'expired' | 'not_found';

export type GymMembershipSummary = {
  apt_id: string;
  apt_name: string;
  is_primary: boolean;
  visit_count: number;
  first_checked_in_at: string;
  last_checked_in_at: string;
  /** 이사로 떠난 곳이면 그 시각. 목록에는 남지만 그 단지 랭킹에는 안 나온다. */
  left_at: string | null;
};

/**
 * 분석 탭 원시 집계. 근력과 유산소는 단위가 달라(세트 vs 분) 섞지 않고 따로 센다.
 * completed_count 만 둘을 합친 값이다.
 */
export type WorkoutSummary = {
  /** 근력 + 유산소 완료 개수 */
  completed_count: number;
  /** 근력 완료 개수 */
  strength_count: number;
  /** 근력 세트 합계. 유산소 행의 형식상 1세트는 빠져 있다 */
  total_sets: number;
  /** 유산소 완료 개수 */
  cardio_count: number;
  /** 유산소 실제 수행 시간 합계(분). 실제값이 없는 옛 기록은 처방 시간으로 센다 */
  cardio_minutes: number;
  /** 근력만. 유산소는 부위별 세트라는 단위 자체가 안 맞아 빠져 있다 */
  by_muscle: { target_muscle: string | null; completed_count: number; total_sets: number }[];
};

/** 추이 그래프의 막대 하나. 운동이 없는 구간도 0 으로 채워서 온다. */
export type TrendPoint = {
  /** YYYY-MM-DD. 이 막대가 덮는 구간의 첫날 */
  bucket_start: string;
  /** YYYY-MM-DD. 하루짜리 막대면 bucket_start 와 같다 */
  bucket_end: string;
  completed_count: number;
  total_sets: number;
  /** 이 구간에 운동한 날 수. 하루짜리 막대면 0 또는 1 */
  workout_days: number;
};

export type WorkoutTrend = {
  bucket: 'day' | 'week';
  points: TrendPoint[];
  completed_count: number;
  total_sets: number;
  workout_days: number;
  /** 직전 같은 길이 구간의 합계. "지난주보다 늘었다"를 말하는 데 쓴다 */
  previous_total_sets: number;
  previous_workout_days: number;
};

/** 공유 카드에 실리는 오늘 운동 한 종목 */
export type ShareCardExercise = {
  name: string;
  name_ko: string | null;
  target_muscle: string | null;
  sets: number | null;
  reps: number | null;
  /** 유산소면 분, 근력이면 null */
  duration_minutes: number | null;
  /** 처방 무게(kg). 맨몸·유산소면 null */
  weight_kg: number | null;
};

/** get_workout_share_card 응답. 완료한 운동이 없으면 null 이 온다. */
export type WorkoutShareCard = {
  date: string;
  /** 새벽 / 아침 / 낮 / 저녁 / 밤 — 마친 시각 기준 */
  part_of_day: string;
  /** 평생 출석일 수. "312번째 운동"으로 쓴다 */
  day_count: number;
  /** 첫 완료부터 마지막 완료까지. 한 종목만 했으면 0 이라 화면에서 숨긴다 */
  duration_minutes: number;
  exercise_count: number;
  total_sets: number;
  total_reps: number;
  total_minutes_cardio: number;
  /** 처방 kg × 세트 × 횟수. 핀 칸 값은 쓰지 않는다 */
  total_volume_kg: number;
  points: number;
  muscles: string[];
  exercises: ShareCardExercise[];
};

/** get_progress_summary 의 한 기간 집계 */
export type ActivityWindow = {
  /** 그 기간에 헬스장에 나온 날 수(키오스크 체크인 기준) */
  attendance_days: number;
  completed_count: number;
  /** 근력 세트 합계. 유산소는 빠져 있다 */
  total_sets: number;
  /** 유산소 실제 수행 시간 합계(분) */
  cardio_minutes: number;
};

/**
 * 분석 탭 — 최근 기간과 직전 같은 길이 기간을 나란히.
 * 비교 대상이 있어야 "잘하고 있나"에 답할 수 있다.
 */
export type ProgressSummary = {
  days: number;
  current: ActivityWindow;
  previous: ActivityWindow;
  /** 연속으로 한 번 이상 나온 주 수. 이번 주에 아직 안 나왔어도 끊긴 걸로 보지 않는다 */
  streak_weeks: number;
};

export type VisitStats = {
  /** 평생 출석일 수(DAY_N 배지용). 헬스장 구분 없이 센다. */
  total_days: number;
  first_attended_at: string | null;
};

export type LeaderboardRow = {
  rank: number;
  /** 닉네임이 없으면 "회원xxxx" 형태로 대체된다. 전화번호 등 PII 는 절대 노출하지 않는다. */
  nickname: string;
  /** 랭킹 정렬 기준. 포인트는 자기신고라 검증이 안 돼서 순위는 이걸로만 매긴다. */
  attendance_count: number;
  /** 참고용으로만 같이 내려온다. 정렬에는 안 쓰인다. */
  total_points: number;
  is_me: boolean;
};

/** postgrest-js 가 임베디드 select 를 추론할 때 쓰는 외래키 정보 */
type Relationship<Name extends string, Column extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ['id'];
};

export type Database = {
  public: {
    Tables: {
      apartments: {
        Row: Apartment;
        Insert: Partial<Apartment> & Pick<Apartment, 'name'>;
        Update: Partial<Apartment>;
        Relationships: [];
      };
      users: {
        Row: User;
        // phone_number 는 이제 필수가 아니다 — 카카오/구글로 먼저 가입하면 QR 페어링 전까지 비어 있다.
        Insert: Partial<User>;
        Update: Partial<User>;
        Relationships: [Relationship<'users_apt_id_fkey', 'apt_id', 'apartments'>];
      };
      user_gym_memberships: {
        Row: UserGymMembership;
        Insert: Partial<UserGymMembership> & Pick<UserGymMembership, 'user_id' | 'apt_id'>;
        Update: Partial<UserGymMembership>;
        Relationships: [
          Relationship<'user_gym_memberships_user_id_fkey', 'user_id', 'users'>,
          Relationship<'user_gym_memberships_apt_id_fkey', 'apt_id', 'apartments'>,
        ];
      };
      device_pairings: {
        Row: DevicePairing;
        Insert: Partial<DevicePairing> & Pick<DevicePairing, 'pairing_code' | 'candidate_user_id' | 'apt_id' | 'expires_at'>;
        Update: Partial<DevicePairing>;
        Relationships: [
          Relationship<'device_pairings_candidate_user_id_fkey', 'candidate_user_id', 'users'>,
          Relationship<'device_pairings_apt_id_fkey', 'apt_id', 'apartments'>,
        ];
      };
      kiosk_enroll_attempts: {
        Row: KioskEnrollAttempt;
        Insert: Partial<KioskEnrollAttempt> & Pick<KioskEnrollAttempt, 'enroll_code'>;
        Update: Partial<KioskEnrollAttempt>;
        Relationships: [];
      };
      exercise_catalog: {
        Row: ExerciseCatalog;
        Insert: Partial<ExerciseCatalog> & Pick<ExerciseCatalog, 'name' | 'video_url'>;
        Update: Partial<ExerciseCatalog>;
        Relationships: [];
      };
      equipments: {
        Row: Equipment;
        Insert: Partial<Equipment> & Pick<Equipment, 'qr_code_val' | 'catalog_id'>;
        Update: Partial<Equipment>;
        Relationships: [
          Relationship<'equipments_apt_id_fkey', 'apt_id', 'apartments'>,
          Relationship<'equipments_catalog_id_fkey', 'catalog_id', 'exercise_catalog'>,
        ];
      };
      daily_routines: {
        Row: DailyRoutine;
        Insert: Partial<DailyRoutine>;
        Update: Partial<DailyRoutine>;
        Relationships: [
          Relationship<'daily_routines_user_id_fkey', 'user_id', 'users'>,
          Relationship<'daily_routines_equip_id_fkey', 'equip_id', 'equipments'>,
        ];
      };
      attendance_logs: {
        Row: AttendanceLog;
        Insert: Partial<AttendanceLog>;
        Update: Partial<AttendanceLog>;
        Relationships: [Relationship<'attendance_logs_user_id_fkey', 'user_id', 'users'>];
      };
    };
    Views: Record<string, never>;
    Functions: {
      update_profile_data: {
        Args: { p_user_id: string; p_patch: Partial<ProfileData> };
        Returns: User;
      };
      // 닉네임 전용. 비속어 검사와 "2주에 한 번" 제한(테스트 계정 제외)을
      // 서버가 지킨다 — update_profile_data 는 nickname 키를 받지 않는다.
      update_nickname: {
        Args: { p_nickname: string };
        Returns: { user: User };
      };
      generate_daily_routine: {
        // p_apt_id 를 안 주면 유저의 주 소속(users.apt_id)을 쓴다.
        // p_course 를 안 주면 저장된 선택(profile_data.course), 그것도 없으면 'short'.
        Args: { p_user_id: string; p_date?: string; p_apt_id?: string; p_course?: RoutineCourse };
        Returns: GenerateRoutineResult;
      };
      // 코스를 바꾸고 오늘 루틴을 그 자리에서 다시 짠다. 이미 마친 운동은 남는다.
      set_routine_course: {
        Args: { p_course: RoutineCourse };
        Returns: GenerateRoutineResult;
      };
      get_exercise_by_catalog_id: {
        Args: { p_catalog_id: string };
        Returns: EquipmentLookup;
      };
      get_daily_routine: {
        Args: { p_user_id: string; p_date?: string };
        Returns: RoutineItem[];
      };
      /** @deprecated resolve_apartment_for_kiosk 를 쓸 것. 구버전 앱 호환으로만 남아 있다. */
      verify_kiosk_pin: {
        Args: { p_apt_id: string; p_pin: string };
        Returns: boolean;
      };
      resolve_apartment_for_kiosk: {
        Args: { p_enroll_code: string; p_pin: string };
        Returns: KioskEnrollmentResult;
      };
      kiosk_check_in: {
        Args: { p_apt_id: string; p_phone_number: string };
        Returns: KioskCheckInResult;
      };
      confirm_gym_membership: {
        Args: { p_user_id: string; p_apt_id: string; p_make_primary: boolean };
        Returns: {
          user_id: string;
          apt_id: string;
          is_primary: boolean;
          /** 이번 전환으로 떠나게 된 헬스장 수. 화면이 안내 문구를 정할 때 쓴다. */
          left_count: number;
        };
      };
      join_gym: {
        Args: { p_apt_id: string };
        Returns: { user_id: string; apt_id: string | null; is_primary: boolean };
      };
      apply_weight_suggestion: {
        Args: { p_equip_id: string; p_weight_kg: number };
        Returns: { equip_id: string; weight_kg: number };
      };
      get_body_status: {
        Args: Record<string, never>;
        Returns: BodyStatus;
      };
      log_body_weight: {
        Args: { p_weight_kg: number; p_height_cm?: number };
        Returns: BodyStatus;
      };
      list_my_gym_memberships: {
        Args: { p_user_id: string };
        Returns: GymMembershipSummary[];
      };
      get_pairing_status: {
        Args: { p_pairing_code: string };
        Returns: { status: PairingStatus };
      };
      complete_pairing: {
        Args: { p_pairing_code: string };
        Returns: { user: User };
      };
      bootstrap_oauth_profile: {
        Args: Record<string, never>;
        Returns: { user: User };
      };
      complete_routine: {
        Args: {
          p_routine_id: string;
          p_actual_weight_kg?: number;
          p_actual_reps?: number;
          /** 유산소 실제 수행 시간(분). 1~240 을 벗어나면 INVALID_DURATION 으로 거부된다. */
          p_actual_duration_minutes?: number;
        };
        Returns: { routine: DailyRoutine; points_awarded: number };
      };
      get_todays_checkin: {
        Args: { p_user_id: string };
        Returns: { apt_id: string | null };
      };
      get_attendance_days: {
        Args: { p_user_id: string; p_month: string };
        Returns: string[];
      };
      get_workout_summary: {
        Args: { p_user_id: string; p_from: string; p_to: string };
        Returns: WorkoutSummary;
      };
      get_workout_trend: {
        Args: { p_user_id: string; p_from: string; p_to: string; p_bucket?: 'day' | 'week' };
        Returns: WorkoutTrend;
      };
      get_workout_share_card: {
        Args: { p_user_id: string; p_date?: string };
        Returns: WorkoutShareCard | null;
      };
      record_consents: {
        Args: { p_user_id: string; p_version: string; p_consents: Record<string, boolean> };
        Returns: { user: User };
      };
      revoke_consent: {
        Args: { p_user_id: string; p_consent_key: string };
        Returns: { user: User };
      };
      get_my_consents: {
        Args: { p_user_id: string };
        Returns: Record<string, { agreed: boolean; version: string; recorded_at: string }>;
      };
      record_kiosk_consent: {
        Args: { p_user_id: string; p_version: string };
        Returns: void;
      };
      get_progress_summary: {
        Args: { p_user_id: string; p_days?: number };
        Returns: ProgressSummary;
      };
      get_visit_stats: {
        Args: { p_user_id: string };
        Returns: VisitStats;
      };
      get_apartment_leaderboard: {
        Args: { p_apt_id: string; p_limit?: number };
        Returns: LeaderboardRow[];
      };
      get_equipment_by_qr: {
        Args: { p_qr_code: string };
        Returns: EquipmentLookup;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
