import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export type IconName =
  | 'dumbbell'
  | 'thunder'
  | 'calendar'
  | 'trophy'
  | 'chart'
  | 'column'
  | 'person'
  | 'chevron-right'
  | 'qr'
  | 'play'
  | 'logout'
  | 'building'
  | 'heart'
  | 'coin';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** 선 굵기. 탭바처럼 작게 쓸 땐 살짝 두껍게 주면 또렷하다. */
  strokeWidth?: number;
  /** 활성 탭처럼 면을 채워 그린다(FIT ROTEIN 의 fill 변형). thunder 만 지원. */
  filled?: boolean;
};

/**
 * 앱에서 쓰는 모든 아이콘. 토스처럼 단순한 선 아이콘을 SVG 로 직접 그린다.
 *
 * 이모지·글리프 문자를 쓰지 않는 원칙은 그대로다(CheckMark 참고) — 기기 폰트에
 * 따라 모양이 달라지고 화면 톤을 흐트러뜨리기 때문이다. 대신 24pt 격자 위에
 * 같은 선 굵기·같은 둥근 끝으로 그려서 어디서나 한 세트로 읽히게 한다.
 */
export function Icon({ name, size = 24, color = Colors.text, strokeWidth = 1.9, filled = false }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'dumbbell' && (
        <>
          <Path d="M4 9.5v5" {...stroke} />
          <Path d="M7 7.5v9" {...stroke} />
          <Path d="M17 7.5v9" {...stroke} />
          <Path d="M20 9.5v5" {...stroke} />
          <Path d="M7 12h10" {...stroke} />
        </>
      )}
      {name === 'thunder' && (
        <Path
          d="M13.2 2.8 5.6 13.2c-.3.4 0 .9.5.9h4.6l-1.6 6.8c-.1.6.6.9 1 .4l7.6-10.4c.3-.4 0-.9-.5-.9h-4.6l1.6-6.8c.1-.6-.6-.9-1-.4z"
          {...stroke}
          fill={filled ? color : 'none'}
        />
      )}
      {name === 'column' && (
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={3} {...stroke} />
          <Path d="M8.2 16.5v-4" {...stroke} strokeWidth={strokeWidth + 0.4} />
          <Path d="M12 16.5V7.5" {...stroke} strokeWidth={strokeWidth + 0.4} />
          <Path d="M15.8 16.5v-6.5" {...stroke} strokeWidth={strokeWidth + 0.4} />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} {...stroke} />
          <Path d="M3.5 9.5h17" {...stroke} />
          <Path d="M8 3.5V7" {...stroke} />
          <Path d="M16 3.5V7" {...stroke} />
        </>
      )}
      {name === 'trophy' && (
        <>
          <Path d="M8 4.5h8V10a4 4 0 0 1-8 0z" {...stroke} />
          <Path d="M8 6H4.5v1A3.5 3.5 0 0 0 8 10.5" {...stroke} />
          <Path d="M16 6h3.5v1a3.5 3.5 0 0 1-3.5 3.5" {...stroke} />
          <Path d="M12 14v4.5" {...stroke} />
          <Path d="M8.5 20h7" {...stroke} />
        </>
      )}
      {name === 'chart' && (
        <>
          <Path d="M5 20v-7" {...stroke} strokeWidth={strokeWidth + 0.6} />
          <Path d="M12 20V5.5" {...stroke} strokeWidth={strokeWidth + 0.6} />
          <Path d="M19 20v-10" {...stroke} strokeWidth={strokeWidth + 0.6} />
        </>
      )}
      {name === 'person' && (
        <>
          <Circle cx={12} cy={7.5} r={3.5} {...stroke} />
          <Path d="M4.5 20c0-3.5 3.2-6 7.5-6s7.5 2.5 7.5 6" {...stroke} />
        </>
      )}
      {name === 'chevron-right' && <Path d="M9.5 5.5 16 12l-6.5 6.5" {...stroke} />}
      {name === 'qr' && (
        <>
          <Rect x={4} y={4} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={13.5} y={13.5} width={3} height={3} rx={0.8} fill={color} />
          <Rect x={17.5} y={17.5} width={2.5} height={2.5} rx={0.8} fill={color} />
        </>
      )}
      {name === 'play' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M10.2 8.8 15.5 12l-5.3 3.2z" fill={color} stroke={color} strokeLinejoin="round" />
        </>
      )}
      {name === 'logout' && (
        <>
          <Path d="M13.5 8V5.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.5a2 2 0 0 0 2-2V16" {...stroke} />
          <Path d="M10 12h10" {...stroke} />
          <Path d="M17 8.5 20.5 12 17 15.5" {...stroke} />
        </>
      )}
      {name === 'building' && (
        <>
          <Rect x={5} y={3.5} width={14} height={17} rx={2} {...stroke} />
          <Path d="M9 8h2M13 8h2M9 12h2M13 12h2" {...stroke} />
          <Path d="M10.5 20.5v-3a1.5 1.5 0 0 1 3 0v3" {...stroke} />
        </>
      )}
      {name === 'heart' && (
        <Path
          d="M12 20c-4.5-2.9-7.5-5.8-8.6-8.4C2.2 8.7 4 5.5 7.2 5.5c1.9 0 3.5 1 4.8 2.9 1.3-1.9 2.9-2.9 4.8-2.9 3.2 0 5 3.2 3.8 6.1-1.1 2.6-4.1 5.5-8.6 8.4z"
          {...stroke}
        />
      )}
      {name === 'coin' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="m8.5 9.5 1.3 5 2.2-5 2.2 5 1.3-5" {...stroke} strokeWidth={Math.max(1.4, strokeWidth - 0.3)} />
          <Path d="M8 12h8" {...stroke} strokeWidth={Math.max(1.4, strokeWidth - 0.3)} />
        </>
      )}
    </Svg>
  );
}
