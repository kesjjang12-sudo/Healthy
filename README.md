# 핏루틴 (FitRoutine)

4060 시니어를 위한 아파트 헬스장 B2B AI 코칭 플랫폼.

- **프론트엔드**: React Native (Expo SDK 57, expo-router)
- **백엔드 / DB**: Supabase (PostgreSQL)

## 1. DB 구조 — 하이브리드 아키텍처

인증·포인트처럼 정합성이 중요한 고정 데이터는 **일반 컬럼**, 신체 정보나 운동 목적처럼
기획에 따라 자주 바뀌는 데이터는 **`users.profile_data` (JSONB)** 로 나눴다.

| 테이블 | 역할 |
| --- | --- |
| `apartments` | 아파트 단지. 모든 데이터의 멀티테넌시 기준축 |
| `users` | 유저. 고정 컬럼(`phone_number`, `total_points`, `role`) + 가변 `profile_data` |
| `equipments` | 기구와 시범 영상. `qr_code_val` 로 QR 스캔 시 조회 |
| `daily_routines` | 유저별 하루 루틴 (기구 × 무게 × 세트 × 횟수) |
| `attendance_logs` | 출석 기록 |

마이그레이션은 `supabase/migrations/` 에 있다.

- `20260812000001_init_schema.sql` — 테이블, 제약, 인덱스
  - `profile_data` 는 GIN 인덱스(`jsonb_path_ops`)를 걸어 `@>` 포함 질의가 인덱스를 타게 했다.
  - `daily_routines (user_id, equip_id, routine_date)` 유니크 — AI 루틴 생성이 중복 실행돼도 행이 안 불어난다.
- `20260812000002_rls_and_auth.sql` — RLS 정책과 인증 RPC
- `20260812000003_routine_templates.sql` — 루틴 템플릿 조합 + 아픈 곳 규칙
- `20260812000004_generate_daily_routine.sql` — 루틴 생성/조회 RPC

### 루틴 생성: 런타임 AI 호출 없음

**모든 경우의 수를 미리 조합해 둔다.** 시니어 대상이라 매번 다른 결과가 나오면 안전
검수가 불가능하고, 태블릿 앞에서 AI 응답을 기다리는 시간이 그대로 줄이 된다. API 키
노출·지연·건당 비용도 전부 없어진다.

커버리지는 **성별 2 × 연령대 4 × 목적 조합 15 × 아픈 곳 조합 64 = 7,680 가지**다.
저장은 앞의 셋만 조합한 **120개 템플릿**으로 두고, 아픈 곳은 조합이 아니라 후처리
규칙으로 적용한다. 커버리지는 같으면서 사람이 검수할 수 있는 분량이 된다 — 트레이너가
120개는 볼 수 있어도 7,680개는 못 본다.

```
goal_blocks     목적별 기본 처방 (부위·세트·횟수·무게비율)
age_modifiers   연령대 보정 (70대는 무게 0.65배, 세트 -1)
gender_modifiers 성별 보정
      ↓ rebuild_routine_templates()
routine_templates + routine_template_items   ← 120개 조합 (504개 항목)
      ↓ generate_daily_routine(user_id)
pain_area_rules 적용 → 단지 보유 기구로 치환 → daily_routines
```

규칙 테이블만 고치고 `rebuild_routine_templates()` 를 다시 돌리면 120개가 재생성된다.

**안전 장치**

- 무게는 기구 조절 단위로 **내림**한다. 반올림하면 의도보다 무거워지는데, 시니어에게는
  가벼운 쪽이 틀리는 방향으로 안전하다
- 프로필이 비어 있으면 가장 보수적인 값(여성·70대·건강유지)으로 떨어진다
- 아픈 곳은 `exclude`(운동 자체를 뺌) / `derate`(무게만 낮춤) 두 가지로 적용한다
- 아픈 곳이 3군데 이상이거나 남는 운동이 없으면 `needs_trainer_review` 를 세워 사람에게 넘긴다
- 1세트짜리 처방이 나오지 않도록 최소 2세트를 보장한다

