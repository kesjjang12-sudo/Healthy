# 핏루틴 (FitRoutine)

4060 시니어를 위한 아파트 헬스장 B2B AI 코칭 플랫폼.

- **프론트엔드**: React Native (Expo SDK 57, expo-router)
- **백엔드 / DB**: Supabase (PostgreSQL + Auth)

## 0. 큰 그림 — 키오스크와 개인 앱

하나의 코드베이스가 **헬스장 입구 태블릿(키오스크)** 과 **입주민 개인 폰** 양쪽에 깔린다.
앱을 처음 실행할 때 "이 기기는 무엇인가요?"를 한 번 묻고, 그 답을 기기에 저장해 계속
따라간다(`src/features/device-role/`).

| | 키오스크 (공용, 입구) | 개인 폰 앱 |
| --- | --- | --- |
| 로그인 | 없음 — 전화번호는 **출입 체크인**일 뿐 | 카카오 / 구글 / 전화번호(QR) |
| 보여주는 것 | "N번째 방문입니다" 확인, QR 페어링 | 오늘의 운동, 달력, 랭킹, 분석, 프로필 |
| 세션 | Supabase Auth 세션 없음(anon 키 RPC만) | 진짜 Supabase Auth 세션 |

**왜 이렇게 나눴나.** 처음엔 태블릿 번호 입력이 곧 로그인이었다 — 번호만 알면 누구나
그 사람 계정으로 들어갈 수 있는 구조였다. 지금은 키오스크가 개인 데이터를 아예 보여주지
않으므로 그 문제 자체가 없어졌다. 개인 데이터는 카카오·구글 로그인(번호로는 못 뚫음) 또는
QR 페어링(그 헬스장에 물리적으로 가서 3분 안에 스캔해야 함)으로만 접근할 수 있다.

### QR 페어링

카카오·구글은 전화번호를 안 준다(카카오는 사업자등록+심사가 있어야 받을 수 있는데,
지금은 그 절차를 안 밟았다). 그래서 전화번호는 별도 경로로 잇는다.

```
키오스크에서 처음 체크인
  → 6자리 페어링 코드 발급 (device_pairings, 3분 유효)
  → 태블릿이 QR(딥링크) + 숫자를 같이 보여줌
  → 폰이 QR을 찍거나(pair-scan.tsx) 시스템 카메라로 찍어 딥링크로 열리거나(pair/[code].tsx)
    숫자를 직접 입력하거나
  → complete_pairing RPC가 auth.uid() 를 그 전화번호 계정에 연결
```

이미 카카오로 가입한 사람이 나중에 페어링하면, 키오스크가 번호로 만들어 둔 "그림자
계정"이 기존 계정에 **병합**된다(방문 이력·포인트·루틴 기록 모두 합쳐짐). 병합 로직은
`complete_pairing` 안에 있다(`supabase/migrations/20260812000012_pairing_rpcs.sql`).

전화번호로만 계속 쓰고 싶은 사람은 `signInAnonymously()` 로 만든 세션이 그대로 계정이
된다 — 카카오/구글 없이도 정식 로그인 경로다.

## 1. DB 구조 — 하이브리드 아키텍처

인증·포인트처럼 정합성이 중요한 고정 데이터는 **일반 컬럼**, 신체 정보나 운동 목적처럼
기획에 따라 자주 바뀌는 데이터는 **`users.profile_data` (JSONB)** 로 나눴다.

| 테이블 | 역할 |
| --- | --- |
| `apartments` | 아파트 단지. `kiosk_pin_hash` 로 키오스크 설정을 보호 |
| `users` | 유저. `auth_user_id` 로 Supabase Auth 신원과 연결(카카오/구글로 먼저 가입하면 `phone_number` 는 페어링 전까지 null) |
| `user_gym_memberships` | 유저가 다닌 헬스장 이력. `is_primary` 행이 지금의 "주 소속", `left_at` 이 찍힌 행은 이사로 떠난 곳(이사 대응의 핵심) |
| `device_pairings` | 키오스크가 발급한 1회성 QR 페어링 코드(3분 유효) |
| `exercise_catalog` | 운동 도감(전체 공용). 기구 운동·맨몸운동의 이름·설명·영상·기본 무게를 본사가 미리 등록 |
| `equipments` | 단지별 보유 기구. "도감의 이 운동 기구가 몇 번 구역(`location_label`)에 있다"만 담당. `qr_code_val` 로 QR 스캔 시 조회 |
| `daily_routines` | 유저별 하루 루틴. `catalog_id` 가 "무슨 운동", `equip_id` 가 "어느 기구"(맨몸이면 null). `actual_weight_kg`/`actual_reps`/`points_awarded` 는 완료 시 채워짐 |
| `user_equipment_levels` | 사람별·기구별 현재 사용 무게. "올려볼게요"를 눌렀을 때만 바뀌고, 있으면 템플릿 계산보다 우선한다 |
| `attendance_logs` | 출석 기록. `apt_id` 로 그날 어느 헬스장이었는지도 남긴다 |
| `kiosk_enroll_attempts` | 단지 등록 실패 기록. PIN 무차별 대입을 막는 용도로만 쓰고 성공하면 지워진다 |
| `equipments` | 기구와 시범 영상. `qr_code_val` 로 QR 스캔 시 조회 |
| `daily_routines` | 유저별 하루 루틴. `actual_weight_kg`/`actual_reps`/`actual_duration_minutes`(유산소)/`points_awarded` 는 완료 시 채워짐 |
| `attendance_logs` | 출석 기록. `apt_id` 로 그날 어느 헬스장이었는지도 남긴다 |
| `user_consents` | 개인정보 수집·이용 동의와 철회 이력. 추가만 하고 지우지 않는다 |

마이그레이션은 `supabase/migrations/` 에 순서대로 있다. `supabase/setup.sql` 은 전부
합쳐 둔 단일 실행용 파일이다(뒤에서 설명).

