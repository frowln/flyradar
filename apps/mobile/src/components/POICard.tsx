import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useRef, useEffect, useState } from 'react';
import * as Speech from 'expo-speech';
import type { POI } from '@skyatlas/shared';
import { colors } from '../theme/colors';
import { haptics } from '../core/ux/haptics';

const CATEGORY_ICONS: Record<string, string> = {
  city: '🏙️',
  mountain: '⛰️',
  lake: '🌊',
  river: '🌊',
  sea: '🌊',
  volcano: '🌋',
  island: '🏝️',
  historic: '🏛️',
  park: '🌿',
  landmark: '🗺️'
};

interface Props {
  poi: POI;
  distanceKm: number;
  onReadMore: (poi: POI) => void;
  onDismiss: () => void;
  kidsMode?: boolean;
}

export default function POICard({ poi, distanceKm, onReadMore, onDismiss, kidsMode = false }: Props) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10
    }).start();
    return () => {
      Speech.stop();
    };
  }, []);

  const handleSpeaker = async () => {
    haptics.light();
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      Speech.speak(poi.summary, {
        language: 'en',
        rate: 0.95,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      });
    }
  };

  const icon = CATEGORY_ICONS[poi.category] ?? '📍';
  const photo = poi.photos?.[0];

  if (kidsMode) {
    return (
      <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoIcon}>{icon}</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.kidsHeader}>Look down! 👇</Text>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.kidsIcon}>{icon}</Text>
              <View style={styles.titleBlock}>
                <Text style={styles.kidsName} numberOfLines={1}>{poi.name}</Text>
                <Text style={styles.distance}>{distanceKm} km away</Text>
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={handleSpeaker} style={styles.speakerButton} hitSlop={8}>
                <Text style={styles.speakerText}>{isSpeaking ? '⏹' : '🔊'}</Text>
              </Pressable>
              <Pressable onPress={() => { haptics.light(); onDismiss(); }} style={styles.dismissButton} hitSlop={8}>
                <Text style={styles.dismissText}>✕</Text>
              </Pressable>
            </View>
          </View>

          {poi.facts.length > 0 && (
            <Text style={styles.kidsFact}>💡 {poi.facts[0]}</Text>
          )}

          <Pressable style={styles.readMoreButton} onPress={() => { haptics.medium(); onReadMore(poi); }}>
            <Text style={styles.readMoreText}>Tell me more! 🤓</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.photoIcon}>{icon}</Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.titleBlock}>
              <Text style={styles.name} numberOfLines={1}>{poi.name}</Text>
              <Text style={styles.distance}>{distanceKm} km away</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={handleSpeaker} style={styles.speakerButton} hitSlop={8}>
              <Text style={styles.speakerText}>{isSpeaking ? '⏹' : '🔊'}</Text>
            </Pressable>
            <Pressable onPress={() => { haptics.light(); onDismiss(); }} style={styles.dismissButton} hitSlop={8}>
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.summary} numberOfLines={3}>{poi.summary}</Text>

        {poi.facts.length > 0 && (
          <Text style={styles.fact}>💡 {poi.facts[0]}</Text>
        )}

        <Pressable style={styles.readMoreButton} onPress={() => { haptics.medium(); onReadMore(poi); }}>
          <Text style={styles.readMoreText}>Read more →</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10
  },
  photo: {
    width: '100%',
    height: 120
  },
  photoPlaceholder: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center'
  },
  photoIcon: { fontSize: 40 },
  content: { padding: 14, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', gap: 8, flex: 1 },
  icon: { fontSize: 20 },
  titleBlock: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  distance: { color: colors.primary, fontSize: 12, fontWeight: '500', marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  speakerButton: { padding: 4 },
  speakerText: { fontSize: 16 },
  dismissButton: { padding: 4 },
  dismissText: { color: colors.textMuted, fontSize: 16 },
  summary: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  fact: { color: colors.accent, fontSize: 13, fontStyle: 'italic' },
  readMoreButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4
  },
  readMoreText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  kidsHeader: { color: colors.primary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  kidsIcon: { fontSize: 40 },
  kidsName: { color: colors.text, fontSize: 22, fontWeight: '700' },
  kidsFact: { color: colors.accent, fontSize: 16, fontStyle: 'italic' }
});