> ⚠️ 여기 담긴 무게·세트·횟수는 **의료 조언이 아니다.** 실서비스 전에 트레이너 또는
> 물리치료사 검수를 반드시 거쳐야 한다. 특히 `pain_area_rules` 가 안전 장치다.

### RLS 방침

헬스장 태블릿은 공용 기기라 개인의 Supabase Auth 세션을 들고 있을 수 없고 anon 키만 갖는다.
그래서 `users` / `daily_routines` / `attendance_logs` 에는 **anon 정책을 아예 두지 않아
deny-by-default** 로 막고, 접근은 `security definer` 함수(RPC)로만 열었다.
`apartments` 와 `equipments` 만 읽기 공개다.

| RPC | 하는 일 |
| --- | --- |
| `sign_in_with_phone(p_apt_id, p_phone_number)` | 번호 정규화·검증 → find-or-create → 하루 1회 출석 기록 |
| `update_profile_data(p_user_id, p_patch)` | `profile_data` 를 덮어쓰지 않고 `||` 로 병합 |
| `generate_daily_routine(p_user_id, p_date)` | 템플릿 + 아픈 곳 규칙 + 단지 기구로 하루 루틴 생성 |
| `get_daily_routine(p_user_id, p_date)` | 해당 날짜 루틴을 기구 정보와 함께 조회 |

> ⚠️ **보안 메모**: 지금 인증은 "전화번호만 알면 로그인"이다. 남의 번호를 눌러 넣으면
> 그 사람 계정으로 들어가진다. 실서비스 전에 생년(4자리) 확인 같은 2차 확인을 하나 더
> 붙이는 걸 권한다. RPC 시그니처만 늘리면 되도록 설계해 뒀다.

## 2. 실기기(태블릿 + 휴대폰)로 테스트하기

### 1) Supabase 프로젝트 준비

가장 빠른 길은 **`supabase/setup.sql` 전체를 대시보드 SQL Editor 에 붙여넣고 Run** 하는
것이다. 마이그레이션 4개와 시드를 순서대로 합쳐 둔 파일이고, 전부 idempotent 라 여러 번
실행해도 안전하다.

