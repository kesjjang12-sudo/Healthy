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
| `equipments` | 기구와 시범 영상. `qr_code_val` 로 QR 스캔 시 조회 |
| `daily_routines` | 유저별 하루 루틴. `actual_weight_kg`/`actual_reps`/`points_awarded` 는 완료 시 채워짐 |
| `attendance_logs` | 출석 기록. `apt_id` 로 그날 어느 헬스장이었는지도 남긴다 |
| `kiosk_enroll_attempts` | 단지 등록 실패 기록. PIN 무차별 대입을 막는 용도로만 쓰고 성공하면 지워진다 |

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
pain_area_rules 적용 → apt_id 의 보유 기구로 치환 → daily_routines
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
| `update_profile_data(p_user_id, p_patch)` | 양쪽 | `profile_data` 를 `||` 로 병합 |
| `generate_daily_routine(p_user_id, p_date?, p_apt_id?)` | 개인 앱 | 하루 루틴 생성 |
| `get_daily_routine(p_user_id, p_date?)` | 개인 앱 | 해당 날짜 루틴 조회 |
| `get_todays_checkin(p_user_id)` | 개인 앱 | 오늘 체크인한 헬스장(없으면 주 소속) |
| `complete_routine(p_routine_id, p_actual_weight_kg?, p_actual_reps?)` | 개인 앱 | 완료 처리 + 포인트 지급(1건당 10점, 재완료는 중복 지급 안 함) |
| `get_attendance_days(p_user_id, p_month)` | 개인 앱 | 달력 탭 — 그 달 출석일 |
| `get_workout_summary(p_user_id, p_from, p_to)` | 개인 앱 | 분석 탭 원시 집계(칼로리 계산은 클라이언트가 함) |
| `get_visit_stats(p_user_id)` | 개인 앱 | 운동 탭 "DAY_N" 배지용 평생 출석일 수 |
| `get_apartment_leaderboard(p_apt_id, p_limit?)` | 개인 앱 | 지금 그 단지를 다니는 사람만의 출석 랭킹(떠난 사람 제외). 닉네임/출석횟수만, PII 없음 |

## 2. 실기기(태블릿 + 휴대폰)로 테스트하기

### 1) Supabase 프로젝트 준비

가장 빠른 길은 **`supabase/setup.sql` 전체를 대시보드 SQL Editor 에 붙여넣고 Run** 하는
것이다. 모든 마이그레이션과 시드를 순서대로 합쳐 둔 파일이고, 전부 idempotent 라 여러 번
실행해도 안전하다.

CLI 로 관리하려면 이쪽이 낫다 (마이그레이션 이력이 남는다):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push                        # migrations 적용
psql "$DATABASE_URL" -f supabase/seed.sql   # 시범단지 + 기구 5대
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
4. 페어링이 끝나면 설문 4문항 → 최종 확인 → **오늘의 운동** 으로 이동
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

-- 3) 그 단지의 기구를 등록한다(apt_id 는 1)에서 나온 값).
insert into public.equipments (apt_id, qr_code_val, name, ...) values ...;
```

관리사무소에는 **등록 코드와 PIN 두 개**만 알려주면 된다. 태블릿에서 "헬스장 입구
태블릿" → 코드 → PIN 순으로 입력하면 설치가 끝난다.

코드는 공개돼도 되지만 PIN 은 관리사무소만 알아야 한다 — 둘을 모두 아는 사람은 그 단지의
태블릿을 자처할 수 있다. 코드 하나당 15분에 10회까지만 시도할 수 있고, 넘으면 잠긴다.

> 시범단지(`supabase/seed.sql`)는 코드 `TEST24` / PIN `1234` 로 고정돼 있다.
> **운영 단지에 이 PIN 을 그대로 쓰지 말 것.**

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
│   ├── onboarding.tsx          신규 회원 프로필 설문 4문항 + 최종 확인
│   ├── kiosk/
│   │   ├── checkin.tsx         키오스크 체크인 화면(예전 index.tsx 키패드 재사용)
│   │   ├── pairing.tsx         QR 표시 + 페어링 상태 폴링
│   │   └── membership-prompt.tsx  "이 헬스장으로 옮기셨나요?"
│   └── (tabs)/                 개인 앱 하단 탭 5개
│       ├── workout/            오늘의 운동 목록 + 기구 상세(세트 진행, 완료 저장)
│       ├── calendar/           출석 달력 + 하루 상세
│       ├── ranking/            같은 단지 랭킹
│       ├── analysis/           칼로리 대략치 + 부위별 세트
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
│   ├── routine/                루틴 생성/조회/완료, 세트 진행 상태 머신
│   ├── calendar/, ranking/, analysis/    각 탭 API + 순수 계산 함수
│   └── content/hooking-copy.ts  근력운동 후킹 카피
└── lib/                        supabase 클라이언트, DB 타입, env, RPC 에러 처리
```

