import Svg, { Path, Circle, G, Line } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface Props {
  size?: number;
}

export default function CompassIllustration({ size = 200 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Background glow rings */}
      <Circle cx="100" cy="100" r="90" fill={colors.accent} opacity="0.05" />
      <Circle cx="100" cy="100" r="68" fill={colors.accent} opacity="0.09" />
      {/* Compass outer ring */}
      <Circle
        cx="100"
        cy="100"
        r="55"
        fill="none"
        stroke={colors.accent}
        strokeWidth="3"
        opacity="0.6"
      />
      {/* Compass inner ring */}
      <Circle
        cx="100"
        cy="100"
        r="42"
        fill="none"
        stroke={colors.accent}
        strokeWidth="1"
        opacity="0.3"
      />
      {/* Cardinal tick marks */}
      <Line x1="100" y1="45" x2="100" y2="55" stroke={colors.accent} strokeWidth="3" opacity="0.8" />
      <Line x1="100" y1="145" x2="100" y2="155" stroke={colors.text} strokeWidth="2" opacity="0.5" />
      <Line x1="45" y1="100" x2="55" y2="100" stroke={colors.text} strokeWidth="2" opacity="0.5" />
      <Line x1="145" y1="100" x2="155" y2="100" stroke={colors.text} strokeWidth="2" opacity="0.5" />
      {/* North needle (accent color) */}
      <G transform="translate(100 100) rotate(-30)">
        <Path d="M 0 -38 L 6 0 L 0 8 L -6 0 Z" fill={colors.accent} />
        {/* South needle (muted) */}
        <Path d="M 0 38 L 6 0 L 0 -8 L -6 0 Z" fill={colors.textMuted} opacity="0.5" />
      </G>
      {/* Center dot */}
      <Circle cx="100" cy="100" r="5" fill={colors.text} />
      <Circle cx="100" cy="100" r="2.5" fill={colors.accent} />
    </Svg>
  );
}
