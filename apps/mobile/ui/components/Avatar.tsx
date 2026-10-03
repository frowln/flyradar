import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { palette, family } from '../design/tokens';

/**
 * A person's mark: their photo when they set one, otherwise their initials on
 * a muted tone of their own, so a list of people reads at a glance.
 */

const TONES = ['#2E4057', '#4B3B5C', '#5C4632', '#2F5446', '#5A3440', '#2D5157', '#55502F', '#3D4A6B'];

export const MEDAL = { gold: '#D9B44A', silver: '#B9C2CC', bronze: '#B9804F' } as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '?').replace(/^@/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

interface Props {
  id: string;
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  /** A coloured ring: a medal on the podium, amber for the passenger. */
  ring?: string;
}

function Avatar({ id, name, url, size = 36, ring }: Props) {
  const inner = ring ? size - 6 : size;
  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
        ring ? { borderWidth: 2, borderColor: ring, padding: 1 } : null
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} contentFit="cover" />
      ) : (
        <View style={[styles.face, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: TONES[hash(id) % TONES.length] }]}>
          <Text allowFontScaling={false} style={[styles.letters, { fontSize: Math.max(10, inner * 0.36) }]}>
            {initials(name)}
          </Text>
        </View>
      )}
    </View>
  );
}

export default memo(Avatar);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  face: { alignItems: 'center', justifyContent: 'center' },
  letters: { color: palette.ink, fontFamily: family.displayMid, letterSpacing: 0.5 }
});