CLI 로 관리하려면 이쪽이 낫다 (마이그레이션 이력이 남는다):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push                        # migrations 적용
psql "$DATABASE_URL" -f supabase/seed.sql   # 시범단지 + 기구 5대
```

### 2) `.env` 작성

```bash
npm install
cp .env.example .env
```

`Project Settings → API` 에서 **Project URL** 과 **anon public** 키를 복사해 넣는다.
`EXPO_PUBLIC_FITROUTINE_APT_ID` 는 `select id from apartments;` 로 확인한다 (시드를 그대로
썼다면 `.env.example` 의 값이 맞다).

`.env` 값은 `EXPO_PUBLIC_` 접두사라 번들에 그대로 박힌다. **service_role key 는 절대 넣지 말 것.**
값이 비어 있으면 앱이 빨간 에러 대신 "설정이 필요합니다" 안내 화면을 띄운다.

### 3) 기기에서 실행 — 두 가지 방법

기기에 설치할 "핏루틴 앱"은 아직 없다. 방법은 둘 중 하나다.

#### 방법 A. Expo Go (개발 중 권장)

**Expo Go** 가 그 앱 역할을 한다. 스토어에서 받아 설치하고, PC 에서 띄운 개발 서버에
붙이면 우리 코드가 그 안에서 돈다. 코드를 고치면 즉시 반영된다.

```bash
git clone <this-repo> && cd Healthy
npm install
npx expo start -c          # -c 는 캐시 초기화. .env 를 바꾼 뒤에는 꼭 필요하다
```

태블릿·휴대폰에 Expo Go 를 설치하고 터미널에 뜬 QR 을 찍는다.
Expo SDK 57 이라 Expo Go 도 최신 버전이어야 한다.

#### 방법 B. EAS Build (설치형 앱)

PC 없이 기기만으로 돌리거나 단지에 데모할 때는 실제 설치 파일을 만든다.

```bash
npx eas login
npx eas build --profile preview --platform android   # 설치용 .apk
```

빌드가 끝나면 링크로 APK 를 받아 태블릿·폰에 설치한다. 그 뒤로는 PC 도, 같은 Wi-Fi 도
필요 없다. iOS 는 Apple 개발자 계정과 TestFlight 가 필요해서 안드로이드보다 번거롭다.

`EXPO_PUBLIC_*` 값은 **빌드 시점에 번들로 구워진다.** 그래서 `eas.json` 의 각 프로필에
값을 넣어 두었고, 별도 설정 없이 위 명령만으로 동작하는 APK 가 나온다. 어차피 APK 안에
들어가는 값들이라 anon key 를 여기 두는 것과 앱을 배포하는 것의 노출 범위가 같다. 그래도
저장소에서 빼고 싶으면 `eas.json` 의 `env` 를 지우고 EAS 대시보드 환경변수로 옮기면 된다.

### 네트워크: 같은 Wi-Fi 는 개발할 때만이다

방법 A 에서 같은 Wi-Fi 가 필요한 이유는 **PC 의 개발 서버에서 자바스크립트를 내려받기
때문**이다. 기기가 PC 의 사설 IP 에 닿아야 해서 같은 랜이어야 한다. 회사망처럼 기기 간
통신이 막힌 곳이면 `npx expo start --tunnel` 로 우회한다.

**실제 환경에는 이 제약이 없다.** 설치형 앱에는 자바스크립트가 이미 들어 있어서 개발
서버가 아예 없고, 기기는 Supabase 만 인터넷으로 부른다. 태블릿은 헬스장 Wi-Fi, 입주민
폰은 LTE 여도 아무 문제 없다.

| | 개발 (Expo Go) | 실제 (설치형 앱) |
| --- | --- | --- |
| 자바스크립트 | PC 개발 서버에서 받음 | 앱 안에 포함 |
| PC 와 같은 망 | 필요 (또는 `--tunnel`) | 불필요 |
| 기기 ↔ Supabase | 인터넷 | 인터넷 |

### 4) 확인할 흐름

태블릿과 휴대폰을 **같은 번호로** 붙이면 두 기기를 한 번에 확인할 수 있다.

1. **태블릿**: 번호 입력 (`010`으로 시작하는 아무 번호) → 설문 4문항 → 최종 확인
2. **휴대폰**: 같은 번호를 입력하면 설문을 건너뛰고 **오늘의 운동** 으로 바로 간다

설문에서 아픈 곳을 **무릎**으로 고르면 레그 프레스가 목록에서 빠지는 게 보이고,
3군데 이상 고르면 트레이너 상담 안내가 뜬다.

5분간 아무것도 누르지 않으면 자동 로그아웃되어 번호 입력 화면으로 돌아간다.
공용 태블릿용 동작이라 테스트 중에도 그대로 걸린다.

기구 QR 스캔은 아직 없어서 다음 단계다.

## 3. 지금까지 만든 것

```
src/
├── app/
│   ├── _layout.tsx        SessionProvider + Stack (뒤로가기 제스처 차단)
│   ├── index.tsx          번호 입력(인증) 화면
│   ├── onboarding.tsx     신규 회원 프로필 설문 4문항 + 최종 확인
│   └── home.tsx           오늘의 운동 목록
├── components/            keypad, primary-button, choice-button, routine-card, check-mark
├── constants/theme.ts     색·치수·자간 토큰 (토스식 시각 언어 + 시니어 치수)
├── features/auth/         phone(포맷·검증), api(RPC 호출), session(컨텍스트)
├── features/onboarding/   questions(문항 정의), api(profile_data 병합 저장)
├── features/routine/      api(루틴 생성/조회), use-daily-routine(훅)
└── lib/                   supabase 클라이언트, DB 타입, env, RPC 에러 처리
```

### 기기 역할 분담

**입구 태블릿 1대 + 각자 폰 앱** 구조다.

| | 태블릿 (공용, 입구) | 폰 앱 (개인) |
| --- | --- | --- |
| 하는 일 | 번호 인증, 출석, 온보딩 설문, 오늘 루틴 요약 | 루틴 상세, 기구 QR 스캔, 영상, 걷기 랭킹, 포인트 |
| 설계 제약 | 뒤에 줄이 선다 / 이웃이 화면을 본다 | 개인 기기라 제약 없음 |

웹 링크가 아니라 **앱 설치를 유도한다.** 설치 마찰은 감수하고, 단지 걷기 랭킹·상품권 같은
훅으로 넘긴다. 걷기 집계는 폰 센서가 필요해서 웹으로는 만들 수 없으니, 앱이 존재해야 할
이유가 그 기능 자체에서 나온다.

### 온보딩 설문 (4문항 + 최종 확인)

태블릿이 입구에 한 대뿐이라 설문이 길면 그대로 줄이 된다. 그래서 AI 루틴 생성에
**반드시 필요한 값만** 태블릿에서 받는다. 전부 큰 버튼 선택이고 자판 입력이 없다.

| # | 문항 | `profile_data` 키 | 선택 |
| --- | --- | --- | --- |
| 1 | 성별 | `gender` | 단일 |
| 2 | 연령대 | `age_group` | 단일 |
| 3 | 운동 목적 | `goals` | **다중** |
| 4 | 아프거나 불편한 곳 | `pain_areas` | **다중** (+ "없습니다") |
| 5 | 최종 확인 | — | 요약 확인 / 항목별 "고치기" |

**아픈 부위는 반드시 받는다.** 무릎·허리가 안 좋은 분께 그대로 무게를 잡아주면 부상으로
이어진다. 루틴 생성 시 해당 부위 관련 기구의 무게를 낮추거나 동작을 빼는 데 쓴다.
`pain_areas` 는 `undefined`(아직 안 물어봄)와 `[]`("없다"고 답함)를 구분한다.

**키·몸무게는 태블릿에서 묻지 않는다.** 아파트 헬스장은 이웃이 뒤에서 화면을 보는 곳이라
몸무게를 공용 화면에 띄우면 안 된다. 이 값들은 폰 앱이나 운동 종료 화면에서 받는다.

- 단일 선택 문항은 고르면 **바로 다음으로** 넘어간다 ("다음" 버튼을 없애 탭 수 절반).
  다중 선택 문항만 "다음" 버튼이 있고, 하나도 안 고르면 비활성이다
- 잘못 눌러도 마지막 **확인 화면**에서 항목별로 되돌릴 수 있다
- 중간 답도 그때그때 저장한다. 도중에 나가도 다음 방문 때 **남은 문항부터** 이어서 묻는다
- 설문 완료 여부는 `profile_data.onboarded_at` 으로 판단한다 (`is_new_user` 가 아니라)

### 디자인 방향 — 토스식 시각 언어 + 시니어 치수

시각 언어는 토스를 기준으로 잡았다.

- **선을 긋지 않는다.** 테두리 대신 회색 면(`#F2F4F6`)과 여백으로 영역을 나눈다
- **색은 파랑 하나만.** `#3182F6` 이 화면에서 유일한 유채색이고, 나머지는 파랑 쪽으로
  살짝 기울인 회색 계열이다
