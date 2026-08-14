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

## ⚠️ main 의 마이그레이션 체인이 지금 끊겨 있다 (2026-08-13)

`20260813000008_catalog_lookup` / `000009_catalog_expansion_images` /
`000010_expose_image_url` 가 `public.exercise_catalog` 를 참조하는데, 그 테이블을
**만드는 마이그레이션이 main 에 없다**. 만드는 쪽은 미병합 브랜치
`claude/toss-app-ui-ux-design-zikopg`("운동 도감을 분리한다")에 있다.

라이브 DB 는 이미 그 테이블을 갖고 있어서 운영은 멀쩡하지만, 빈 DB 에
마이그레이션을 처음부터 돌리면 저 셋이 실패한다. toss-app-ui 브랜치를 병합할 때
순서를 바로잡을 것.

## 마이그레이션 번호는 먼저 확인하고 붙인다

세션 둘이 같은 날 `...000009` 를 각각 만들어 충돌한 적이 있다. 파일을 만들기 전에
`git fetch origin && ls supabase/migrations/` 로 origin/main 의 마지막 번호를
확인하고, 충돌하면 **내 것을 뒤로 민다**(남의 것이 이미 서버에 올라갔을 수 있다).

## 남은 미병합 브랜치 (2026-08-13 기준)

아래 브랜치의 세션들은 각자 `origin/main` 을 병합하고 위 절차로 배포할 것:

- `claude/healthy-conversation-bkg4p8` — 동의 문서화, 유산소 실측, 인사말
- `claude/npm-db-check-c0k38z` — 이사 랭킹, 태블릿 단지 기억 (main 에 같은
  이름의 커밋이 이미 있다 — 내용 diff 로 겹침부터 확인할 것)
- `claude/sms-function-deploy-secrets-ju9gqa` — 솔라피 Edge Function 배포분
  (main 의 phone-login 가입 폼과 같은 화면을 고쳤다 — 충돌 주의)
- `claude/toss-app-ui-ux-design-zikopg` — 토스식 UI, 운동 도감 분리
