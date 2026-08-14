# CLAUDE.md — 세션 간 협업 규칙

여러 Claude 세션이 이 저장소를 동시에 고친다. 2026-08-13 에 실제로 사고가
날 뻔했다 — 한 세션이 자기 브랜치만 보고 gh-pages 를 배포하기 직전이었는데,
그랬으면 다른 세션들이 만든 기구 사용법 모아보기·닉네임 정책·계정번호가
라이브에서 통째로 사라졌다. 그래서 규칙을 둔다. 어떤 세션이든 예외 없다.

## 기준 브랜치: main

- **main = 마지막으로 배포된 코드.** gh-pages 에 올라간 번들의 소스가 main 이다.
- 새 작업은 `origin/main` 에서 브랜치를 딴다.
- 작업 브랜치가 오래됐으면 배포 전에 `origin/main` 을 병합한다(rebase 말고
  merge — 다른 세션이 그 브랜치를 참조하고 있을 수 있다).

## gh-pages 배포 절차

1. `git fetch origin` — 반드시 먼저. 로컬 원격 참조는 세션 시작 시점에 멈춰 있다.
2. `origin/main` 이 내 HEAD 에 포함되는지 확인:
   `git merge-base --is-ancestor origin/main HEAD` — 아니면 **병합부터** 한다.
3. typecheck(`npx tsc --noEmit`) + `npx expo export --platform web` 빌드.
4. gh-pages 푸시가 **거부되면 절대 force 하지 않는다.** 그 사이 다른 세션이
   배포한 것이다. fetch 하고, 그쪽 소스 브랜치를 내 브랜치에 병합한 뒤
   다시 빌드해서 올린다. (거부는 오류가 아니라 충돌 감지 장치다.)
5. 배포에 성공하면 **배포한 트리를 main 으로도 푸시한다**
   (`git push origin HEAD:main`). 이걸 빼먹으면 main 이 라이브와 어긋나서
   다음 세션이 낡은 기준에서 시작한다.

## 병합 판단

- 커밋 수로 판단하지 마라. 세션들이 같은 작업을 다른 SHA 로 다시 커밋한
  경우가 실제로 있다(같은 메시지, 다른 해시). **내용 diff 로 확인한다**:
  `git diff HEAD...origin/<branch> --stat`
- 충돌 해결은 그 브랜치를 만든 세션의 몫이다. 남의 브랜치를 대신 병합하다
  판단을 잘못하면 조용히 기능이 사라진다. 자기 작업이 main 에 들어가길
  원하는 세션이 스스로 main 을 병합하고 배포한다.

## DB (Supabase)

- DB 는 하나뿐이고 **라이브다**. 마이그레이션 파일을 저장소에 두는 것과
  별개로, 서버에는 이미 적용된 상태가 진실이다. 스키마 작업 전에 Supabase
  MCP 로 실제 상태를 먼저 확인한다 (`list_tables`, pg_proc 조회).
- 서버 함수가 이 저장소 파일보다 새 버전일 수 있다(다른 세션이 올렸다).
  `create or replace` 로 덮기 전에 `pg_get_functiondef` 로 현재 정의를 읽는다.
- `nickname` 은 랭킹에 노출되는 값이라 실명을 넣으면 안 된다. 실명은
  `profile_data.real_name`. `update_profile_data` 는 nickname 키를 떼고
  저장한다(닉네임은 update_nickname RPC 전용 — 비속어 필터·2주 제한).

## 마이그레이션 체인 (2026-08-14 복구됨)

`toss-app-ui-ux-design-zikopg` 를 병합하면서 `20260812000026_exercise_catalog`
(테이블을 만드는 파일)가 main 에 들어왔다. 이제 참조하는 파일들(`...000007`
~`...000010`, `...000029`~`...000032`)보다 번호가 앞서서 빈 DB 에 처음부터
돌려도 통과한다. 예전에 적혀 있던 "체인이 끊겨 있다" 경고는 해소됐다.