- **주 버튼은 화면 아래 고정.** 스크롤과 무관하게 늘 같은 자리에 있어 손이 기억한다
- **한글 자간을 좁힌다.** 큰 글씨일수록 더(-1.0 ~ -0.3), 안 그러면 덩어리로 안 읽힌다
- **이모지와 기호 글리프를 쓰지 않는다.** 체크 표시는 `CheckMark` 컴포넌트에서 도형으로
  직접 그린다 — 글리프는 기기 폰트마다 모양이 다르고, 이모지는 화면 톤을 흐트러뜨린다

다만 **치수는 토스보다 크다.** 토스는 앉아서 폰을 보는 사람 기준이고, 우리는 헬스장 벽의
태블릿을 서서 조작하는 4060 시니어가 기준이다.

- 터치 타깃 최소 88pt (WCAG 권장 44pt의 2배), 하단 주 버튼 68pt
- 본문 20pt / 목록 제목 24pt / 화면 제목 34pt / 키패드 숫자 40pt
- 본문 대비 7:1 이상(AAA), 다크모드 없이 밝은 화면 고정
- 화살표(←) 대신 "지우기", "전체 지움" 처럼 글자로 표기
- 번호 입력은 안 누른 자리를 옅게 깔아 둬서 몇 자리 남았는지 보이게 한다
- 가로 900pt 이상이면 안내/키패드 2단 배치, 좁으면 1단으로 자동 전환

