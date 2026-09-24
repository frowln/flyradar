import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import RouteSketch from './RouteSketch';
import type { RouteMapProps } from './RouteMap';
import { palette } from '../design/tokens';
import { decorative } from '../design/layout';

/** Browser preview: the atlas-plate sketch stands in for the native tile map. Hidden from screen readers, as the native map is. */
export default function RouteMap({ route, position, pois, seen, highlight }: RouteMapProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  return (
    <View {...decorative} style={styles.fill} onLayout={onLayout}>
      {size.w > 0 ? (
        <RouteSketch
          route={route}
          width={size.w}
          height={size.h}
          flownS={position.elapsedS}
          pois={pois}
          lit={seen}
          highlight={highlight}
          plane={position}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: palette.void } });
