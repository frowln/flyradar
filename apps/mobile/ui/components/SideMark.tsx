import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { palette } from '../design/tokens';
import { decorative } from '../design/layout';

/**
 * Which window, as a glyph: a chevron out of the left or right side of a
 * fuselage outline, or a dot beneath it. Read faster than the word at a glance
 * across a dark cabin, and identical in every language.
 *
 * Hidden from screen readers: wherever it appears, the side is also in words —
 * in the text beside it or in the row's spoken label.
 */
export default function SideMark({
  side,
  size = 18,
  color = palette.amber
}: {
  side: 'left' | 'right' | 'both' | 'below' | 'ahead' | 'behind' | 'mark' | undefined;
  size?: number;
  color?: string;
}) {
  const s = size;
  if (side === 'mark') {
    // A non-sight moment (border, line, sunrise): a tick, not an aircraft.
    return (
      <View {...decorative}>
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M6 12 L18 12" stroke={palette.inkDim} strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </View>
    );
  }
  return (
    <View {...decorative}>
      <Svg width={s} height={s} viewBox="0 0 24 24">
        {/* Fuselage, nose up. */}
        <Path d="M12 3 C13.2 3 13.6 5 13.6 7 L13.6 19 L12 21 L10.4 19 L10.4 7 C10.4 5 10.8 3 12 3 Z" fill="none" stroke={palette.inkDim} strokeWidth={1.2} />
        {side === 'left' || side === 'both' ? <Path d="M8 8 L3.5 12 L8 16" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {side === 'right' || side === 'both' ? <Path d="M16 8 L20.5 12 L16 16" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {side === 'below' ? <Circle cx={12} cy={12} r={2.6} fill={color} /> : null}
        {side === 'ahead' ? <Path d="M8.5 5 L12 1.5 L15.5 5" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
        {side === 'behind' ? <Path d="M8.5 19 L12 22.5 L15.5 19" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
      </Svg>
    </View>
  );
}