> shadcn/ui 는 Radix(DOM) 기반이라 React Native 에서 못 쓴다. RN 대응물인
> react-native-reusables 는 NativeWind 5 preview 가 필요해 SDK 57 에서는 아직 이르고,
> 무엇보다 shadcn 기본 치수(버튼 36px, 본문 14px)는 우리 사용자와 정반대다. 그래서
> 라이브러리를 얹는 대신 토큰(`src/constants/theme.ts`)으로 디자인 언어를 직접 잡았다.

### 공용 기기 대응

- 모든 요청에 **15초 타임아웃**을 건다. supabase-js 는 기본 타임아웃이 없어서 헬스장
  Wi-Fi 가 끊기면 화면이 로딩 상태로 영원히 멈춘다 — 줄 서 있는 태블릿에서 가장 나쁜 실패다
- Supabase Auth 세션을 기기에 저장하지 않는다 (`persistSession: false`)
- 5분간 조작이 없으면 자동 로그아웃 → 번호 입력 화면으로 복귀
- 앱이 죽었다 살아나면 5분 이내에 한해 세션 복원 (운동 중 강제 로그아웃 방지)
- 스택 뒤로가기 제스처 차단 (앞사람 화면으로 못 돌아가게)

## 4. 로컬에서 DB 테스트하기

Supabase 프로젝트 없이도 마이그레이션과 RPC 를 검증할 수 있다.

```bash
initdb -D ~/pgdata -U postgres --auth=trust
pg_ctl -D ~/pgdata -o "-p 5433 -k /tmp" start
psql -h /tmp -p 5433 -U postgres -c "create database fitroutine"
psql -h /tmp -p 5433 -U postgres -d fitroutine -c "create role anon; create role authenticated;"
for f in supabase/migrations/*.sql; do
  psql -h /tmp -p 5433 -U postgres -d fitroutine -v ON_ERROR_STOP=1 -f "$f"
done
psql -h /tmp -p 5433 -U postgres -d fitroutine -f supabase/seed.sql
```

`anon` / `authenticated` 는 Supabase 가 만들어 주는 역할이라 로컬에서는 직접 만들어야 한다.

## 5. 다음 단계

1. **QR 스캔 → 기구 목표 + 시범 영상** — 기구 앞에서 폰으로 찍는 화면
2. **앱 설치 유도 훅** — 단지 걷기 랭킹 / 상품권·쿠폰. 걷기는 폰 센서가 필요해서
   웹으로는 못 만든다. 앱이 존재해야 할 실질적인 이유가 여기서 나온다
3. 운동 완료 처리 → 포인트 적립
5. 키·몸무게를 운동 종료 화면에서 한 문항씩 받기 (점진적 프로필링)
6. 트레이너 검수 후 `goal_blocks` / `pain_area_rules` 수치 조정