| 파일 | 하는 일 |
| --- | --- |
| `20260812000001_init_schema.sql` | 기본 테이블, 제약, 인덱스 |
| `20260812000002_rls_and_auth.sql` | RLS 정책, `normalize_phone_number` |
| `20260812000003_routine_templates.sql` | 루틴 템플릿 조합 + 아픈 곳 규칙 |
| `20260812000004_generate_daily_routine.sql` | 루틴 생성/조회 RPC |
| `20260812000005_add_young_age_groups.sql` | 연령대에 10·20·30대 추가 |
| `20260812000006_link_auth_identity.sql` | `users.auth_user_id`, `phone_number` nullable |
| `20260812000007_gym_memberships.sql` | `user_gym_memberships` + `attendance_logs.apt_id` + 백필 |
| `20260812000008_device_pairings.sql` | `device_pairings` 테이블 |
| `20260812000009_kiosk_pin.sql` | `apartments.kiosk_pin_hash`, `verify_kiosk_pin` |
| `20260812000010_kiosk_checkin_rpc.sql` | `kiosk_check_in` (sign_in_with_phone 대체) |
| `20260812000011_gym_membership_rpcs.sql` | `confirm_gym_membership`, `list_my_gym_memberships` |
| `20260812000012_pairing_rpcs.sql` | `get_pairing_status`, `complete_pairing`, `bootstrap_oauth_profile` |
| `20260812000013_workout_completion.sql` | 운동 완료 컬럼 + `complete_routine`(포인트 지급) |
| `20260812000014_generate_daily_routine_apt_param.sql` | `generate_daily_routine` 에 `p_apt_id` 추가, `get_todays_checkin` |
| `20260812000015_attendance_and_analysis_rpcs.sql` | 달력·분석 탭용 RPC 3종 |
| `20260812000016_ranking_rpc.sql` | `get_apartment_leaderboard`(같은 단지만) |
| `20260812000017_drop_sign_in_with_phone.sql` | 옛 인증 RPC 제거 |
| … | (18~23은 랭킹 기준·기구 조회·유산소·재설치 복구·실시간 체크인) |
| `20260812000024_kiosk_apartment_enrollment.sql` | `apartments.enroll_code`, `resolve_apartment_for_kiosk` — 태블릿이 단지를 스스로 기억 |
| `20260812000025_leave_gym_on_switch.sql` | `left_at`/`switch_declined_at` — 이사하면 옛 단지 랭킹에서 빠진다 |
| `20260812000026_exercise_catalog.sql` | 운동 도감(`exercise_catalog`) 분리 + 단지별 보유·위치(`location_label`) + 맨몸운동 대체 처방 |
| `20260812000018_ranking_by_attendance.sql` | 랭킹 기준을 포인트 → 출석 횟수로 |
| `20260812000019_equipment_description.sql` | `equipments.description`(쉬운 말 설명) |
| `20260812000020_equipment_qr_lookup.sql` | `get_equipment_by_qr`(루틴 밖 기구도 조회) |
| `20260812000021_cardio_routine.sql` | 유산소 처방(분) + 40대 이상 템플릿에 추가 |
| `20260812000022_repair_after_reinstall.sql` | 앱 재설치 후 계정 복구 |
| `20260812000023_realtime_checkin.sql` | 키오스크 체크인을 폰이 실시간 반영 |
| `20260812000024_cardio_actual_duration.sql` | 유산소 **실제 수행 시간** 기록 + 분석 집계 분리 |
| `20260812000025_profile_name_and_progress.sql` | 카카오/구글 이름 가져오기 + `get_progress_summary` |
| `20260812000026_consent.sql` | `user_consents`(동의·철회 이력) + 동의 RPC 4종 |

### 루틴 생성: 런타임 AI 호출 없음

**모든 경우의 수를 미리 조합해 둔다.** 시니어 대상이라 매번 다른 결과가 나오면 안전
검수가 불가능하고, 태블릿 앞에서 AI 응답을 기다리는 시간이 그대로 줄이 된다. API 키
노출·지연·건당 비용도 전부 없어진다.

커버리지는 **성별 2 × 연령대 7 × 목적 조합 15 × 아픈 곳 조합 64** 다. 저장은 앞의 셋만
조합한 **210개 템플릿**으로 두고, 아픈 곳은 조합이 아니라 후처리 규칙으로 적용한다.
커버리지는 같으면서 사람이 검수할 수 있는 분량이 된다.

```
goal_blocks      목적별 기본 처방 (부위·세트·횟수·무게비율)
age_modifiers    연령대 보정 (10대는 성장판 고려로 가장 낮게, 70대는 0.65배 + 세트 -1)
gender_modifiers 성별 보정
      ↓ rebuild_routine_templates()
routine_templates + routine_template_items   ← 210개 조합
      ↓ generate_daily_routine(user_id, date, apt_id?)
pain_area_rules 적용 → 운동 도감에서 치환(보유 기구 우선, 없으면 맨몸운동) → daily_routines
```

`p_apt_id` 를 안 주면 유저의 주 소속(`users.apt_id`)을 쓴다. 이사 후 아직 안 옮긴
헬스장에서 체크인한 날에는 `get_todays_checkin` 이 오늘 체크인한 헬스장을 먼저 찾아
그 apt 로 루틴을 짠다 — 주 소속 하나만 보면 실제 서 있는 헬스장과 다른 기구로 루틴이
짜일 수 있어서다.

규칙 테이블만 고치고 `rebuild_routine_templates()` 를 다시 돌리면 전체가 재생성된다.

**안전 장치**

- 무게는 기구 조절 단위로 **내림**한다. 반올림하면 의도보다 무거워지는데, 시니어에게는
  가벼운 쪽이 틀리는 방향으로 안전하다
- 프로필이 비어 있으면 가장 보수적인 값(여성·70대·건강유지)으로 떨어진다
- 아픈 곳은 `exclude`(운동 자체를 뺌) / `derate`(무게만 낮춤) 두 가지로 적용한다
- 아픈 곳이 3군데 이상이거나 남는 운동이 없으면 `needs_trainer_review` 를 세워 사람에게 넘긴다
- 1세트짜리 처방이 나오지 않도록 최소 2세트를 보장한다

> ⚠️ 여기 담긴 무게·세트·횟수는 **의료 조언이 아니다.** 실서비스 전에 트레이너 또는
> 물리치료사 검수를 반드시 거쳐야 한다. 특히 `pain_area_rules` 가 안전 장치다.

### 이사: 옛 단지에서 빠지되, 기록은 남긴다

랭킹은 같은 단지 안에서만 매긴다. 그래서 이사 간 사람이 옛 단지 순위표에 남으면
곤란하다 — 그 사람은 거기서 쌓아 둔 출석일이 많아 상위권에 박힌 채로 다시는 오지
않으므로, 남은 주민들에겐 영영 못 넘는 유령이 된다.

```
주 소속이 아닌 헬스장에서 체크인
  → kiosk_check_in 이 prompt_gym_switch=true 로 응답
  → 태블릿이 "이 헬스장으로 옮기셨나요?" (kiosk/membership-prompt.tsx)
      ├─ "네"       → confirm_gym_membership(true):  다른 헬스장에 left_at 을 찍는다
      └─ "오늘만"   → confirm_gym_membership(false): switch_declined_at, 30일간 안 물음
```

**행을 지우지 않고 `left_at` 만 찍는다.** 지우면 "그 헬스장을 몇 번 다녔는지"라는 본인
기록까지 사라지기 때문이다. 랭킹에서만 빠지고, 프로필의 "내 헬스장"에는 *이전에 다니던
곳* 으로 남는다. 거기서 다시 주 소속으로 되돌릴 수도 있다.

운동 기록 쪽은 애초에 손댈 게 없다. 달력(`get_attendance_days`)·분석
(`get_workout_summary`)·DAY_N 배지(`get_visit_stats`)는 전부 `user_id` 로만 조회하고
단지로 거르지 않는다. **소속이 바뀌는 것과, 그동안 운동한 사실이 남는 것은 별개다.**

팝업은 한 번 놓쳐도 다시 뜬다. 옛 단지에서 빠지는 유일한 경로가 이 팝업이라, 자리를
비웠거나 뒷사람에 밀려 넘어갔다고 끝나면 안 되기 때문이다. 대신 같은 날 두 번 찍으면
묻지 않고, "오늘만 방문했어요"를 누르면 30일간 묻지 않는다 — 두 헬스장을 정말로 번갈아
쓰는 사람을 괴롭히지 않으려는 선이다.

