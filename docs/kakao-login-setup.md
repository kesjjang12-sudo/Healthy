# 카카오 로그인 연결 절차

앱 코드는 이미 다 되어 있다(`src/features/auth/oauth.ts`). 남은 일은 **카카오
콘솔**과 **Supabase 대시보드** 설정뿐이고, 둘 다 로그인이 필요해 사람이 직접
해야 한다. 아래 값을 그대로 복사해 쓰면 된다.

## 지금 상태 (2026-08-18 확인)

`GET /auth/v1/settings` 로 확인한 서버의 실제 상태:

| 제공자 | 상태 |
|---|---|
| 문자(phone OTP) | ✅ 켜짐 |
| 익명(테스트 계정) | ✅ 켜짐 |
| 카카오 | ❌ **꺼짐** |
| 구글 | ❌ **꺼짐** |

즉 지금 카카오·구글 버튼을 누르면 실패한다. 아래를 마치면 그때부터 동작한다
(앱 재배포 불필요 — 서버 설정만으로 켜진다).

## 1. 카카오 콘솔에서 앱 만들기

<https://developers.kakao.com> → 내 애플리케이션 → 애플리케이션 추가하기

- 앱 이름: 핏루틴
- 회사명: (사업자명 또는 개인)
- 카테고리: 건강

## 2. REST API 키와 Client Secret 받기

- **앱 설정 → 앱 키**: `REST API 키` 를 복사해 둔다 → Supabase 의 `client_id`
- **제품 설정 → 카카오 로그인 → 보안**: `Client Secret` 을 **생성하고 활성화** →
  Supabase 의 `client_secret`

## 3. Redirect URI 등록 (가장 자주 틀리는 곳)

**제품 설정 → 카카오 로그인 → Redirect URI** 에 아래를 **그대로** 넣는다.

```
https://hhjmhdxcxjuhhhgjsilu.supabase.co/auth/v1/callback
```

우리 앱의 딥링크(`fitroutine://auth-callback`)가 아니라 **Supabase 주소**다.
카카오는 Supabase 로 보내고, Supabase 가 앱으로 되돌린다.

## 4. 카카오 로그인 활성화 + 동의항목

- **제품 설정 → 카카오 로그인 → 활성화 설정**: 상태 **ON**
- **제품 설정 → 카카오 로그인 → 동의항목**:
  - `프로필 정보(닉네임/프로필 사진)` — 필수 동의
  - `카카오계정(이메일)` — **켜지 말 것.** 이유는 아래.

### ⚠️ 이메일을 받으면 "비즈앱 전환 + 사업자등록"이 필요해진다

`account_email` 동의항목은 **비즈앱으로 전환한 앱만** 쓸 수 있고, 비즈앱 전환에는
사업자등록번호가 필요하다. 우리 앱은 이메일이 필요 없다 — 회원 식별은 전화번호
(키오스크)와 인증 신원으로 하고, 이메일을 쓰는 기능이 하나도 없다.

**이메일을 안 받으면 심사·사업자등록 없이 바로 출시할 수 있다.** 대신 Supabase
카카오 설정에서 **"Allow users without an email"** 을 켜야 한다(안 켜면 이메일이
없는 카카오 계정에서 로그인이 실패한다).

## 5. Supabase 에 키 넣기

대시보드 → Authentication → Sign In / Providers → **Kakao**

- Enabled: **ON**
- Client ID: 2번의 `REST API 키`
- Client Secret: 2번의 `Client Secret`
- **Allow users without an email: ON** (4번 참고)

## 6. 확인

설정 직후 아래로 서버 상태를 다시 확인할 수 있다. `kakao: true` 가 되면 끝이다.

```bash
curl -s "https://hhjmhdxcxjuhhhgjsilu.supabase.co/auth/v1/settings" \
  -H "apikey: <EXPO_PUBLIC_SUPABASE_ANON_KEY>" | python3 -m json.tool | grep -A1 kakao
```

그다음 앱에서 카카오 버튼을 눌러 실제로 로그인해 본다. 지금은 실패하면
"카카오 로그인이 아직 준비되지 않았습니다" 라고 뜨므로, 설정이 안 먹었는지
다른 문제인지 화면에서 바로 구분된다.

## 심사에 대해

- **카카오 로그인 자체는 심사가 없다.** 기본 동의항목(닉네임·프로필 사진)만
  쓰면 앱을 만들자마자 일반 사용자도 쓸 수 있다.
- 심사·비즈앱이 필요한 것은 **이메일·전화번호·성별·연령대·생일** 같은 추가
  동의항목이다. 우리는 안 쓴다.
- 다만 카카오 콘솔의 **팀원이 아닌 사용자**에게 열려면 앱 상태가 정상이어야
  하므로, 4번의 활성화 설정을 반드시 ON 으로 둘 것.

## 버튼 디자인 규정 (심사에서 본다)

공식 가이드(<https://developers.kakao.com/docs/ko/kakaologin/design-guide>) 기준으로
코드에 이미 반영해 뒀다.

| 항목 | 규정 | 우리 코드 |
|---|---|---|
| 배경색 | `#FEE500` | ✅ |
| 심벌 색 | `#000000` (불투명) | ✅ |
| 글자 색 | `#000000` 85% | ✅ |
| 문구 | "카카오 로그인" 또는 "로그인" | ✅ "카카오 로그인" |
| 심벌 생략 | 불가 | ✅ 항상 표시 |

**남은 하나**: 지금 말풍선 심벌은 가이드 수치에 맞춰 그린 것이고 **공식 배포
파일은 아니다.** 가이드는 심벌의 형태·비율 변경을 금지하므로, 출시 전에
<https://developers.kakao.com/tool/resource/login> 에서 공식 리소스(PNG/PSD)를
내려받아 `assets/` 에 넣고 `src/components/social-button.tsx` 의 카카오
`<Svg>` 를 `<Image>` 로 바꾸는 것을 권한다. (그 페이지는 카카오 로그인이 있어야
열려서 내가 대신 받을 수 없었다.)

## 구글도 같이 켜려면

절차가 거의 같다. Google Cloud Console → OAuth 클라이언트(웹) 를 만들고,
승인된 리디렉션 URI 에 위와 **똑같은 Supabase 콜백 주소**를 넣은 뒤, 클라이언트
ID/Secret 을 Supabase 의 Google 제공자에 넣으면 된다. 구글 버튼 문구는
워드마크 규정상 "Google로 로그인"(음차 금지)로 이미 맞춰 뒀다.
