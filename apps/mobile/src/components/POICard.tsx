import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useEffect, useState } from 'react';
import * as Speech from 'expo-speech';
import type { POI } from '@skyatlas/shared';
import { colors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { haptics } from '../core/ux/haptics';
import { getCategoryIcon } from '../core/poi/categoryIcon';

const CATEGORY_LABELS: Record<string, string> = {
  city: 'CITY',
  mountain: 'MOUNTAIN',
  lake: 'LAKE',
  river: 'RIVER',
  sea: 'SEA',
  volcano: 'VOLCANO',
  island: 'ISLAND',
  historic: 'HISTORIC SITE',
  park: 'NATIONAL PARK',
  landmark: 'LANDMARK',
};

interface Props {
  poi: POI;
  distanceKm: number;
  onReadMore: (poi: POI) => void;
  onDismiss: () => void;
  kidsMode?: boolean;
}

export default function POICard({
  poi,
  distanceKm,
  onReadMore,
  onDismiss,
  kidsMode = false,
}: Props) {
  const slideAnim = useRef(new Animated.Value(120)).current;
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
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
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const CategoryIcon = getCategoryIcon(poi.category);
  const categoryLabel = CATEGORY_LABELS[poi.category] ?? poi.category.toUpperCase();
  const photo = poi.photos?.[0];
  const firstFact = poi.facts[0];

  if (kidsMode) {
    return (
      <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
        {/* Full-bleed hero photo */}
        <View style={styles.heroContainer}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.photo}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <CategoryIcon size={40} color={colors.textMuted} strokeWidth={1.5} />
            </View>
          )}
          {/* Category badge top-left */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{categoryLabel}</Text>
          </View>
          {/* Distance badge top-right */}
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeText}>{distanceKm} KM AWAY</Text>
          </View>
          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={styles.photoGradient}
          />
          {/* Dismiss button */}
          <Pressable
            onPress={() => {
              haptics.light();
              onDismiss();
            }}
            style={styles.dismissOverlay}
            hitSlop={8}
          >
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.kidsHeader}>Look down! 👇</Text>
          <Text style={styles.kidsName} numberOfLines={2}>
            {poi.name}
          </Text>
          {firstFact && (
            <Text style={styles.kidsFact} numberOfLines={2}>
              {firstFact}
            </Text>
          )}
          <View style={styles.kidsActions}>
            <Pressable onPress={handleSpeaker} style={styles.speakerButton} hitSlop={8}>
              <Text style={styles.speakerText}>{isSpeaking ? '⏹' : '🔊'}</Text>
            </Pressable>
            <Pressable
              style={styles.readMoreButton}
              onPress={() => {
                haptics.medium();
                onReadMore(poi);
              }}
            >
              <Text style={styles.readMoreText}>TELL ME MORE! 🤓</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
      {/* Full-bleed hero photo */}
      <View style={styles.heroContainer}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <CategoryIcon size={40} color={colors.textMuted} strokeWidth={1.5} />
          </View>
        )}
        {/* Category badge top-left */}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{categoryLabel}</Text>
        </View>
        {/* Distance badge top-right */}
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceBadgeText}>{distanceKm} KM AWAY</Text>
        </View>
        {/* Gradient overlay at bottom */}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.photoGradient} />
        {/* Dismiss button */}
        <Pressable
          onPress={() => {
            haptics.light();
            onDismiss();
          }}
          style={styles.dismissOverlay}
          hitSlop={8}
        >
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </View>

      {/* Editorial content below photo */}
      <View style={styles.content}>
        {/* Big serif name */}
        <Text style={styles.name} numberOfLines={2}>
          {poi.name}
        </Text>
        {/* One-line muted italic fact subtitle */}
        {firstFact && (
          <Text style={styles.factSubtitle} numberOfLines={1}>
            {firstFact}
          </Text>
        )}
        {/* Bottom row: listen + read more CTA */}
        <View style={styles.ctaRow}>
          <Pressable onPress={handleSpeaker} style={styles.speakerButton} hitSlop={8}>
            <Text style={styles.speakerText}>{isSpeaking ? '⏹' : '🔊'}</Text>
          </Pressable>
          <Pressable
            style={styles.readMoreButton}
            onPress={() => {
              haptics.medium();
              onReadMore(poi);
            }}
          >
            <Text style={styles.readMoreText}>READ MORE →</Text>
          </Pressable>
        </View>
      </View>

      {/* Subtle bottom border accent */}
      <View style={styles.bottomAccent} />
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
  },

  // Hero photo — full-bleed, no horizontal padding
  heroContainer: {
    position: 'relative',
    width: '100%',
  },
  photo: {
    width: '100%',
    height: 150,
  },
  photoPlaceholder: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIcon: { fontSize: 40 },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },

  // Category badge — top-left of photo
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Distance badge — top-right of photo
  distanceBadge: {
    position: 'absolute',
    top: 10,
    right: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  distanceBadgeText: {
    fontFamily: fonts.mono,
    color: '#FFFFFF',
    fontSize: 9,
    letterSpacing: 0.8,
  },

  // Dismiss button — over photo, top-right
  dismissOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },

  // Content section
  content: {
    padding: 14,
    gap: 6,
  },

  // Big serif POI name
  name: {
    fontFamily: fonts.displayBold,
    color: colors.text,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
  },

  // One-line italic fact subtitle
  factSubtitle: {
    fontFamily: fonts.displayRegular,
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // CTA row
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  speakerButton: { padding: 4 },
  speakerText: { fontSize: 16 },
  readMoreButton: {
    backgroundColor: 'transparent',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontFamily: fonts.bodySemi,
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Subtle bottom border accent
  bottomAccent: {
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.35,
    marginHorizontal: 0,
  },

  // Kids mode
  kidsHeader: {
    fontFamily: fonts.bodyBold,
    color: colors.primary,
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  kidsName: {
    fontFamily: fonts.displayBold,
    color: colors.text,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  kidsFact: {
    fontFamily: fonts.displayRegular,
    color: colors.accent,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  kidsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 4,
  },
});
