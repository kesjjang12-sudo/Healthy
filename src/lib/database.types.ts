/**
 * Supabase 스키마 타입.
 *
 * supabase/migrations 와 손으로 맞춘 파일이다. 스키마를 바꾸면
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 * 로 재생성하고 아래 ProfileData 정의만 다시 붙이면 된다.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Gender = 'male' | 'female';
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
  /** 표시용 이름 */
  nickname?: string;
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
  /** 온보딩 설문 완료 여부 */
  onboarded_at?: string;
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
  /** crypt() 로 해시된 키오스크 설정 PIN. 클라이언트는 절대 이 값을 직접 읽지 않는다(RPC로만 검증). */
  kiosk_pin_hash: string | null;
  created_at: string | null;
};

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

export type Equipment = {
  id: string;
  apt_id: string | null;
  qr_code_val: string;
  name: string;
  /** 시니어가 이해하기 쉬운 한 줄 설명. 비어 있으면 화면에서 부위명으로 대체한다. */
  description: string | null;
  target_muscle: string | null;
  video_url: string;
  /** 표준 성인 남성 시작 무게. null 이면 무게 없이 맨몸으로 안내한다 */
  base_weight_kg: number | null;
  /** 이 기구에서 조절 가능한 최소 단위(kg) */
  weight_step_kg: number;
  created_at: string | null;
};

export type DailyRoutine = {
  id: string;
  user_id: string | null;
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

/** get_daily_routine 이 돌려주는 한 줄. 루틴 + 기구 정보를 합쳐 놓은 형태다. */
export type RoutineItem = {
  routine_id: string;
  equip_id: string;
  name: string;
  description: string | null;
  target_muscle: string | null;
  video_url: string;
  qr_code_val: string;
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
};

/**
 * get_equipment_by_qr RPC 응답. 오늘 처방 여부와 무관하게 QR 로 바로 찾은
 * 기구 정보 — target_weight/sets/reps/is_completed 처럼 "이 사람에게 처방된
 * 값"은 없다(그건 RoutineItem 만 갖는다). 트레이너에게 문의하라는 안내로
 * 대신한다.
 */
export type EquipmentLookup = {
  id: string;
  name: string;
  description: string | null;
  target_muscle: string | null;
  video_url: string;
  qr_code_val: string;
  base_weight_kg: number | null;
  weight_step_kg: number;
};

/** generate_daily_routine RPC 응답 */
export type GenerateRoutineResult = {
  routine_date: string;
  template: { gender: string; age_group: number; goals_key: string };
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
  /** 이미 다른 단지가 주 소속인 사람이 새 단지에서 처음 체크인한 경우 */
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
      equipments: {
        Row: Equipment;
        Insert: Partial<Equipment> & Pick<Equipment, 'qr_code_val' | 'name' | 'video_url'>;
        Update: Partial<Equipment>;
        Relationships: [Relationship<'equipments_apt_id_fkey', 'apt_id', 'apartments'>];
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
      generate_daily_routine: {
        // p_apt_id 를 안 주면 유저의 주 소속(users.apt_id)을 쓴다.
        Args: { p_user_id: string; p_date?: string; p_apt_id?: string };
        Returns: GenerateRoutineResult;
      };
      get_daily_routine: {
        Args: { p_user_id: string; p_date?: string };
        Returns: RoutineItem[];
      };
      verify_kiosk_pin: {
        Args: { p_apt_id: string; p_pin: string };
        Returns: boolean;
      };
      kiosk_check_in: {
        Args: { p_apt_id: string; p_phone_number: string };
        Returns: KioskCheckInResult;
      };
      confirm_gym_membership: {
        Args: { p_user_id: string; p_apt_id: string; p_make_primary: boolean };
        Returns: { user_id: string; apt_id: string; is_primary: boolean };
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
