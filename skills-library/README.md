# skills-library — 로컬 Claude Code 에 한 번에 넣는 스킬 모음

이 폴더는 **켜져 있는 스킬이 아니다.** 저장소에서 자동으로 붙는 스킬은
`.claude/skills/` 에 있는 22개(superpowers·frontend-design·ponytail)뿐이다.
여기 있는 것들은 클라우드 세션 환경에서 가져온 것 중 **자유 배포가 허용된
것(Apache-2.0 / MIT)** 만 모아 둔 보관함이다. 로컬에서 쓰려면 아래 스크립트로
복사한다.

## 로컬 설치 (컴퓨터 터미널)

```bash
git clone https://github.com/kesjjang12-sudo/Healthy.git
cd Healthy
bash scripts/install-skills.sh          # ~/.claude/skills 에 전부 복사
```

또는 압축본 하나만 받기: 저장소의 `skills-library.zip` 을 받아 풀고
`~/.claude/skills/` 안에 폴더째 넣으면 된다.

## 들어 있는 것 (30개)

| 출처 | 스킬 | 용도 |
| --- | --- | --- |
| Anthropic (Apache) | frontend-design, canvas-design, algorithmic-art, brand-guidelines, theme-factory, web-artifacts-builder, slack-gif-creator, paint | 디자인·시각물 |
| Anthropic (Apache) | skill-creator, mcp-builder, claude-api, webapp-testing, internal-comms, doc-coauthoring, academy-guide, discernment-nudge, learn | 개발·문서 |
| Anthropic Cowork 예제 (Apache) | call-to-book, cancel-unsubscribe, event-planning, file-expenses, file-form, financial-calculator, grocery-shopping, hire-help, meal-delivery, prescription-refill, return-refund, benepass-reimbursement | 브라우저로 생활 업무 대행 (컴퓨터 사용 기능 필요) |
| Panniantong (MIT) | agent-reach | 웹페이지·RSS·유튜브 자막 읽기. `pipx install git+https://github.com/Panniantong/agent-reach.git` 도 같이 필요 |

## 여기 넣지 않은 것과 이유

- **docx / pdf / pptx / xlsx (문서 스킬)**: Anthropic 독점 라이선스라 복제·재배포가
  금지돼 있다. 대신 공개 저장소에서 직접 받으면 된다 (설치 스크립트가 해 준다):
  `npx skills add anthropics/skills -s docx -s pdf -s pptx -s xlsx`
- **file-reading, pdf-reading, computer-use, chrome-browser, built-in-browser,
  artifact-emulator, product-self-knowledge**: 같은 이유(독점) + 클라우드 전용.
- **docs, morning, google-workspace, import-memory, setup-writing-style,
  deep-research**: 라이선스 표기가 없고 claude.ai 커넥터가 있어야 돌아가서 로컬에선
  의미가 없다.
- **graphify, headroom, OmniRoute**: 스킬이 아니라 프로그램. 각자 저장소 참고.
