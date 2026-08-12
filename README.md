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

### RLS 방침

헬스장 태블릿은 공용 기기라 개인의 Supabase Auth 세션을 들고 있을 수 없고 anon 키만 갖는다.
그래서 `users` / `daily_routines` / `attendance_logs` 에는 **anon 정책을 아예 두지 않아
deny-by-default** 로 막고, 접근은 `security definer` 함수(RPC)로만 열었다.
`apartments` 와 `equipments` 만 읽기 공개다.

| RPC | 하는 일 |
| --- | --- |
| `sign_in_with_phone(p_apt_id, p_phone_number)` | 번호 정규화·검증 → find-or-create → 하루 1회 출석 기록 |
| `update_profile_data(p_user_id, p_patch)` | `profile_data` 를 덮어쓰지 않고 `||` 로 병합 |

> ⚠️ **보안 메모**: 지금 인증은 "전화번호만 알면 로그인"이다. 남의 번호를 눌러 넣으면
> 그 사람 계정으로 들어가진다. 실서비스 전에 생년(4자리) 확인 같은 2차 확인을 하나 더
> 붙이는 걸 권한다. RPC 시그니처만 늘리면 되도록 설계해 뒀다.

### 적용 방법

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # migrations 적용
psql "$DATABASE_URL" -f supabase/seed.sql   # 개발용 시드(선택)
```

## 2. 앱 실행

```bash
npm install
cp .env.example .env      # Supabase URL / anon key / 단지 id 입력
npm start                 # 태블릿에서 Expo Go 로 접속
```

`.env` 값은 `EXPO_PUBLIC_` 접두사라 번들에 그대로 박힌다. **service_role key 는 절대 넣지 말 것.**

## 3. 지금까지 만든 것

```
src/
├── app/
│   ├── _layout.tsx        SessionProvider + Stack (뒤로가기 제스처 차단)
│   ├── index.tsx          번호 입력(인증) 화면
│   ├── onboarding.tsx     신규 회원 프로필 설문 3문항
│   └── home.tsx           로그인 직후 화면 (자리만 잡아둠)
├── components/            keypad, primary-button, choice-button
├── constants/theme.ts     시니어용 디자인 토큰
├── features/auth/         phone(포맷·검증), api(RPC 호출), session(컨텍스트)
├── features/onboarding/   questions(문항 정의), api(profile_data 병합 저장)
└── lib/                   supabase 클라이언트, DB 타입, env, RPC 에러 처리
```

### 기기 역할 분담

**입구 태블릿 1대 + 각자 폰으로 기구 QR 스캔** 구조를 전제로 만들었다.

| | 태블릿 (공용, 입구) | 폰 앱 (개인) |
| --- | --- | --- |
| 하는 일 | 번호 인증, 출석, 온보딩 설문 | 기구 QR 스캔, 영상, 기록·포인트 조회 |
| 설계 제약 | 뒤에 줄이 선다 / 이웃이 화면을 본다 | 개인 기기라 제약 없음 |

### 온보딩이 3문항인 이유

태블릿이 입구에 한 대뿐이라 신규 회원 설문이 길면 그대로 줄이 된다. 그래서 AI 루틴
생성에 **반드시 필요한 값만** 태블릿에서 받는다 — 성별 / 연령대 / 운동 목적. 전부 큰
버튼 선택이고 자판 입력이 없어서 탭 3번이면 끝난다.

키·몸무게·부상 부위는 태블릿에서 **묻지 않는다.** 시간 문제도 있지만, 아파트 헬스장은
이웃이 뒤에서 화면을 보는 곳이라 몸무게를 공용 화면에 띄우면 안 된다. 이 값들은 폰 앱이나
운동 종료 화면에서 한 문항씩 받는다(점진적 프로필링).

- 선택하면 바로 다음 문항으로 넘어간다 ("다음" 버튼을 없애 탭 수를 절반으로)
- 중간 답도 그때그때 저장한다. 도중에 나가도 다음 방문 때 **남은 문항부터** 이어서 묻는다
- 설문 완료 여부는 `profile_data.onboarded_at` 으로 판단한다 (`is_new_user` 가 아니라)

### 번호 입력 화면 설계 기준

4060 시니어가 헬스장 벽의 태블릿을 **서서** 조작한다는 전제로 잡았다.

- 터치 타깃 최소 88pt (WCAG 권장의 2배), 키패드 키는 화면 폭의 1/3
- 본문 22pt / 키패드 숫자 44pt / 입력된 번호 56pt, 굵기 600 이상
- 명도 대비 7:1 이상(AAA), 다크모드 없이 밝은 화면 고정
- 화살표(←) 대신 "지우기", "전체 지움" 처럼 글자로 표기
- 에러는 빨간 테두리 + 한 줄 문구 ("전화번호를 다시 확인해 주세요")
- 가로 900pt 이상이면 안내/키패드 2단 배치, 좁으면 1단으로 자동 전환

### 공용 기기 대응

- Supabase Auth 세션을 기기에 저장하지 않는다 (`persistSession: false`)
- 5분간 조작이 없으면 자동 로그아웃 → 번호 입력 화면으로 복귀
- 앱이 죽었다 살아나면 5분 이내에 한해 세션 복원 (운동 중 강제 로그아웃 방지)
- 스택 뒤로가기 제스처 차단 (앞사람 화면으로 못 돌아가게)

## 4. 다음 단계

1. AI 루틴 생성 (`profile_data` 기반) → `daily_routines` 적재
2. 오늘의 루틴 화면 (태블릿에서 확인 → 폰으로 이어보기)
3. 폰 앱: QR 스캔 → `equipments.qr_code_val` 조회 → 시범 영상 재생
4. 운동 완료 처리 → 포인트 적립
5. 키·몸무게·부상 부위를 운동 종료 화면에서 한 문항씩 받기
