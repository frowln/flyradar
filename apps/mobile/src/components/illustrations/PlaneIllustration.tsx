import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface Props {
  size?: number;
}

export default function PlaneIllustration({ size = 200 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Background glow rings */}
      <Circle cx="100" cy="100" r="90" fill={colors.primary} opacity="0.06" />
      <Circle cx="100" cy="100" r="65" fill={colors.primary} opacity="0.10" />
      <Circle cx="100" cy="100" r="42" fill={colors.primary} opacity="0.16" />
      {/* Plane body */}
      <G transform="translate(100 100) rotate(-35)">
        <Path
          d="M -45 0 L 45 -6 L 36 10 L -8 8 L -28 24 L -42 18 L -34 4 L -42 -4 L -34 -18 L -28 -24 L -8 -8 L 36 -10 Z"
          fill={colors.primary}
        />
      </G>
      {/* Flight path dashes */}
      <Path
        d="M 28 138 Q 100 95 172 138"
        stroke={colors.accent}
        strokeWidth="2"
        strokeDasharray="5 5"
        fill="none"
        opacity="0.7"
      />
      {/* Origin dot */}
      <Circle cx="28" cy="138" r="4" fill={colors.accent} opacity="0.9" />
      {/* Destination dot */}
      <Circle cx="172" cy="138" r="4" fill={colors.accent} opacity="0.9" />
    </Svg>
  );
}