### RLS 방침

키오스크는 Supabase Auth 세션을 들고 있지 않고 anon 키만 갖는다(`kiosk_check_in` 은
세션 없는 RPC 호출일 뿐이다). 개인 앱은 진짜 Auth 세션을 갖지만, 그래도 테이블을 직접
열지 않는다 — `users` / `daily_routines` / `attendance_logs` / `user_gym_memberships` /
`device_pairings` 에는 **anon·authenticated 정책을 아예 두지 않아 deny-by-default** 로
막고, 접근은 전부 `security definer` RPC로만 연다. `apartments` 와 `equipments` 만 읽기
공개다.

개인 데이터를 다루는 RPC는 파라미터로 `p_user_id` 를 받되(기존 호출 관례를 유지), 함수
안에서 `auth.uid()` 와 대조해 **본인 것이 아니면 거부**한다. 키오스크가 부르는
`kiosk_check_in`/`confirm_gym_membership` 은 예외 — anon 은 애초에 `auth.uid()` 가
없으므로 이 검사를 건너뛴다(그게 키오스크의 신뢰 모델이다).

| RPC | 호출 주체 | 하는 일 |
| --- | --- | --- |
| `kiosk_check_in(p_apt_id, p_phone_number)` | 키오스크(anon) | 체크인. 이름·포인트 등 PII 절대 반환 안 함. 페어링 필요 시 코드 발급. 주 소속이 아닌 곳에 온 날은 `prompt_gym_switch` |
| `resolve_apartment_for_kiosk(p_enroll_code, p_pin)` | 키오스크(anon) | 태블릿 최초 설정. 단지 코드+PIN 확인 후 `apt_id` 반환. 실패는 예외가 아니라 `status` 로 온다 |
| `verify_kiosk_pin(p_apt_id, p_pin)` | 키오스크(anon) | **[deprecated]** 구버전 앱 호환용 |
| `confirm_gym_membership(p_user_id, p_apt_id, p_make_primary)` | 키오스크 또는 개인 앱 | "이 헬스장으로 옮기셨나요?" 응답. `true` 면 다니던 다른 헬스장을 떠난 것으로 처리, `false` 면 30일간 다시 안 물음 |
| `get_pairing_status(p_pairing_code)` | 키오스크(anon, 폴링) | PII 없이 상태(pending/consumed/expired)만 |
| `complete_pairing(p_pairing_code)` | 개인 앱(authenticated) | QR 페어링 완료, 필요 시 그림자 계정 병합 |
| `bootstrap_oauth_profile()` | 개인 앱(authenticated) | 카카오/구글 첫 로그인 시 프로필 생성 |
| `list_my_gym_memberships(p_user_id)` | 개인 앱 | 내가 다닌 헬스장 목록. 떠난 곳도 기록으로 함께 반환 |
| `bootstrap_oauth_profile()` | 개인 앱(authenticated) | 카카오/구글 첫 로그인 시 프로필 생성 + 제공자가 준 이름을 `nickname` 에 채움 |
| `list_my_gym_memberships(p_user_id)` | 개인 앱 | 내가 다닌 헬스장 목록 |
| `update_profile_data(p_user_id, p_patch)` | 양쪽 | `profile_data` 를 `||` 로 병합 |
| `generate_daily_routine(p_user_id, p_date?, p_apt_id?)` | 개인 앱 | 하루 루틴 생성 |
| `get_daily_routine(p_user_id, p_date?)` | 개인 앱 | 해당 날짜 루틴 조회 |
| `get_todays_checkin(p_user_id)` | 개인 앱 | 오늘 체크인한 헬스장(없으면 주 소속) |
| `complete_routine(p_routine_id, p_actual_weight_kg?, p_actual_reps?, p_actual_duration_minutes?)` | 개인 앱 | 완료 처리 + 포인트 지급(1건당 10점, 재완료는 중복 지급 안 함). 유산소는 실제 수행 분(1~240)을 함께 받는다 |
| `get_attendance_days(p_user_id, p_month)` | 개인 앱 | 달력 탭 — 그 달 출석일 |
| `get_workout_summary(p_user_id, p_from, p_to)` | 개인 앱 | 분석 탭 원시 집계. 근력(세트)과 유산소(분)를 나눠서 준다(칼로리 계산은 클라이언트가 함) |
| `get_progress_summary(p_user_id, p_days?)` | 개인 앱 | 분석 탭 — 최근 기간 vs 직전 같은 길이 기간 + 연속 출석 주 수 |
| `get_visit_stats(p_user_id)` | 개인 앱 | 운동 탭 "DAY_N" 배지용 평생 출석일 수 |
| `get_apartment_leaderboard(p_apt_id, p_limit?)` | 개인 앱 | 지금 그 단지를 다니는 사람만의 출석 랭킹(떠난 사람 제외). 닉네임/출석횟수만, PII 없음 |
| `get_apartment_leaderboard(p_apt_id, p_limit?)` | 개인 앱 | 같은 단지 랭킹. 닉네임/포인트만, PII 없음 |
| `record_consents(p_user_id, p_version, p_consents)` | 개인 앱 | 동의 항목 일괄 기록. 필수가 빠지면 거부 |
| `revoke_consent(p_user_id, p_consent_key)` | 개인 앱 | 선택 동의 철회 + 저장된 값 실제 삭제 |
| `get_my_consents(p_user_id)` | 개인 앱 | 항목별 현재 동의 상태 |
| `record_kiosk_consent(p_user_id, p_version)` | 키오스크(anon) | 전화번호 수집 고지 동의 기록(하루 한 줄) |

## 2. 실기기(태블릿 + 휴대폰)로 테스트하기

### 1) Supabase 프로젝트 준비

가장 빠른 길은 **`supabase/setup.sql` 전체를 대시보드 SQL Editor 에 붙여넣고 Run** 하는
것이다. 모든 마이그레이션과 시드를 순서대로 합쳐 둔 파일이고, 전부 idempotent 라 여러 번
실행해도 안전하다.

