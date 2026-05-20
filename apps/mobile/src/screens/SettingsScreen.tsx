import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import type { RootStackParamList } from '../navigation/types';
import { t, setLocale, getLocale, SUPPORTED_LOCALES } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  ru: '🇷🇺',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  ja: '🇯🇵'
};

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [units, setUnitsState] = useState<'km' | 'miles'>(() => collectionsStore.getUnits());
  const [locale, setLocaleState] = useState(() => getLocale());

  function toggleUnits() {
    const next = units === 'km' ? 'miles' : 'km';
    collectionsStore.setUnits(next);
    setUnitsState(next);
  }

  function cycleLanguage() {
    const idx = SUPPORTED_LOCALES.indexOf(locale as typeof SUPPORTED_LOCALES[number]);
    const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length];
    setLocale(next);
    setLocaleState(next);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Preferences */}
      <Text style={styles.sectionHeader}>{t('settings.preferences')}</Text>
      <View style={styles.section}>
        <Pressable
          style={styles.row}
          onPress={cycleLanguage}
          accessibilityLabel="Switch to next language"
          accessibilityRole="button"
        >
          <Text style={[typography.body, styles.rowLabel]}>{t('settings.language')}</Text>
          <Text style={[typography.body, styles.rowValue]}>
            {LANGUAGE_FLAGS[locale] ?? '🌐'} {locale.toUpperCase()}
          </Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.row}
          onPress={toggleUnits}
          accessibilityLabel={units === 'km' ? 'Switch units to miles' : 'Switch units to kilometres'}
          accessibilityRole="button"
        >
          <Text style={[typography.body, styles.rowLabel]}>{t('settings.units')}</Text>
          <Text style={[typography.body, styles.rowValue]}>{units === 'km' ? t('settings.km') : t('settings.miles')}</Text>
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={[typography.body, styles.rowLabel]}>{t('settings.theme')}</Text>
          <Text style={[typography.body, styles.rowValue]}>{t('settings.dark')}</Text>
        </View>
      </View>

      {/* About */}
      <Text style={styles.sectionHeader}>{t('settings.about')}</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={[typography.body, styles.rowLabel]}>{t('settings.version')}</Text>
          <Text style={[typography.body, styles.rowValue]}>1.0.0</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.aboutRow}>
          <Text style={[typography.caption, styles.aboutText]}>
            SkyAtlas — Discover the world from above
          </Text>
        </View>
      </View>

      {/* Dev Tools */}
      {__DEV__ && (
        <>
          <Text style={styles.sectionHeader}>Dev Tools</Text>
          <View style={styles.section}>
            <Pressable style={styles.devButton} onPress={() => nav.navigate('Simulator')}>
              <Text style={styles.devButtonText}>Open Simulator</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  rowLabel: { color: colors.text },
  rowValue: { color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  aboutRow: { paddingHorizontal: 16, paddingVertical: 12 },
  aboutText: { textAlign: 'center', lineHeight: 18 },
  devButton: {
    margin: 16,
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  devButtonText: { color: colors.accent, fontWeight: '600' }
});
