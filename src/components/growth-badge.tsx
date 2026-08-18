import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, IconTint } from '@/constants/theme';

/**
 * 호칭 배지. 단계가 오를수록 메달이 짙어지고 장식이 늘어난다.
 *
 * 0 새내기      — 회색 테두리 원
 * 1 성실회원    — 파랑 원
 * 2 모범회원    — 파랑 채움 + 별 1
 * 3 운동 고수   — 청록 채움 + 별 1 + 월계 리본
 * 4 운동 달인   — 주황 채움 + 별 2 + 리본
 * 5 운동 9단    — 진파랑 채움 + 별 3 + 리본
 * 6 천하장사    — 금색 + 별 3 + 리본 + 왕관 점
 *
 * 색은 IconTint 팔레트에서만 고른다 — 랭킹 줄에 여러 개가 나란히 서도
 * 앱의 다른 타일들과 싸우지 않는다.
 */

type Palette = { fill: string; ring: string; star: string };

const PALETTES: readonly Palette[] = [
  { fill: Colors.background, ring: Colors.textTertiary, star: Colors.textTertiary },
  { fill: Colors.background, ring: Colors.primary, star: Colors.primary },
  { fill: Colors.primaryFaint, ring: Colors.primary, star: Colors.primary },
  { fill: '#E0F7F7', ring: IconTint.teal, star: IconTint.teal },
  { fill: '#FFF2E0', ring: IconTint.orange, star: IconTint.orange },
  { fill: Colors.primary, ring: Colors.primaryPressed, star: '#FFFFFF' },
  { fill: '#FFC24B', ring: '#B57F17', star: '#FFFFFF' },
];

export function GrowthBadge({ levelIndex, size = 40 }: { levelIndex: number; size?: number }) {
  const idx = Math.max(0, Math.min(PALETTES.length - 1, levelIndex));
  const p = PALETTES[idx];
  const stars = idx >= 5 ? 3 : idx >= 4 ? 2 : idx >= 2 ? 1 : 0;
  const laurel = idx >= 3;
  const crown = idx >= 6;

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {/* 메달 몸통 */}
      <Circle cx={20} cy={20} r={15} fill={p.fill} stroke={p.ring} strokeWidth={2.4} />

      {/* 월계 리본: 고수부터 */}
      {laurel ? (
        <>
          <Path
            d="M8 24 C6 19 7 13 11 9"
            stroke={p.ring}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M32 24 C34 19 33 13 29 9"
            stroke={p.ring}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : null}

      {/* 별: 단계에 따라 0~3개 */}
      {stars === 0 ? (
        // 별 없는 단계는 사람 실루엣 점 하나 — 비어 보이지 않게.
        <Circle cx={20} cy={20} r={4} fill={p.star} opacity={idx === 0 ? 0.5 : 0.9} />
      ) : null}
      {stars >= 1 ? <StarGlyph cx={20} cy={stars === 1 ? 20 : 17.5} color={p.star} /> : null}
      {stars >= 2 ? <StarGlyph cx={14} cy={23} color={p.star} small /> : null}
      {stars >= 3 ? <StarGlyph cx={26} cy={23} color={p.star} small /> : null}

      {/* 천하장사: 왕관 점 셋 */}
      {crown ? (
        <>
          <Circle cx={13} cy={5.5} r={1.6} fill="#B57F17" />
          <Circle cx={20} cy={4} r={1.9} fill="#B57F17" />
          <Circle cx={27} cy={5.5} r={1.6} fill="#B57F17" />
        </>
      ) : null}
    </Svg>
  );
}

function StarGlyph({
  cx,
  cy,
  color,
  small,
}: {
  cx: number;
  cy: number;
  color: string;
  small?: boolean;
}) {
  const s = small ? 0.65 : 1;
  // 별 다섯 꼭짓점을 (0,0) 기준으로 그려 두고 위치·배율만 바꾼다.
  const d =
    'M0 -5 L1.45 -1.55 L5 -1.55 L2.2 0.9 L3.1 4.5 L0 2.4 L-3.1 4.5 L-2.2 0.9 L-5 -1.55 L-1.45 -1.55 Z';
  return <Path d={d} fill={color} transform={`translate(${cx} ${cy}) scale(${s})`} />;
}