CLI 로 관리하려면 이쪽이 낫다 (마이그레이션 이력이 남는다):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push                        # migrations 적용
psql "$DATABASE_URL" -f supabase/seed.sql   # 시범단지 + 보유 기구 6대(위치 포함)
```

**카카오/구글 로그인을 실제로 켜려면 추가로 필요한 것** (안 해도 앱은 뜨지만 그 두
버튼이 안 먹는다):

1. 카카오 디벨로퍼스에서 앱 등록 → REST API 키 발급 (기본 프로필/이메일 스코프만, 전화번호는 요청하지 않는다)
2. Google Cloud Console 에서 OAuth 클라이언트 ID 발급
3. Supabase 대시보드 → **Authentication → Providers** 에서 Kakao/Google 활성화 + 위 키 입력
4. Supabase 대시보드 → **Authentication → Settings** 에서 **Enable anonymous sign-ins** 켜기
   (전화번호로만 로그인하는 경로가 이 설정에 의존한다)

### 2) `.env` 작성

```bash
npm install
cp .env.example .env
```

`Project Settings → API` 에서 **Project URL** 과 **anon public** 키를 복사해 넣는다.
`EXPO_PUBLIC_FITROUTINE_APT_ID` 는 이제 선택값이다. 태블릿은 최초 설정 때 단지 등록
코드를 입력해 자기 단지를 기억하므로(아래 참고), 새로 설치하는 기기에는 필요 없다.
이미 이 값이 박힌 채로 설치된 태블릿을 새 형식으로 옮길 때만 한 번 읽힌다.

`.env` 값은 `EXPO_PUBLIC_` 접두사라 번들에 그대로 박힌다. **service_role key 는 절대 넣지 말 것.**
값이 비어 있으면 앱이 빨간 에러 대신 "설정이 필요합니다" 안내 화면을 띄운다.

### 3) 기기에서 실행 — 두 가지 방법

#### 방법 A. Expo Go (개발 중 권장)

```bash
git clone <this-repo> && cd Healthy
npm install
npx expo start -c          # -c 는 캐시 초기화. .env 를 바꾼 뒤에는 꼭 필요하다
```

태블릿·휴대폰에 **Expo Go** 를 설치하고 터미널에 뜬 QR 을 찍는다. Expo SDK 57 이라
Expo Go 도 최신 버전이어야 한다.

카카오/구글 로그인의 OAuth 리다이렉트(딥링크)는 Expo Go 안에서는 완전히 검증되지
않을 수 있다 — 정확히 확인하려면 방법 B(설치형 빌드)를 쓴다.

#### 방법 B. EAS Build (설치형 앱)

```bash
npx eas login
npx eas build --profile preview --platform android   # 설치용 .apk
```

빌드가 끝나면 링크로 APK 를 받아 태블릿·폰에 설치한다. `EXPO_PUBLIC_*` 값은 `eas.json`
각 프로필에 이미 넣어 뒀다.

**코드만 바뀐 경우는 재설치할 필요 없다.** `expo-updates` 가 켜져 있어서
`npx eas update --branch preview --message "..."` 한 줄이면 앱을 다음에 켤 때 자동으로
최신 코드를 받는다. 네이티브 설정(아이콘, 권한, 새 네이티브 패키지)이 바뀔 때만 다시
빌드해서 재설치해야 한다.

### 4) 확인할 흐름

1. **태블릿을 키오스크로 설정**: 최초 실행 시 "헬스장 입구 태블릿" 선택 → 단지 코드
   `TEST24` → 관리자 PIN `1234` → 체크인 화면 고정(상단에 단지 이름이 뜬다)
2. **태블릿에서 새 번호로 체크인**: 처음 보는 번호를 누르면 QR + 6자리 코드가 뜬다
3. **폰을 개인 앱으로 설정**: 다른 기기(또는 시크릿 창)에서 "제 휴대폰입니다" 선택 →
   로그인 화면에서 **전화번호로 시작하기** → 카메라로 태블릿 QR을 찍거나 코드를 직접 입력
4. 페어링이 끝나면 **동의 화면** → 설문 5문항(이름부터) → 최종 확인 → **오늘의 운동**.
   확인할 것: 동의 화면에서 "아픈 곳"을 거부하고 진행하면 설문에서 그 문항이 아예 안
   나오는지, 프로필 탭에서 동의를 거두면 이미 답한 아픈 곳이 지워지는지, 운동 탭 맨 위에
   "○○ 님, 안녕하세요"가 뜨는지 — 이름은 카카오·구글로 들어오면 이미 채워져 있고,
   전화번호로 들어오면 설문 1번에서 직접 받는다
5. 운동을 눌러 하는 방법·세트를 확인하고, 완료하면 실제로 포인트가 올라가는지 확인
6. 하단 탭(운동/달력/랭킹/분석/프로필)을 돌아보며 각자 확인

설문에서 아픈 곳을 **무릎**으로 고르면 레그 프레스가 목록에서 빠지는 게 보이고,
3군데 이상 고르면 트레이너 상담 안내가 뜬다.

### 5) 단지를 새로 추가하려면

앱은 전국 공용 빌드 하나다. 단지가 늘어도 앱을 다시 빌드하지 않는다 — 태블릿이 최초
설정 때 "단지 등록 코드"를 입력해 자기 `apt_id` 를 받아 기기에 저장하고, 그 뒤로는 그
값으로 체크인한다. **주민이 어느 단지 사람인지는 이 값이 정한다.**

주민에게는 단지를 고르게 하지 않는다. 소속이 자기신고가 되면 아무 단지나 골라 남의
순위표에 낄 수 있다. 소속의 근거는 "그 태블릿 앞에 실제로 섰다"는 사실 하나뿐이다.

```sql
-- 1) 단지를 만든다. 등록 코드는 자동 생성된다(헷갈리는 I/L/O/0/1 을 뺀 6자리).
insert into public.apartments (name, address)
values ('○○아파트', '서울특별시 ...')
returning id, enroll_code;

-- 2) 관리자 PIN 을 정한다. 이걸 안 하면 태블릿이 "아직 관리자 PIN이 설정되지 않았습니다" 로 막힌다.
update public.apartments
set kiosk_pin_hash = crypt('원하는PIN', gen_salt('bf'))
where enroll_code = '위에서-나온-코드';

