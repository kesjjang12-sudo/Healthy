import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import appConfig from '../../app.json';

/**
 * GitHub Pages 같은 서브패스 호스팅(예: /healthy/)에 올릴 때
 * app.json 의 experiments.baseUrl 을 그대로 읽어 manifest/아이콘 경로 앞에
 * 붙인다. 스크립트·이미지 등 다른 정적 자원은 expo-router 가 번들 시점에
 * 알아서 이 값을 붙여주지만, 여기 직접 쓴 태그는 그 대상이 아니라서
 * 수동으로 붙여야 한다. baseUrl 이 없으면(루트 도메인 배포) 빈 문자열이라
 * 지금까지와 동일하게 동작한다.
 */
const BASE_URL =
  (appConfig.expo.experiments as { baseUrl?: string } | undefined)?.baseUrl?.replace(/\/+$/, '') ?? '';

/**
 * 웹 빌드의 루트 HTML. expo-router 가 기본으로 만들어주는 것에 PWA 관련
 * 태그만 얹는다 — "아이폰 친구한테 보여주고 싶다"는 요청 때문에 추가했다.
 * 애플 개발자 계정 없이도 사파리에서 "홈 화면에 추가"로 앱처럼 아이콘이
 * 생기고 주소창 없이 열리게 하려면 이 태그들이 필요하다.
 *
 * 실제 아이콘/manifest 파일은 프로젝트 루트의 public/ 에 있다 —
 * expo-router 웹 빌드가 이 폴더 내용을 그대로 dist 루트에 복사한다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover 가 있어야 아이폰 노치/하단 바 영역까지 앱이 채우고,
            이미 쓰고 있는 SafeAreaProvider 가 그 여백을 제대로 계산한다. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />

        <link rel="manifest" href={`${BASE_URL}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${BASE_URL}/apple-touch-icon.png`} />
        {/* "홈 화면에 추가"로 열었을 때 사파리 주소창 없이 앱처럼 뜨게 한다. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="핏루틴" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0066FF" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
