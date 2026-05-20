import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface Props {
  size?: number;
}

const GOLD = '#FFB547';
const GOLD_DIM = '#A87A00';

export default function TrophyIllustration({ size = 200 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Background glow */}
      <Circle cx="100" cy="100" r="90" fill={GOLD} opacity="0.06" />
      <Circle cx="100" cy="100" r="62" fill={GOLD} opacity="0.10" />
      {/* Trophy cup body */}
      <Path
        d="M 68 50 L 132 50 L 124 110 Q 100 126 76 110 Z"
        fill={GOLD}
        opacity="0.9"
      />
      {/* Trophy handles */}
      <Path
        d="M 68 60 Q 48 60 50 80 Q 52 95 68 90"
        fill="none"
        stroke={GOLD}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Path
        d="M 132 60 Q 152 60 150 80 Q 148 95 132 90"
        fill="none"
        stroke={GOLD}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Stem */}
      <Rect x="93" y="110" width="14" height="24" fill={GOLD_DIM} opacity="0.8" rx="2" />
      {/* Base */}
      <Rect x="76" y="134" width="48" height="10" fill={GOLD} opacity="0.8" rx="4" />
      {/* Star highlight */}
      <G transform="translate(100 82)">
        <Path
          d="M 0 -14 L 3.5 -4.3 L 13.3 -4.3 L 5.6 1.6 L 8.2 11.4 L 0 6 L -8.2 11.4 L -5.6 1.6 L -13.3 -4.3 L -3.5 -4.3 Z"
          fill="white"
          opacity="0.35"
        />
      </G>
    </Svg>
  );
}