-- 3) 그 단지가 보유한 기구를 등록한다(apt_id 는 1)에서 나온 값).
--    운동 자체(이름·설명·영상)는 운동 도감(exercise_catalog)에 이미 있으므로
--    "어떤 운동의 기구가 몇 번 구역에 있는지"만 이으면 된다.
insert into public.equipments (apt_id, catalog_id, qr_code_val, location_label)
select '위 apt_id', c.id, 'APT123-CHEST-01', '13번 구역'
from public.exercise_catalog c where c.name = '체스트 프레스';
```

관리사무소에는 **등록 코드와 PIN 두 개**만 알려주면 된다. 태블릿에서 "헬스장 입구
태블릿" → 코드 → PIN 순으로 입력하면 설치가 끝난다.

코드는 공개돼도 되지만 PIN 은 관리사무소만 알아야 한다 — 둘을 모두 아는 사람은 그 단지의
태블릿을 자처할 수 있다. 코드 하나당 15분에 10회까지만 시도할 수 있고, 넘으면 잠긴다.

> 시범단지(`supabase/seed.sql`)는 코드 `TEST24` / PIN `1234` 로 고정돼 있다.
> **운영 단지에 이 PIN 을 그대로 쓰지 말 것.**
연령대를 **40대 이상**으로 고르면 목록 맨 뒤에 유산소(트레드밀)가 붙는다. 시작을 누르고
1~2분 뒤에 마치면 기록 화면에 그 시간이 미리 채워져 있고, 숫자판으로 고칠 수 있다.
마친 뒤 **분석** 탭에 "유산소 N분"이 잡히는지, **달력**에서 그날을 열었을 때 처방 시간이
아니라 실제로 한 시간이 보이는지 함께 확인한다.

## 3. 지금까지 만든 것

```
src/
├── app/
│   ├── _layout.tsx           기기 역할에 따라 세션 공급자를 나눠 씌우는 루트
│   ├── index.tsx              순수 디스패처(역할별로 리다이렉트만 함)
│   ├── device-setup.tsx       "이 기기는 무엇인가요?" (키오스크는 PIN 확인)
│   ├── login.tsx               카카오/구글/전화(QR) 로그인 + 근력운동 후킹 카피
│   ├── pair-scan.tsx           앱 안 QR 스캐너 + 수동 코드 입력
│   ├── pair/[code].tsx         시스템 카메라로 딥링크를 열었을 때
│   ├── consent.tsx             개인정보 수집·이용 동의(필수/선택, 민감정보 별도)
│   ├── legal/[doc].tsx         약관·개인정보처리방침 전문(앱 안에서 읽힌다)
│   ├── onboarding.tsx          신규 회원 프로필 설문 5문항 + 최종 확인
│   ├── kiosk/
│   │   ├── checkin.tsx         키오스크 체크인 화면(예전 index.tsx 키패드 재사용)
│   │   ├── pairing.tsx         QR 표시 + 페어링 상태 폴링
│   │   └── membership-prompt.tsx  "이 헬스장으로 옮기셨나요?"
│   └── (tabs)/                 개인 앱 하단 탭 5개
│       ├── workout/            오늘의 운동 목록 + 기구 상세(세트 진행, 유산소 시간 측정, 완료 저장)
│       ├── calendar/           출석 달력 + 하루 상세
│       ├── ranking/            같은 단지 랭킹
│       ├── analysis/           최근 vs 직전 기간 비교 + 칼로리 대략치 + 부위별 세트
│       └── profile/            닉네임/성별/연령대, 내 헬스장, 로그아웃
├── components/                keypad, primary-button, choice-button, routine-card,
│                               check-mark, tab-bar, calendar-grid, text-field, ...
├── constants/theme.ts         색·치수·자간 토큰 (토스식 시각 언어 + 시니어 치수)
├── features/
│   ├── auth/                   oauth, anonymous, auth-session(개인 앱), session(키오스크), kiosk-api
│   ├── device-role/            기기가 키오스크인지 개인 폰인지 기억
│   ├── pairing/                QR 페어링 API + 딥링크 payload
│   ├── gym-membership/         내 헬스장 목록 / 주 소속 전환
│   ├── onboarding/             문항 정의, profile_data 병합 저장
│   ├── routine/                루틴 생성/조회/완료, 세트 진행 상태 머신, 유산소 경과 시간
│   ├── calendar/, ranking/, analysis/    각 탭 API + 순수 계산 함수
│   ├── content/                근력운동 후킹 카피 12종, 완료 멘트, 시간대별 인사말
│   ├── legal/                  약관·개인정보처리방침 원문, 동의 항목, 동의 API
│   └── health/                 건강 앱 연동 자리(아직 인터페이스만)
└── lib/                        supabase 클라이언트, DB 타입, env, RPC 에러 처리
```

### 온보딩 설문 (5문항 + 최종 확인)

로그인 직후 개인 폰에서 받는다. AI 루틴 생성에 **반드시 필요한 값만** 받는다. 이름을
빼면 전부 큰 버튼 선택이라 자판을 쓸 일이 없다 — 이름만은 고를 수가 없어서 자판을
쓰지만, 카카오·구글로 들어오신 분은 이미 채워져 있어 그대로 넘기면 된다.

| # | 문항 | `profile_data` 키 | 선택 |
| --- | --- | --- | --- |
| 1 | 어떻게 불러 드릴까요 | `nickname` | 자유 입력(12자) |
| 2 | 성별 | `gender` | 단일 |
| 3 | 연령대(10대~70대 이상) | `age_group` | 단일 |
| 4 | 운동 목적 | `goals` | **다중** |
| 5 | 아프거나 불편한 곳 | `pain_areas` | **다중** (+ "없습니다") |
| 6 | 최종 확인 | — | 요약 확인 / 항목별 "고치기" |

**아픈 부위는 반드시 받는다.** 무릎·허리가 안 좋은 분께 그대로 무게를 잡아주면 부상으로
이어진다. `pain_areas` 는 `undefined`(아직 안 물어봄)와 `[]`("없다"고 답함)를 구분한다.

- 단일 선택 문항은 고르면 **바로 다음으로** 넘어간다. 다중 선택 문항만 "다음" 버튼이 있고,
  하나도 안 고르면 비활성이다
- 잘못 눌러도 마지막 **확인 화면**에서 항목별로 되돌릴 수 있다
- 중간 답도 그때그때 저장한다. 도중에 나가도 다음 방문 때 **남은 문항부터** 이어서 묻는다
- 설문 완료 여부는 `profile_data.onboarded_at` 으로 판단한다

### 개인정보 동의 — 문서 · 기록 · 화면

> ⚠️ **약관과 개인정보처리방침은 변호사 검토를 받지 않은 초안이다.** 실서비스 전에 반드시
> 법률 검토를 거쳐야 하고, `src/features/legal/company.ts` 의 `{{ }}` 자리(대표자·사업자
> 등록번호·개인정보 보호책임자 등 13개)를 실제 값으로 채워야 한다. 보호책임자와 연락처
> 공개는 개인정보 보호법상 의무라, 비워 둔 채로 열면 방침 자체가 요건 미달이다.

**문서만으로는 동의를 받은 게 아니다.** 개인정보 보호법은 동의를 받았다는 사실을
처리자가 입증하도록 하고 있어서, "누가 · 언제 · 어느 버전 문서에 · 어떤 항목을"이 남아야
한다. 그래서 세 덩어리로 만들었다.

| | 어디 | 무엇 |
| --- | --- | --- |
| 문서 | `src/features/legal/` | 이용약관 15개 조문, 개인정보처리방침 17개 항목 |
| 기록 | `user_consents` 테이블 | 동의·철회 이력. 추가만 하고 지우지 않는다 |
| 화면 | `src/app/consent.tsx`, `src/app/legal/[doc].tsx` | 항목별 동의, 전문 보기 |

**동의 항목은 넷이다.** 필수 셋(만 14세 이상 / 이용약관 / 개인정보 수집·이용)에 더해,
건강에 관한 정보를 **둘로 나눴다.**

- `health_records` (필수·민감) — 운동 수행 기록. 이게 없으면 앱이 아무것도 못 한다
- `pain_areas` (선택·민감) — 아프거나 불편한 곳. **없어도 서비스가 돌아간다** —
  `generate_daily_routine` 이 아픈 곳을 빈 값으로 두고도 루틴을 만든다. 없어도 되는 걸
  필수로 묶는 건 "필요 최소한" 원칙에 어긋나서 선택으로 뒀다

건강 정보(민감정보)는 다른 개인정보 동의와 한 덩어리로 받을 수 없어서 **별도 동의**로
분리했고, 화면에서도 면 색을 달리해 다른 항목에 묻어가지 않게 그렸다.

**동의를 안 하면 묻지도 않는다.** `pain_areas` 에 동의하지 않은 분께는 설문에서 그 문항을
아예 띄우지 않는다(`questionsFor`). 물어보고 저장만 안 하는 건 동의 없이 수집한 것과
다르지 않다 — 화면에 띄우는 순간 답을 하시게 된다.

**철회는 지우는 것까지다.** 방침에 "거두시면 바로 지웁니다"라고 적어 놓고 기록만 남기면
그 방침이 거짓말이 된다. `revoke_consent` 는 이력을 한 줄 쌓으면서 `profile_data` 에서
아픈 곳 값을 실제로 삭제한다. 필수 동의는 이 경로로 못 거둔다 — 그건 서비스를 안 쓰겠다는
뜻이라 탈퇴로 처리해야 하고, 철회 스위치로 조용히 넘기면 동의 없이 계정만 남는다.

**순서는 로그인 → 동의 → 설문이다.** 설문 마지막 문항이 아픈 곳이라 동의가 먼저여야 한다
(`(tabs)/_layout.tsx` 와 `onboarding.tsx` 양쪽에서 막는다).

**키오스크는 다르게 받는다.** 공용 태블릿 앞에 줄이 서 있는데 약관 전문을 스크롤하게 하는
건 현실적이지 않고, 받는 것도 전화번호 하나뿐이라 항목이 다르다. 수집 고지를 체크인 버튼
바로 위에 상시로 띄우고, 번호를 눌러 체크인한 사실을 그 항목에 대한 동의로 기록한다
(`record_kiosk_consent`, 같은 날 같은 버전은 한 줄만).

**문서를 고치면 버전을 올려야 한다.** `CONSENT_VERSION` 이 올라가면 기존 회원도 동의
화면을 한 번 더 본다. 안 올리면 옛 문서에 동의한 사람이 새 문서에 동의한 것처럼 기록에
남는다. 약관/방침 버전만 올리고 `CONSENT_VERSION` 을 안 올리면 앱이 시작할 때 바로
에러를 내도록 해 뒀다.

**홈페이지에 올릴 마크다운**은 여기서 뽑는다(정본은 언제나 `src/features/legal/`):

```bash
npm run legal:export     # docs/terms-of-service.md, docs/privacy-policy.md
```

### 이름 부르기와 후킹 카피

**이름.** 로그인하면 "○○ 님, 안녕하세요"로 시작한다. 이름은 두 경로로 들어온다.

- 카카오·구글: 로그인할 때 제공자가 표시 이름을 같이 준다. `bootstrap_oauth_profile`
  이 그걸 `profile_data.nickname` 에 채운다(이메일이 이름 자리에 오면 `@` 앞만, 12자가
  넘으면 잘라서). **이미 이름이 있으면 덮어쓰지 않는다** — 프로필 탭에서 직접 고친
  이름이 다음 로그인에 되돌아가면 안 된다
- 전화번호(QR 페어링): 제공자가 없으니 설문 1번에서 직접 받는다

이름이 비어 있어도 "회원 님"이라고 부르지 않는다. 그렇게 부르면 이름을 넣을 수 있다는
것 자체를 모른 채 계속 쓰게 된다 — 대신 인사말에서 이름을 빼고, 운동 탭에 "이름 등록하기"
버튼을 띄운다(설문이 생기기 전에 가입하신 분들을 위한 길이다).

인사말 뒷줄은 시간대(아침·낮·밤)와 방문 이력(첫 방문·두 번째·그 이후)에 따라 달라진다
(`src/features/content/greeting.ts`).

**후킹 카피.** 근력운동을 해야 하는 이유를 말하는 문구가 셋뿐이면 며칠 만에 외워져서
눈에 안 들어온다. 열두 개로 늘리고 화면을 열 때마다 무작위로 고른다
(`src/features/content/hooking-copy.ts`). 운동을 하나 마쳤을 때 띄우는 한마디도 여섯 개를
돌린다 — 완료 화면은 다시 오게 만들 수 있는 자리라 "저장되었습니다"로 끝내지 않는다.

> 화면 안에서 문구를 저절로 바꾸지는 않는다. 천천히 읽는 분이 많아서 읽는 도중에 글자가
> 바뀌면 처음부터 다시 읽어야 한다. 대신 앱을 열 때마다, 탭을 옮길 때마다 새로 고른다.

카피에는 **의학적으로 과장된 주장을 넣지 않는다.** 수명이 몇 년 늘어난다거나 병이
낫는다는 문장은 들어올 수 없다 — 상식 수준이면서 틀려도 사람이 다치지 않는 말만 쓴다.

### 분석 탭 — "내가 잘하고 있나"에 답한다

숫자만 있으면 그게 잘하는 건지 못하는 건지 알 수 없다. 3번이 많은 건지 적은 건지는
지난번의 나와 비교해야 나온다. 그래서 `get_progress_summary` 가 **최근 N일과 직전 같은
길이 기간을 나란히** 돌려준다. 화면 맨 위는 이 한 줄이다.

```
최근 7일 동안  3번 나오셨어요
지난 7일보다 1번 더 나오셨어요
2주 연속으로 나오고 계세요
```

- 기준은 **출석**이다. 완료 개수는 버튼만 눌러도 늘지만 출석은 키오스크 체크인이 있어야
  남는다(랭킹을 출석 기준으로 바꾼 것과 같은 이유). "이번 주 세 번 나오셨어요"가
  "3개 완료"보다 정직하고 더 잘 읽히기도 한다
- 연속은 **주 단위**로 센다. 헬스장은 매일 오는 곳이 아니라 "연속 며칠"은 거의 항상 1로
  떨어진다. 이번 주에 아직 안 나왔어도 주가 안 끝났으므로 끊긴 걸로 보지 않는다
- 문장은 나무라지 않는다. 적게 나온 주에 "줄었습니다"라고 쏘아붙이면 그 주에 앱을 안
  열게 된다 — 사실은 그대로 말하되 다음 행동을 붙인다(`src/features/analysis/progress.ts`)
- 칼로리는 헤드라인 자리에서 내렸다. 대략치라 판단 기준으로 쓸 수 없고, 시니어에게
  "180kcal"은 "세 번 나오셨어요"만큼 와닿지 않는다
- 이 칸만 실패하면 그 칸만 빠진다. 분석 탭 전체를 에러로 덮지 않는다

### 유산소 기록 — 앱이 재고, 사람이 고친다

40대 이상에게는 유산소가 자동으로 처방된다(`20260812000021_cardio_routine.sql`). 근력은
"세트 × 횟수"로 처방하고 완료 버튼을 누르면 처방한 만큼 했다고 보지만, 유산소에는 그
가정이 안 맞는다 — 15분 처방을 받고 8분만 걷다 내려오거나, 걷다 보니 25분을 하는 일이
흔하다. 전부 15분으로 적어 두면 분석 탭 숫자가 사실과 달라진다.

그래서 실제 수행 시간을 따로 받는다(`daily_routines.actual_duration_minutes`).

```
[시작] 누름 → 화면에 흐른 시간이 올라감(목표를 넘기면 "목표 15분을 채우셨습니다")
[다 했어요] 누름 → 잰 시간이 기록 화면에 미리 채워져 있음
              → 맞으면 그대로 [기록하고 마치기], 다르면 숫자판으로 고침
