import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Defs, Pattern, Rect } from 'react-native-svg';
import type { POICategory } from '@skyatlas/shared';
import { palette } from '../design/tokens';
import { decorative } from '../design/layout';

interface Props {
  category: POICategory;
  /** Any stable string — the same place always draws the same figure. */
  seed: string;
  height?: number;
}

/**
 * A drawn figure for places that have no photograph.
 *
 * Wikimedia coverage is uneven, and a grey placeholder in the one moment the
 * product exists for is worse than no image at all. This draws terrain from the
 * category instead — hatched, like an atlas plate — so an unphotographed place
 * still arrives as something made rather than something missing.
 *
 * Deterministic from the seed: a place looks the same every time it is opened,
 * which matters when the point is collecting them.
 *
 * Decorative to a screen reader: the category it draws is printed on the plate
 * above it.
 */
export default function PlaceFigure({ category, seed, height = 190 }: Props) {
  const rand = makeRandom(seed);
  const W = 400;

  return (
    <View {...decorative} style={[styles.wrap, { height }]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="0" y2="6" stroke={palette.amber} strokeOpacity="0.16" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={W} height={height} fill={palette.warm} />
        {figureFor(category, rand, W, height)}
      </Svg>
    </View>
  );
}

/** Small deterministic PRNG so a place's figure never changes between opens. */
function makeRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function figureFor(category: POICategory, rand: () => number, W: number, H: number) {
  const stroke = palette.amber;
  const dim = palette.amberDim;

  switch (category) {
    case 'mountain':
    case 'volcano':
    case 'range':
    case 'glacier': {
      const peaks = 5;
      const pts: string[] = [`M -10 ${H}`];
      for (let i = 0; i <= peaks; i++) {
        const x = (W / peaks) * i;
        const y = H * (0.30 + rand() * 0.34);
        pts.push(`L ${x.toFixed(0)} ${y.toFixed(0)}`);
        pts.push(`L ${(x + W / peaks / 2).toFixed(0)} ${(y + H * 0.16).toFixed(0)}`);
      }
      pts.push(`L ${W + 10} ${H} Z`);
      const d = pts.join(' ');
      return (
        <>
          <Path d={d} fill="url(#hatch)" stroke={stroke} strokeOpacity={0.5} strokeWidth={1} />
          <Path
            d={`M -10 ${H * 0.86} L ${W * 0.3} ${H * 0.7} L ${W * 0.55} ${H * 0.82} L ${W} ${H * 0.72}`}
            fill="none"
            stroke={dim}
            strokeOpacity={0.5}
            strokeWidth={1}
          />
        </>
      );
    }

    case 'sea':
    case 'lake':
    case 'river': {
      const lines = 7;
      return (
        <>
          {Array.from({ length: lines }, (_, i) => {
            const y = H * (0.28 + (i / lines) * 0.66);
            const amp = 5 + rand() * 9;
            return (
              <Path
                key={i}
                d={`M -10 ${y} Q ${W * 0.25} ${y - amp} ${W * 0.5} ${y} T ${W + 10} ${y}`}
                fill="none"
                stroke={stroke}
                strokeOpacity={0.13 + (i / lines) * 0.22}
                strokeWidth={1}
              />
            );
          })}
        </>
      );
    }

    case 'city': {
      const blocks = 14;
      return (
        <>
          {Array.from({ length: blocks }, (_, i) => {
            const w = W / blocks;
            const h = H * (0.18 + rand() * 0.5);
            return (
              <Rect
                key={i}
                x={i * w + 1}
                y={H - h}
                width={w - 2}
                height={h}
                fill="url(#hatch)"
                stroke={stroke}
                strokeOpacity={0.34}
                strokeWidth={1}
              />
            );
          })}
        </>
      );
    }

    case 'desert':
    case 'plateau': {
      // Dune crests: long, low, overlapping swells.
      const crests = 6;
      return (
        <>
          {Array.from({ length: crests }, (_, i) => {
            const y = H * (0.36 + (i / crests) * 0.6);
            const x0 = -40 + rand() * 60;
            const span = W * (0.45 + rand() * 0.4);
            return (
              <Path
                key={i}
                d={`M ${x0} ${y} Q ${x0 + span * 0.5} ${y - 18 - rand() * 14} ${x0 + span} ${y} T ${x0 + span * 2} ${y}`}
                fill="none"
                stroke={stroke}
                strokeOpacity={0.18 + (i / crests) * 0.3}
                strokeWidth={1}
              />
            );
          })}
        </>
      );
    }

    case 'island':
    case 'peninsula':
      return (
        <>
          <Path
            d={`M ${W * 0.2} ${H * 0.66} Q ${W * 0.34} ${H * 0.4} ${W * 0.52} ${H * 0.52} Q ${W * 0.74} ${H * 0.36} ${W * 0.8} ${H * 0.66} Q ${W * 0.5} ${H * 0.82} ${W * 0.2} ${H * 0.66} Z`}
            fill="url(#hatch)"
            stroke={stroke}
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          {Array.from({ length: 3 }, (_, i) => (
            <Path
              key={i}
              d={`M -10 ${H * (0.76 + i * 0.08)} Q ${W * 0.5} ${H * (0.72 + i * 0.08)} ${W + 10} ${H * (0.76 + i * 0.08)}`}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.16}
              strokeWidth={1}
            />
          ))}
        </>
      );

    default: {
      // Contour rings — reads as terrain on a chart without claiming a shape.
      return (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <Circle
              key={i}
              cx={W * 0.5}
              cy={H * 0.6}
              r={18 + i * 22}
              fill="none"
              stroke={stroke}
              strokeOpacity={0.3 - i * 0.04}
              strokeWidth={1}
            />
          ))}
          <Circle cx={W * 0.5} cy={H * 0.6} r={4} fill={stroke} fillOpacity={0.7} />
        </>
      );
    }
  }
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: palette.warm, overflow: 'hidden' }
});
