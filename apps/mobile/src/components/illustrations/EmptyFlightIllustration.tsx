import Svg, { Path, Circle, G, Rect } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface Props {
  size?: number;
}

export default function EmptyFlightIllustration({ size = 200 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Background glow */}
      <Circle cx="100" cy="110" r="72" fill={colors.primary} opacity="0.05" />
      {/* Clouds */}
      <G opacity="0.25">
        <Circle cx="52" cy="130" r="14" fill={colors.textMuted} />
        <Circle cx="68" cy="124" r="18" fill={colors.textMuted} />
        <Circle cx="84" cy="130" r="14" fill={colors.textMuted} />
        <Rect x="52" y="130" width="32" height="14" fill={colors.textMuted} />
      </G>
      <G opacity="0.18">
        <Circle cx="128" cy="140" r="10" fill={colors.textMuted} />
        <Circle cx="140" cy="136" r="13" fill={colors.textMuted} />
        <Circle cx="152" cy="140" r="10" fill={colors.textMuted} />
        <Rect x="128" y="140" width="24" height="10" fill={colors.textMuted} />
      </G>
      {/* Small plane silhouette, centered, tilted up */}
      <G transform="translate(100 90) rotate(-20)">
        <Path
          d="M -30 0 L 30 -5 L 22 7 L -6 6 L -20 16 L -30 12 L -24 3 L -30 -3 L -24 -12 L -20 -16 L -6 -6 L 22 -7 Z"
          fill={colors.primary}
          opacity="0.8"
        />
      </G>
      {/* Dashed trail */}
      <Path
        d="M 40 118 Q 80 95 118 82"
        stroke={colors.accent}
        strokeWidth="1.5"
        strokeDasharray="4 4"
        fill="none"
        opacity="0.5"
      />
    </Svg>
  );
}