```

**왜 물어보기만 하지 않나.** "몇 분 하셨어요?"만 물으면 대개 화면에 적힌 처방 시간을
그대로 답한다(기억해서 답하는 게 아니라 보이는 숫자를 읽는 쪽에 가깝다). 앱이 재서
채워 두면 대부분 그대로 두면 되고, 틀렸을 때만 고치면 된다.

- 첫 숫자를 누르면 잰 값을 지우고 새로 받는다 — 뒤에 붙이면 8분이 "81분"이 된다
- 1~240분 밖이면 버튼이 잠긴다. `complete_routine` 도 같은 범위를 다시 확인해
  `INVALID_DURATION` 으로 막는다(잘못 눌린 세 자리가 분석 집계를 통째로 망가뜨린다)
- 시간을 안 주고 완료하면 `actual_duration_minutes` 는 **null 로 남는다**. 처방값을
  실제값 자리에 베껴 넣으면 "모른다"와 "처방대로 했다"를 구분할 수 없게 된다
- 분석 탭은 유산소를 근력과 섞지 않는다. 유산소 행은 형식상 1세트로 들어가 있어서
  근력 세트 합계에 더하면 "총 세트"가 부풀고 부위별 막대에 '유산소 1세트' 같은 줄이
  생긴다. 근력은 세트로, 유산소는 분으로 따로 센다(`get_workout_summary`)
- 칼로리도 둘을 나눠 계산해 더한다 — 근력은 MET 5.0(세트 수로 시간 어림), 유산소는
  MET 4.0 × 실제 수행 분(`src/features/analysis/calorie.ts`)

**아직 못 하는 것.** 재는 값은 [시작]과 [다 했어요] 사이의 시계 시간이지 실제로 벨트
위에서 움직인 시간이 아니다. 완료를 늦게 누르면 그만큼 길게 잡히고, 그걸 검증할 방법은
지금 없다(사람이 고칠 수 있게 열어 둔 이유다). 웨어러블 연동이 붙으면 그때 실측으로
바꿀 수 있다 — 아래 "다음 단계" 4번.

### 디자인 방향 — 토스식 시각 언어 + 시니어 치수

시각 언어는 토스를 기준으로 잡았다.

- **선을 긋지 않는다.** 테두리 대신 회색 면(`#F2F4F6`)과 여백으로 영역을 나눈다
- **색은 파랑 하나만.** `#3182F6` 이 화면에서 유일한 유채색이고, 나머지는 파랑 쪽으로
  살짝 기울인 회색 계열이다
