import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  icon?: string | LucideIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export default function EmptyState({ icon, title, description, ctaLabel, onCtaPress }: Props) {
  return (
    <View style={styles.container}>
      {typeof icon === 'string' ? (
        <Text style={styles.iconEmoji}>{icon}</Text>
      ) : icon ? (
        React.createElement(icon, { size: 80, color: colors.textMuted, strokeWidth: 1.3 })
      ) : null}
      <Text style={[typography.h2, styles.title]}>{title}</Text>
      <Text style={[typography.body, styles.description]}>{description}</Text>
      {ctaLabel && onCtaPress && (
        <Pressable style={styles.cta} onPress={onCtaPress}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  iconEmoji: { fontSize: 80, marginBottom: 8 },
  title: { textAlign: 'center' },
  description: { color: colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  cta: { marginTop: 12, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  ctaText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