### 온보딩 설문 (4문항 + 최종 확인)

로그인 직후 개인 폰에서 받는다. AI 루틴 생성에 **반드시 필요한 값만** 받는다. 전부 큰
버튼 선택이고 자판 입력이 없다.

| # | 문항 | `profile_data` 키 | 선택 |
| --- | --- | --- | --- |
| 1 | 성별 | `gender` | 단일 |
| 2 | 연령대(10대~70대 이상) | `age_group` | 단일 |
| 3 | 운동 목적 | `goals` | **다중** |
| 4 | 아프거나 불편한 곳 | `pain_areas` | **다중** (+ "없습니다") |
| 5 | 최종 확인 | — | 요약 확인 / 항목별 "고치기" |

**아픈 부위는 반드시 받는다.** 무릎·허리가 안 좋은 분께 그대로 무게를 잡아주면 부상으로
이어진다. `pain_areas` 는 `undefined`(아직 안 물어봄)와 `[]`("없다"고 답함)를 구분한다.

- 단일 선택 문항은 고르면 **바로 다음으로** 넘어간다. 다중 선택 문항만 "다음" 버튼이 있고,
  하나도 안 고르면 비활성이다
- 잘못 눌러도 마지막 **확인 화면**에서 항목별로 되돌릴 수 있다
- 중간 답도 그때그때 저장한다. 도중에 나가도 다음 방문 때 **남은 문항부터** 이어서 묻는다
- 설문 완료 여부는 `profile_data.onboarded_at` 으로 판단한다

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
  create table auth.users (id uuid primary key default gen_random_uuid());
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

## 5. 다음 단계

1. **실제 SMS 인증** — 전화번호 로그인은 지금 QR 페어링(물리적 근접)으로 신원을 대신
   확인한다. Twilio 등으로 실제 SMS OTP 를 붙이면 폰 소유 증명이 완성된다
2. **카카오 전화번호 스코프** — 사업자등록 + 카카오 심사를 받으면, 카카오 로그인만으로
   전화번호까지 자동으로 받아 QR 페어링 없이도 매핑이 끝난다. `oauth.ts` 에 훅 지점만
   남겨 뒀다
3. **유산소 실제 수행 기록** — `generate_daily_routine` 은 40대 이상에게 유산소(트레드밀
   등)를 자동으로 처방하고 분(`target_duration_minutes`)으로 안내한다(운동 탭 →
   기구 화면). 다만 "실제로 몇 분 했는지"는 아직 안 받는다 — 완료 버튼을 누르면
   처방 시간을 그대로 수행한 것으로 기록한다(근력운동의 "처방 횟수 = 실제 수행"과 같은
   가정). 분석 탭도 아직 유산소 시간을 따로 집계하지 않는다 — 근력운동 완료 기록만 본다
4. **기구 QR 로그인 전 딥링크 이어가기** — 시스템 카메라로 기구 QR(`fitroutine://equip/<code>`)을
   찍었는데 로그인이 안 되어 있으면 지금은 그냥 로그인 화면으로 보낸다(`src/app/equip/[qr].tsx`).
   로그인을 마친 뒤 원래 찍었던 QR 로 자동으로 돌아가는 기능은 없다 — 로그인된 상태에서
   앱 안 스캐너(운동 탭 → "기구 QR 찍기")로 찍으면 바로 되니 급하지 않다고 보고 미뤘다
5. **웨어러블/폰 건강 앱 연동** — `src/features/health/` 에 인터페이스만 만들어 뒀고 실제
   HealthKit/Health Connect 연동은 안 했다. 네이티브 모듈(`react-native-health`,
   `react-native-health-connect`) 설치 + `app.json` config plugin 추가 + 네이티브 빌드가
   필요한데, 이 저장소를 만든 개발 환경은 네이티브 빌드를 실행/검증할 수 없어서 실제
   패키지를 넣지 않았다 — 잘못 붙이면 다음 실제 빌드에서야 설정 실수가 드러난다.
   `provider.ts` 상단 주석에 붙이는 순서를 적어 뒀다
6. **운동 시연 영상/이미지** — 지금 기구별 안내는 트레이너가 채우는 텍스트 설명
   (`equipments.description`)과 링크로 여는 외부 영상(`video_url`)뿐이다. 경쟁 앱처럼
   앱 안에서 바로 재생되는 아바타 애니메이션/움짤 시연은 만들지 않았다 — AI 생성
   운동 자세 영상은 틀린 자세를 안내할 위험이 있어 이 저장소에서 직접 만들지 않기로
   했고, 실사 촬영이 필요하다(운영진 결정 사항)
7. 트레이너 검수 후 `goal_blocks` / `pain_area_rules` / `age_modifiers` 수치 조정