- **주 버튼은 화면 아래 고정.** 스크롤과 무관하게 늘 같은 자리에 있어 손이 기억한다
- **한글 자간을 좁힌다.** 큰 글씨일수록 더(-1.0 ~ -0.3), 안 그러면 덩어리로 안 읽힌다
- **이모지와 기호 글리프를 쓰지 않는다.** 체크 표시는 `CheckMark` 컴포넌트에서 도형으로
  직접 그린다. 하단 탭도 아이콘 없이 글자 + 작은 알약 인디케이터로 그렸다(`tab-bar.tsx`).
  달력도 외부 라이브러리 대신 직접 그렸다(`calendar-grid.tsx`) — 라이브러리를 쓰면 이
  원칙을 못 맞춘다

다만 **치수는 토스보다 크다.** 토스는 앉아서 폰을 보는 사람 기준이고, 우리는 헬스장 벽의
태블릿을 서서 조작하는 4060 시니어가 기준이다.

- 터치 타깃 최소 88pt (WCAG 권장 44pt의 2배), 하단 주 버튼 68pt, 폰 탭바 64pt
- 본문 20pt / 목록 제목 24pt / 화면 제목 34pt / 키패드 숫자 40pt
- 본문 대비 7:1 이상(AAA), 다크모드 없이 밝은 화면 고정
- 화살표(←) 대신 "지우기", "전체 지움" 처럼 글자로 표기
- 가로 900pt 이상이면 안내/키패드 2단 배치, 좁으면 1단으로 자동 전환

> shadcn/ui 는 Radix(DOM) 기반이라 React Native 에서 못 쓴다. 그래서 라이브러리를 얹는
> 대신 토큰(`src/constants/theme.ts`)으로 디자인 언어를 직접 잡았다.

### 공용 기기(키오스크) 대응

- 모든 요청에 **15초 타임아웃**을 건다. supabase-js 는 기본 타임아웃이 없어서 헬스장
  Wi-Fi 가 끊기면 화면이 로딩 상태로 영원히 멈춘다 — 줄 서 있는 태블릿에서 가장 나쁜 실패다
- 키오스크는 Supabase Auth 세션을 아예 만들지 않는다 — `kiosk_check_in` 은 anon 키로
  부르는 RPC 일 뿐이다. 개인 세션이 기기에 눌러앉을 위험이 구조적으로 없다
- 체크인 화면 자체엔 5분 idle 타임아웃이 있던 옛 설계가 남아 있지 않다 — "로그인 상태"
  라는 개념 자체가 키오스크엔 없어졌다(체크인 결과는 몇 초만 보여주고 저절로 지워진다)
- 스택 뒤로가기 제스처 차단(앞사람 화면으로 못 돌아가게), 키오스크로 기기를 바꾸는 건
  PIN으로 보호

### 개인 앱(Supabase Auth) 세션

- `persistSession: true` — 앱을 껐다 켜도 로그인이 유지된다. idle 타임아웃 없음(개인 기기라서)
- 정적 웹 내보내기(prerender)는 Node 에서 돌아 `window` 가 없다. `src/lib/supabase.ts` 의
  스토리지 어댑터가 "웹이면서 window 가 없는" 그 경우만 no-op 으로 바꿔치기한다 — 네이티브는
  원래 window 가 없어도 브릿지로 동작하니 건드리지 않는다
- PKCE 플로우로 카카오/구글 OAuth 를 처리한다 — 인가 코드를 앱이 직접 교환하는 방식이라
  리다이렉트 URL 에 토큰이 그대로 노출되는 implicit flow보다 안전하다

## 3.5 실제 Supabase 에 SQL 적용하기 (자동화)

대시보드 SQL Editor 에 붙여넣을 필요 없이 한 줄로 적용한다:

```bash
npm run db:check   # 연결 확인
npm run db:push    # supabase/setup.sql 전체 적용 (몇 번 실행해도 안전)
node scripts/apply-sql.mjs supabase/migrations/xxx.sql   # 파일 하나만
```

인증은 환경변수 `SUPABASE_ACCESS_TOKEN`(Supabase 개인 액세스 토큰, `sbp_` 로 시작)
하나면 된다. 프로젝트는 `.env` 의 `EXPO_PUBLIC_SUPABASE_URL` 로 알아낸다.

- Claude Code(웹) 세션에서 쓰려면: 환경(Environment) 설정 → Environment variables 에
  `SUPABASE_ACCESS_TOKEN` 을 넣어두면 모든 새 세션이 자동으로 쓸 수 있다.
- 로컬에서 쓰려면: `.env` 에 `SUPABASE_ACCESS_TOKEN=sbp_...` 한 줄 추가.

⚠️ 이 저장소는 **공개**다. 이 토큰은 Supabase 계정 전체를 다룰 수 있으므로 절대
커밋하면 안 된다(`.env` 는 gitignore 되어 있다). 토큰 발급:
https://supabase.com/dashboard/account/tokens

## 4. 로컬에서 DB 테스트하기

Supabase 프로젝트 없이도 마이그레이션과 RPC 를 검증할 수 있다. `auth.users` 를 참조하는
마이그레이션(006번부터)이 있으므로 최소한의 `auth` 스키마 스텁이 필요하다.

