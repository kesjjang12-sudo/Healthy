#!/bin/bash
# 로컬 Claude Code 에 이 저장소의 스킬을 전부 설치한다.
#   - .claude/skills/ (superpowers, frontend-design, ponytail)  → ~/.claude/skills/
#   - skills-library/ (Anthropic Apache 예제 + agent-reach)      → ~/.claude/skills/
#   - docx/pdf/pptx/xlsx 는 라이선스상 저장소에 못 넣어 공개 저장소에서 직접 받는다.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/.claude/skills}"
mkdir -p "$DEST"

n=0
for src in "$ROOT/.claude/skills" "$ROOT/skills-library"; do
  for d in "$src"/*/; do
    [ -f "$d/SKILL.md" ] || continue
    name=$(basename "$d")
    rm -rf "$DEST/$name"
    cp -r "$d" "$DEST/$name"
    n=$((n+1))
  done
done
echo "복사 완료: $n 개 → $DEST"

if command -v npx >/dev/null 2>&1; then
  echo "문서 스킬(docx/pdf/pptx/xlsx) 은 anthropics/skills 에서 직접 받습니다..."
  npx -y skills@latest add anthropics/skills -g -a claude-code \
    -s docx -s pdf -s pptx -s xlsx --copy -y || echo "(문서 스킬 설치 실패 — 나중에 수동으로: npx skills add anthropics/skills)"
fi

if ! command -v agent-reach >/dev/null 2>&1; then
  echo "agent-reach 프로그램은 따로 필요합니다:"
  echo "  pipx install git+https://github.com/Panniantong/agent-reach.git"
fi
echo "끝. Claude Code 를 다시 열면 /skills 로 확인할 수 있습니다."
