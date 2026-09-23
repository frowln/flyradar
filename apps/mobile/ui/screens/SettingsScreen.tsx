import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Animated, Linking } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, DataSmall } from '../design/type';
import { Screen, Gutter, Space, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import AppleSignIn from '../components/AppleSignIn';
import { isProCached } from '../../src/core/monetization/entitlement';
import { collectionsStore } from '../../src/core/gamification/collections';
import { setTheme, getTheme } from '../../src/theme/colors';
import { setLocale, getLocale, SUPPORTED_LOCALES, t } from '../../src/i18n';
import { haptics } from '../../src/core/ux/haptics';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  ja: '日本語'
};

/**
 * Settings, as an instrument panel rather than a preferences pane.
 *
 * State is shown as a mono value on the right and cycled by tapping the row.
 * A platform Switch would import a second visual language — rounded, filled,
 * animated — into a product built entirely from rules and monospace, and it
 * would be the only such object in the app.
 */
function SettingRow({
  label,
  value,
  onPress,
  accent = false
}: {
  label: string;
  value: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <PressSurface
      onPress={() => {
        haptics.light?.();
        onPress();
      }}
      accessibilityLabel={`${label}: ${value}`}
      style={styles.row}
    >
      <Body style={styles.rowLabel}>{label}</Body>
      <View style={styles.fill} />
      <DataSmall tone={accent ? 'accent' : 'muted'} allowFontScaling={false}>
        {value}
      </DataSmall>
    </PressSurface>
  );
}

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const reveal = useReveal();

  const [pro, setProState] = useState(isProCached());
  const [locale, setLoc] = useState(getLocale().slice(0, 2));
  const [units, setUnits] = useState(collectionsStore.getUnits());
  const [theme, setThm] = useState(getTheme());
  const [kids, setKids] = useState(collectionsStore.isKidsMode());
  const [sound, setSound] = useState(collectionsStore.getSoundEnabled());
  const [facts, setFacts] = useState(collectionsStore.getDailyFactsEnabled());

  // Coming back from the paywall having bought: the row has to say so.
  useFocusEffect(
    useCallback(() => {
      setProState(isProCached());
    }, [])
  );

  const cycleLocale = useCallback(() => {
    const list = SUPPORTED_LOCALES as unknown as string[];
    const next = list[(list.indexOf(locale) + 1) % list.length]!;
    setLocale(next);
    collectionsStore.setLanguage(next);
    setLoc(next);
  }, [locale]);

  const onOff = (v: boolean) => (v ? t('common.on') : t('common.off'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter style={styles.head}>
            <Label tone="dim">{t('nav.settings')}</Label>
            <PressSurface
              onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
              accessibilityLabel={t('common.done')}
              style={styles.close}
            >
              <Label tone="accent">{t('common.done')}</Label>
            </PressSurface>
          </Gutter>

          <Space h={s.x5} />
          <Gutter>
            <Display>{t('settings.preferences')}</Display>
          </Gutter>

          <Space h={s.x6} />
          <AppleSignIn />

          {/* The only entry to the paywall that does not require hitting a
              limit first. Apple's reviewers look for it, and so does anyone who
              simply decided to pay. */}
          <Space h={s.x8} />
          <Rule />
          <SettingRow
            label={t('settings.pro')}
            value={pro ? t('settings.proActive') : t('settings.proInactive')}
            accent={pro}
            onPress={() => nav.navigate('Paywall')}
          />

          <Space h={s.x8} />
          <Rule />
          <SettingRow label={t('settings.language')} value={LOCALE_NAMES[locale] ?? locale} onPress={cycleLocale} />
          <SettingRow
            label={t('settings.units')}
            value={units === 'km' ? t('settings.km') : t('settings.miles')}
            onPress={() => {
              const next = units === 'km' ? 'miles' : 'km';
              collectionsStore.setUnits(next);
              setUnits(next);
            }}
          />
          <SettingRow
            label={t('settings.theme')}
            value={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
            onPress={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              setThm(next);
            }}
          />
          <SettingRow
            label={t('settings.kidsMode')}
            value={onOff(kids)}
            accent={kids}
            onPress={() => {
              collectionsStore.setKidsMode(!kids);
              setKids(!kids);
            }}
          />
          <SettingRow
            label={t('settings.soundEffectsPlain')}
            value={onOff(sound)}
            accent={sound}
            onPress={() => {
              collectionsStore.setSoundEnabled(!sound);
              setSound(!sound);
            }}
          />
          <SettingRow
            label={t('settings.dailyFacts')}
            value={onOff(facts)}
            accent={facts}
            onPress={() => {
              collectionsStore.setDailyFactsEnabled(!facts);
              setFacts(!facts);
            }}
          />
          <Rule />

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim">{t('settings.legal')}</Label>
          </Gutter>
          <Space h={s.x3} />
          <Rule soft />
          <SettingRow
            label={t('settings.privacyPolicy')}
            value="↗"
            onPress={() => Linking.openURL('https://skyatlas.app/privacy').catch(() => {})}
          />
          <SettingRow
            label={t('settings.termsOfService')}
            value="↗"
            onPress={() => Linking.openURL('https://skyatlas.app/terms').catch(() => {})}
          />

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim">{t('settings.creditsTitle')}</Label>
            <Space h={s.x3} />
            <Body tone="dim" style={styles.credit}>
              {t('settings.attributionWikipedia')}
            </Body>
            <Space h={s.x2} />
            <Body tone="dim" style={styles.credit}>
              {t('settings.attributionGeoNames')}
            </Body>
            <Space h={s.x5} />
            <DataSmall tone="dim" allowFontScaling={false}>
              {t('settings.version')} {Constants.expoConfig?.version ?? '1.0.0'}
            </DataSmall>
          </Gutter>
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: s.x8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: s.x3 },
  close: { paddingVertical: s.x2, paddingLeft: s.x4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  rowLabel: { flexShrink: 1 },
  fill: { flex: 1 },
  credit: { fontSize: 12, lineHeight: 18 }
});
