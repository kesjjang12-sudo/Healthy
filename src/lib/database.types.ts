/**
 * Supabase 스키마 타입.
 *
 * supabase/migrations 와 손으로 맞춘 파일이다. 스키마를 바꾸면
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 * 로 재생성하고 아래 ProfileData 정의만 다시 붙이면 된다.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Gender = 'male' | 'female';
/** 10년 단위. 70 은 "70대 이상"을 뜻한다. */
export type AgeGroup = 40 | 50 | 60 | 70;
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
  [key: string]: Json | undefined;
};

export type UserRole = 'resident' | 'manager' | 'admin';

export type Apartment = {
  id: string;
  name: string;
  address: string | null;
  created_at: string | null;
};

export type User = {
  id: string;
  apt_id: string | null;
  phone_number: string;
  total_points: number | null;
  role: UserRole | null;
  profile_data: ProfileData;
  created_at: string | null;
};

export type Equipment = {
  id: string;
  apt_id: string | null;
  qr_code_val: string;
  name: string;
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
  created_at: string | null;
};

export type AttendanceLog = {
  id: string;
  user_id: string | null;
  attended_at: string | null;
};

/** get_daily_routine 이 돌려주는 한 줄. 루틴 + 기구 정보를 합쳐 놓은 형태다. */
export type RoutineItem = {
  routine_id: string;
  equip_id: string;
  name: string;
  target_muscle: string | null;
  video_url: string;
  qr_code_val: string;
  target_weight: number | null;
  target_sets: number | null;
  target_reps: number | null;
  is_completed: boolean;
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

/** sign_in_with_phone RPC 응답 */
export type SignInResult = {
  user: User;
  is_new_user: boolean;
  attendance_logged: boolean;
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
        Insert: Partial<User> & Pick<User, 'phone_number'>;
        Update: Partial<User>;
        Relationships: [Relationship<'users_apt_id_fkey', 'apt_id', 'apartments'>];
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
      sign_in_with_phone: {
        Args: { p_apt_id: string; p_phone_number: string; p_profile_data?: ProfileData };
        Returns: SignInResult;
      };
      update_profile_data: {
        Args: { p_user_id: string; p_patch: Partial<ProfileData> };
        Returns: User;
      };
      generate_daily_routine: {
        Args: { p_user_id: string; p_date?: string };
        Returns: GenerateRoutineResult;
      };
      get_daily_routine: {
        Args: { p_user_id: string; p_date?: string };
        Returns: RoutineItem[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
