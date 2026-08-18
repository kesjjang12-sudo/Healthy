#!/usr/bin/env bash
# 헬스반장 앱 아이콘 생성 — 3D 덤벨(Three.js)을 헤드리스 크롬으로 찍는다.
#
# 준비물 (한 번만):
#   npm install --no-save three@0.170.0     # package.json 은 건드리지 않는다
#   크롬/크로미움 경로를 CHROME 환경변수로 (기본값은 Claude 클라우드 환경 경로)
#
# 실행:  bash scripts/icons/make-icons.sh
# 결과:  assets/images/* 와 public/* 아이콘 전부 교체
#
# 모양을 고치려면 scene.html(3D 장면)과 flat.html(파비콘·흑백용 평면)을 수정.
# 안전 규칙: 안드로이드 적응형 앞면(frac=0.62)은 가운데 66% 원 안에 들어가야
# 갤럭시 원형 마스킹에서 안 잘린다.
set -euo pipefail
cd "$(dirname "$0")"
C="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
F="--headless=new --no-sandbox --disable-gpu --enable-unsafe-swiftshader
   --allow-file-access-from-files --hide-scrollbars --force-device-scale-factor=1
   --default-background-color=00000000 --virtual-time-budget=15000"
U="file://$PWD/scene.html"
FL="file://$PWD/flat.html"

shot() { # shot <url> <크기> <출력>
  local pad=$(( $2 + 100 ))
  $C $F --window-size=$pad,$pad --screenshot="$3" "$1" 2>/dev/null
  node crop.mjs "$3" "$2"
}

shot "$U?size=1024&variant=sky"                1024 ../../assets/images/icon.png
shot "$U?size=512&variant=sky&obj=0"            512 ../../assets/images/android-icon-background.png
shot "$U?size=512&variant=sky&bg=0&frac=0.62"   512 ../../assets/images/android-icon-foreground.png
shot "$U?size=512&variant=sky&bg=0&frac=0.8"    512 ../../assets/images/splash-icon.png
shot "$U?size=512&variant=sky"                  512 ../../public/pwa-icon-512.png
shot "$U?size=192&variant=sky"                  192 ../../public/pwa-icon-192.png
shot "$U?size=180&variant=sky"                  180 ../../public/apple-touch-icon.png
shot "$FL?size=432&frac=0.62"                   432 ../../assets/images/android-icon-monochrome.png
shot "$FL?size=48&bg=1&frac=0.8"                 48 ../../assets/images/favicon.png
echo "완료 — assets/images/ 와 public/ 아이콘을 전부 다시 만들었다."
