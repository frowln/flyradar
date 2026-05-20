import Svg, { Path, Circle, G } from 'react-native-svg';
import { colors } from '../../theme/colors';

interface Props {
  size?: number;
}

export default function EmptyMapIllustration({ size = 200 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* Globe outline */}
      <Circle cx="100" cy="100" r="72" fill="none" stroke={colors.primary} strokeWidth="2" opacity="0.4" />
      <Circle cx="100" cy="100" r="72" fill={colors.primary} opacity="0.04" />
      {/* Latitude lines */}
      <Path d="M 28 100 Q 100 82 172 100" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.25" />
      <Path d="M 28 100 Q 100 118 172 100" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.25" />
      <Path d="M 40 72 Q 100 58 160 72" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.18" />
      <Path d="M 40 128 Q 100 142 160 128" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.18" />
      {/* Longitude line (center vertical) */}
      <Path d="M 100 28 Q 116 64 116 100 Q 116 136 100 172" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.25" />
      <Path d="M 100 28 Q 84 64 84 100 Q 84 136 100 172" fill="none" stroke={colors.primary} strokeWidth="1" opacity="0.25" />
      {/* Dashed flight path */}
      <Path d="M 50 120 Q 100 70 150 90" fill="none" stroke={colors.accent} strokeWidth="2" strokeDasharray="6 5" opacity="0.7" />
      {/* Origin pin */}
      <Circle cx="50" cy="120" r="5" fill={colors.accent} opacity="0.8" />
      {/* Destination pin */}
      <G transform="translate(150 90)">
        <Circle r="5" fill={colors.accent} opacity="0.8" />
        <Circle r="10" fill={colors.accent} opacity="0.15" />
      </G>
    </Svg>
  );
}
