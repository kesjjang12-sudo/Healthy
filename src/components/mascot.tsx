import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

const SKIN = '#FFC9A3';

/**
 * 헬스반장 마스코트 — 알통 자세(더블 바이셉스)로 웃고 있는 꼬마 반장.
 *
 * 이미지 파일이 아니라 SVG 로 그린다. 어느 해상도에서도 안 깨지고,
 * 번들에 얹히는 무게도 없고, 브랜드 파랑이 바뀌면 theme.ts 만 따라가면 된다.
 * 팔은 이두(타원)·전완(둥근 막대)·주먹(원)을 겹쳐 한 덩어리로 잇는다.
 */
export function Mascot({ width = 154 }: { width?: number }) {
  const height = (width / 220) * 190;

  return (
    <Svg width={width} height={height} viewBox="0 0 220 190">
      {/* 왼팔 */}
      <Ellipse cx={52} cy={112} rx={24} ry={18} fill={SKIN} transform="rotate(-28 52 112)" />
      <Rect x={26} y={64} width={19} height={48} rx={9.5} fill={SKIN} transform="rotate(12 35 88)" />
      <Circle cx={32} cy={64} r={13} fill={SKIN} />
      <Ellipse cx={48} cy={106} rx={8} ry={6} fill="#FFFFFF" opacity={0.35} transform="rotate(-28 48 106)" />

      {/* 오른팔 */}
      <Ellipse cx={168} cy={112} rx={24} ry={18} fill={SKIN} transform="rotate(28 168 112)" />
      <Rect x={175} y={64} width={19} height={48} rx={9.5} fill={SKIN} transform="rotate(-12 185 88)" />
      <Circle cx={188} cy={64} r={13} fill={SKIN} />
      <Ellipse cx={172} cy={106} rx={8} ry={6} fill="#FFFFFF" opacity={0.35} transform="rotate(28 172 106)" />

      {/* 몸통(민소매) + 가슴 라인 + 반장 별 */}
      <Path
        d="M74 128 Q74 106 94 102 L126 102 Q146 106 146 128 L146 156 Q146 168 134 168 L86 168 Q74 168 74 156 Z"
        fill={Colors.primary}
      />
      <Path
        d="M98 120 Q110 128 122 120"
        stroke={Colors.primaryPressed}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
      <Path
        d="M110 138 l3.2 6.6 7.3 1 -5.3 5.1 1.3 7.2 -6.5-3.4 -6.5 3.4 1.3-7.2 -5.3-5.1 7.3-1 Z"
        fill="#FFC24B"
      />

      {/* 다리 */}
      <Rect x={86} y={160} width={20} height={24} rx={10} fill={SKIN} />
      <Rect x={114} y={160} width={20} height={24} rx={10} fill={SKIN} />

      {/* 머리: 얼굴 → 머리카락 → 머리띠 → 표정 */}
      <Circle cx={110} cy={58} r={40} fill={SKIN} />
      <Path d="M72 52 Q74 22 110 20 Q146 22 148 52 Q140 33 110 31 Q80 33 72 52 Z" fill={Colors.text} />
      <Rect x={73} y={38} width={74} height={12} rx={6} fill={Colors.primary} />
      <Circle cx={95} cy={62} r={4.2} fill={Colors.text} />
      <Circle cx={125} cy={62} r={4.2} fill={Colors.text} />
      <Path
        d="M100 73 Q110 82 120 73"
        stroke={Colors.text}
        strokeWidth={3.5}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={85} cy={71} r={5.5} fill="#FF9B9B" opacity={0.5} />
      <Circle cx={135} cy={71} r={5.5} fill="#FF9B9B" opacity={0.5} />
    </Svg>
  );
}