## ⚠️ 같은 함수를 두 갈래가 각자 고치면 조용히 기능이 사라진다

실제로 났던 사고다. `20260813000010_expose_image_url` 이 응답에 `image_url` 을
넣었는데, 나중에 적용된 `20260814000029_how_to_steps` 가 같은 함수를 통째로
다시 쓰면서 그 줄을 빠뜨렸다. 컬럼도 데이터도(75개 전부) 멀쩡하고 앱 코드도
사진을 그리고 있었는데 서버가 값을 안 보내서 **화면에서만 사진이 사라졌다.**
없는 키를 읽으면 undefined 라 오류가 안 나서 한참 뒤에야 발견됐다.
`20260814000032_restore_image_url` 로 되돌렸다.

교훈: `create or replace` 로 함수를 다시 쓸 때는 **반드시 `pg_get_functiondef`
로 서버의 현재 정의부터 읽고** 거기에 얹을 것. 저장소의 옛 파일을 출발점으로
삼으면 그 사이 다른 세션이 넣은 필드가 통째로 날아간다.

## 마이그레이션 번호는 먼저 확인하고 붙인다

세션 둘이 같은 날 `...000009` 를 각각 만들어 충돌한 적이 있다. 파일을 만들기 전에
`git fetch origin && ls supabase/migrations/` 로 origin/main 의 마지막 번호를
확인하고, 충돌하면 **내 것을 뒤로 민다**(남의 것이 이미 서버에 올라갔을 수 있다).

## 남은 미병합 브랜치 (2026-08-14 기준)

아래 브랜치의 세션들은 각자 `origin/main` 을 병합하고 위 절차로 배포할 것.
**toss 가 main 에 들어가면서 UI 전체(theme.ts, 모든 화면, app-text/ListRow/Icon
도입)가 바뀌었다** — 아래 브랜치들은 병합 전에 diff 를 다시 볼 것:

- `claude/healthy-conversation-bkg4p8` — 동의 문서화, 유산소 실측, 인사말.
  ⚠️ 마이그레이션 번호 3개가 main 과 충돌한다(`...000024`, `...000025`,
  `...000026` 가 각각 다른 내용으로 이미 존재). 병합 시 뒤로 밀 것.
- `claude/npm-db-check-c0k38z` — 이사 랭킹, 태블릿 단지 기억
- `claude/sms-function-deploy-secrets-ju9gqa` — 솔라피 OTP (main 의
  phone-login 과 같은 화면을 고쳤다 — 충돌 주의)
- `claude/aws-server-automation-4iw38d` — AWS Terraform. Supabase 를 쓰는데 왜
  필요한지 저장소에 설명이 없다. 방향부터 정할 것.

이미 main 에 다 들어간 브랜치(지워도 된다):
`claude/fitroutine-db-schema-epbb3p`, `claude/github-friend-invite-wrmsh4`,
`claude/toss-app-ui-ux-design-zikopg`

## 배포 경로가 둘이다 (2026-08-14부터 CI 가 자동으로 한다)

- **gh-pages** = PWA(웹)
- **EAS Update** = 태블릿·폰에 설치된 앱. `app.json` 의 `updates.url` 로 받는다.

앱의 자동 업데이트는 **받는 쪽만 자동**이다. 올리는 쪽(`eas update`)은 누가
돌려야 하는데 그동안 아무도 안 돌려서 설치형 앱이 오래 멈춰 있었다.

이제 `.github/workflows/deploy.yml` 이 **main 에 푸시되면 둘 다 배포한다.**
그러니 웬만하면 손으로 배포하지 말고 main 에 푸시만 할 것 — 위의 gh-pages 수동
절차는 CI 가 멈췄을 때의 대비책으로 남겨 둔다.

CI 가 앱 업데이트까지 하려면 저장소 시크릿 `EXPO_TOKEN` 이 있어야 한다.
없으면 웹만 나가고 경고만 남긴다(빌드는 실패하지 않는다).
