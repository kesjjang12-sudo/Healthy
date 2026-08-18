import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type { FontScale } from '@/lib/database.types';

/**
 * 글자 크기 배율.
 *
 * '작게'가 1.0 이다 — 지금 화면(FIT ROTEIN 시안 치수)이 그 기준이고,
 * 거기서 키우는 방향으로만 간다. 더 줄이면 4060 회원이 못 읽는다.
 *
 * '크게'(1.3)는 본문 16 → 21 이 되어, 예전에 쓰던 시니어 확대 치수와
 * 비슷해진다. 헬스장에 서서 조작하는 분을 위한 자리다.
 */
export const FONT_SCALES: Record<FontScale, number> = {
  small: 1.0,
  medium: 1.15,
  large: 1.3,
};

/**
 * 처음 보는 화면(로그인·설문)에서 쓰는 값.
 *
 * 아직 안 고르신 분에게는 '중간'으로 보여 드린다. 고르는 화면 자체가 너무
 * 작으면 그 화면을 못 읽어서 고를 수가 없다.
 */
export const DEFAULT_FONT_SCALE: FontScale = 'medium';

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  small: '작게',
  medium: '중간',
  large: '크게',
};

/**
 * 서버에 저장하기 전에 폰에 먼저 적어 둔다.
 *
 * 설문에서 고르자마자 화면이 바뀌어야 "이 크기구나"를 확인하고 넘어갈 수
 * 있는데, 서버 왕복을 기다리면 한 박자 늦는다. 다음에 앱을 켤 때도 로그인
 * 응답이 오기 전까지 이 값으로 그린다.
 */
const STORAGE_KEY = 'fitroutine.font-scale.v1';

function isFontScale(value: unknown): value is FontScale {
  return value === 'small' || value === 'medium' || value === 'large';
}

type Ctx = {
  scale: FontScale;
  multiplier: number;
  /** 화면에서 고른 값을 즉시 반영한다. 서버 저장은 부르는 쪽이 한다. */
  setScale: (next: FontScale) => void;
};

const FontScaleContext = createContext<Ctx>({
  scale: DEFAULT_FONT_SCALE,
  multiplier: FONT_SCALES[DEFAULT_FONT_SCALE],
  setScale: () => {},
});

export function FontScaleProvider({ children }: PropsWithChildren) {
  const [scale, setScaleState] = useState<FontScale>(DEFAULT_FONT_SCALE);

  // 폰에 적어 둔 값을 먼저 읽는다. 서버 값은 로그인 뒤 useSyncFontScale 이 덮는다.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!cancelled && isFontScale(stored)) setScaleState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setScale = useCallback((next: FontScale) => {
    setScaleState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ scale, multiplier: FONT_SCALES[scale], setScale }),
    [scale, setScale],
  );

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>;
}

export function useFontScale(): Ctx {
  return useContext(FontScaleContext);
}

/**
 * 로그인한 회원의 저장된 크기를 화면에 반영한다.
 *
 * 폰을 바꾸거나 앱을 지웠다 깔아도 자기가 고른 크기로 돌아오게 하려면
 * 서버 값이 폰에 적힌 값을 이겨야 한다.
 */
export function useSyncFontScale(saved: FontScale | undefined) {
  const { scale, setScale } = useFontScale();

  useEffect(() => {
    if (saved && saved !== scale) setScale(saved);
    // scale 을 의존성에 넣으면 사용자가 방금 바꾼 값을 서버 값이 곧바로
    // 되돌려 버린다(저장이 끝나기 전까지). saved 가 바뀔 때만 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
}