```bash
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -o "-p 5433 -k /tmp" start
psql -h /tmp -p 5433 -U postgres -c "create database fitroutine"
psql -h /tmp -p 5433 -U postgres -d fitroutine -c "create role anon; create role authenticated;"
psql -h /tmp -p 5433 -U postgres -d fitroutine -c "
  create schema auth;
  -- raw_user_meta_data 는 bootstrap_oauth_profile 이 카카오/구글 이름을 꺼내는 칸이다.
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as
    \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
"
for f in supabase/migrations/*.sql; do
  psql -h /tmp -p 5433 -U postgres -d fitroutine -v ON_ERROR_STOP=1 -f "$f"
done
psql -h /tmp -p 5433 -U postgres -d fitroutine -f supabase/seed.sql
```

`anon` / `authenticated` 는 Supabase 가 만들어 주는 역할이고, `auth.uid()` 는 Supabase
GoTrue 가 실제로는 JWT 클레임에서 읽어 오는 함수라 로컬에서는 위처럼 스텁을 직접 만들어야
한다. `authenticated` 컨텍스트를 흉내 내려면 다음처럼 세션 변수를 설정한다:

```sql
select set_config('request.jwt.claim.sub', '<auth.users 의 id>', false);
```

## 5. 로그인 수단 켜기 (대시보드 작업)

코드는 다 들어가 있고, 남은 건 대시보드 설정뿐이다. 안 켜면 앱에서 눌러도 실패한다.

### 5-1. 카카오 (무료, 먼저 하는 걸 권함)

1. [developers.kakao.com](https://developers.kakao.com) → 애플리케이션 추가
2. 카카오 로그인 활성화 → Redirect URI 에 아래 주소 등록
   ```
   https://<프로젝트ref>.supabase.co/auth/v1/callback
   ```
3. Supabase 대시보드 → Authentication → Sign In / Providers → Kakao 켜고
   REST API 키와 Client Secret 입력

한 번 연결해 두면 폰을 바꾸거나 앱을 지워도 계정을 잃지 않는다. QR 재연결이 필요 없다.

### 5-2. 전화번호 SMS 인증 (솔라피)

Supabase 가 기본 제공하는 SMS 업체는 Twilio / MessageBird / Vonage / TextLocal 뿐이라
솔라피는 목록에 없다. 대신 **Send SMS Hook** 으로 붙인다 — OTP 생성·검증은 Supabase 가
그대로 하고, "문자 보내는 순간"만 우리 함수로 가로채 솔라피로 넘긴다.
구현체는 `supabase/functions/send-sms/` 에 있다.

1. 솔라피에서 **발신번호를 사전 등록**한다. 국내법상 등록되지 않은 번호로는 못 보낸다
2. Edge Function 배포
   ```bash
   npx supabase functions deploy send-sms --no-verify-jwt
   ```
   `--no-verify-jwt` 가 필요하다 — 이 함수는 사용자가 아니라 Supabase Auth 가 부르므로
   사용자 JWT 가 없다. 대신 훅 서명으로 검증한다(함수 안에서 처리)
3. 시크릿 넣기 (**코드나 .env 에 적어 커밋하지 말 것**)
   ```bash
   npx supabase secrets set SOLAPI_API_KEY=... SOLAPI_API_SECRET=... SOLAPI_SENDER=029302266
   ```
4. Supabase 대시보드 → Authentication → Hooks → **Send SMS Hook** 켜고 위 함수 선택.
   거기서 발급되는 서명 키(`v1,whsec_...`)를 시크릿으로 추가
   ```bash
   npx supabase secrets set SEND_SMS_HOOK_SECRET='v1,whsec_...'
   ```
5. Authentication → Sign In / Providers → **Phone** 활성화

함수 테스트는 실제 발송 없이 돌아간다(fetch 를 가로채 인증 헤더·본문만 검증):
```bash
deno test --allow-env --allow-net supabase/functions/send-sms/
```

Phone 을 안 켠 상태에서 앱이 인증번호를 요청하면 "문자 인증이 아직 준비되지 않았습니다"
가 뜬다 — 조용히 실패하지 않는다.

## 6. 다음 단계

1. **카카오 전화번호 스코프** — 사업자등록 + 카카오 심사를 받으면, 카카오 로그인만으로
   전화번호까지 자동으로 받아 QR 페어링 없이도 매핑이 끝난다. `oauth.ts` 에 훅 지점만
   남겨 뒀다
3. **기구 QR 로그인 전 딥링크 이어가기** — 시스템 카메라로 기구 QR(`fitroutine://equip/<code>`)을
   찍었는데 로그인이 안 되어 있으면 지금은 그냥 로그인 화면으로 보낸다(`src/app/equip/[qr].tsx`).
   로그인을 마친 뒤 원래 찍었던 QR 로 자동으로 돌아가는 기능은 없다 — 로그인된 상태에서
   앱 안 스캐너(운동 탭 → "기구 QR 찍기")로 찍으면 바로 되니 급하지 않다고 보고 미뤘다
4. **걸음수 · 건강 앱 연동** — `src/features/health/` 에 인터페이스만 만들어 뒀고 실제
   연동은 안 했다. 붙이는 방법이 두 갈래인데, 어느 쪽을 고르느냐에 따라 테스트 방법이
   달라져서 정한 뒤에 손대야 한다.

   - **expo-sensors 의 Pedometer** — Expo Go 에 이미 들어 있어 빌드 없이 바로 된다.
     다만 `getStepCountAsync`(기간 걸음수)는 **iOS 전용**이고, 안드로이드에서는
     "not supported on Android yet" 을 돌려준다. 안드로이드는 `watchStepCount` 로
     앱이 켜져 있는 동안만 셀 수 있어서 "오늘 걸음수"가 안 나온다
   - **HealthKit + Health Connect** — 아이폰·갤럭시 양쪽에서 진짜 "건강 앱" 값을 읽는
     방법이다. `react-native-health` / `react-native-health-connect` 설치 + `app.json`
     config plugin + 네이티브 빌드가 필요하고, **Expo Go 로는 테스트가 안 된다**(개발
     빌드 필수). 이 저장소를 만든 개발 환경은 네이티브 빌드를 실행/검증할 수 없어서
     실제 패키지를 넣지 않았다 — 잘못 붙이면 다음 실제 빌드에서야 설정 실수가 드러난다

   `provider.ts` 상단 주석에 붙이는 순서를 적어 뒀다. 어느 쪽을 고르든 화면은 이
   인터페이스만 보고 있어서 그대로 두면 된다.
5. **운동 시연 영상/이미지** — 지금 기구별 안내는 트레이너가 채우는 텍스트 설명
   (`equipments.description`)과 링크로 여는 외부 영상(`video_url`)뿐이다. 경쟁 앱처럼
   앱 안에서 바로 재생되는 아바타 애니메이션/움짤 시연은 만들지 않았다 — AI 생성
   운동 자세 영상은 틀린 자세를 안내할 위험이 있어 이 저장소에서 직접 만들지 않기로
   했고, 실사 촬영이 필요하다(운영진 결정 사항)
6. 트레이너 검수 후 `goal_blocks` / `pain_area_rules` / `age_modifiers` 수치 조정
