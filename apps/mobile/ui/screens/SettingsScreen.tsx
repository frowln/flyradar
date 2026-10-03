import { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import appConfig from '../../app.json';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body, DataSmall, Small, Title, typeStyles } from '../design/type';
import { Screen, Gutter, Space, PressSurface, Rule, textHitSlop } from '../design/layout';
import AppleSignIn from '../components/AppleSignIn';
import { settings, type AlertLevel, type Units } from '../../src/core/settings';
import { isProCached } from '../../src/core/monetization/entitlement';
import { PAYWALL_VISIBLE } from '../../src/core/monetization/revenueCat';
import { SOCIAL_ENABLED } from '../../src/core/features';
import { notificationPermission } from '../../src/core/ux/notifications';
import { gpsPermission } from '../../src/core/flight/gps';
import { clearJournal } from '../../src/core/game/journal';
import { setLocale, getLocale, SUPPORTED_LOCALES, t } from '../../src/i18n';
import { haptics } from '../../src/core/ux/haptics';
import { refreshReminders } from '../../src/core/flight/controller';
import { legalUrl } from '../../src/core/links';
import { API_ENABLED } from '../../src/core/api/client';
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

const ALERTS: AlertLevel[] = ['few', 'more', 'off'];

/**
 * Settings, as an instrument panel rather than a preferences pane: state is a
 * mono value on the right, cycled by tapping the row. Every row here changes
 * what the app does — there are no switches that nothing reads.
 *
 * To a screen reader, an on/off row is a switch ("Refine with GPS, switch, on")
 * and a row that cycles through more values reads as "Alerts in flight, best 3".
 */
function SettingRow({
  label,
  value,
  onPress,
  hint,
  checked
}: {
  label: string;
  value: string;
  onPress: () => void;
  hint?: string;
  /** Set for binary rows: they are announced as a switch with this state. */
  checked?: boolean;
}) {
  const binary = checked !== undefined;
  return (
    <PressSurface
      onPress={() => {
        haptics.selection?.();
        onPress();
      }}
      accessibilityRole={binary ? 'switch' : 'button'}
      accessibilityState={binary ? { checked } : undefined}
      accessibilityLabel={binary ? label : `${label}, ${value}`}
      accessibilityHint={hint}
      style={styles.row}
    >
      <View style={styles.flex}>
        <Body>{label}</Body>
        {hint ? <Small>{hint}</Small> : null}
      </View>
      <DataSmall tone="accent" style={typeStyles.trailing}>
        {value}
      </DataSmall>
    </PressSurface>
  );
}

/** `external` rows open the browser and are announced as links, not buttons. */
function LinkRow({ label, onPress, external }: { label: string; onPress: () => void; external?: boolean }) {
  return (
    <PressSurface onPress={onPress} accessibilityLabel={label} accessibilityRole={external ? 'link' : 'button'} style={styles.row}>
      <Body style={styles.flex}>{label}</Body>
      <DataSmall allowFontScaling={false}>›</DataSmall>
    </PressSurface>
  );
}

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const [locale, setLoc] = useState(getLocale().slice(0, 2));
  const [units, setUnitsState] = useState<Units>(settings.getUnits());
  const [alerts, setAlertsState] = useState<AlertLevel>(settings.getAlerts());
  const [gps, setGps] = useState(settings.getUseGps());
  const [guessing, setGuessing] = useState(settings.getGuessing());
  const [narration, setNarration] = useState(settings.getNarration());
  const [notif, setNotif] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      notificationPermission(false).then(setNotif);
    }, [])
  );

  const cycleLocale = () => {
    const i = SUPPORTED_LOCALES.indexOf(locale as (typeof SUPPORTED_LOCALES)[number]);
    const next = SUPPORTED_LOCALES[(i + 1) % SUPPORTED_LOCALES.length]!;
    setLocale(next);
    setLoc(next);
    // Reminders already scheduled were written in the old language.
    refreshReminders().catch(() => {});
    // Screens read strings at render; a reset re-renders the whole tree in the new language.
    nav.reset({ index: 0, routes: [{ name: 'Tabs', params: { screen: 'Atlas' } }, { name: 'Settings' }] });
  };

  const version = appConfig.expo.version;

  return (
    <Screen>
      <View style={styles.top}>
        <PressSurface onPress={() => nav.goBack()} accessibilityLabel={t('common.back')} hitSlop={textHitSlop} style={styles.back}>
          <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
        </PressSurface>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gutter>
          <Space h={s.x4} />
          <Title accessibilityRole="header">{t('settings.title')}</Title>
        </Gutter>

        <Gutter style={styles.section}>
          <Label tone="dim" accessibilityRole="header">{t('settings.general')}</Label>
        </Gutter>
        <Rule />
        <SettingRow label={t('settings.language')} value={LOCALE_NAMES[locale] ?? locale} onPress={cycleLocale} />
        <SettingRow
          label={t('settings.units')}
          value={t(`settings.units_${units}`)}
          onPress={() => {
            const next: Units = units === 'metric' ? 'imperial' : 'metric';
            settings.setUnits(next);
            setUnitsState(next);
          }}
        />

        <Gutter style={styles.section}>
          <Label tone="dim" accessibilityRole="header">{t('settings.inFlight')}</Label>
        </Gutter>
        <Rule />
        <SettingRow
          label={t('settings.alerts')}
          hint={t(`settings.alerts_${alerts}_hint`)}
          value={t(`settings.alerts_${alerts}`)}
          onPress={() => {
            const next = ALERTS[(ALERTS.indexOf(alerts) + 1) % ALERTS.length]!;
            settings.setAlerts(next);
            setAlertsState(next);
            // "Off" silences the ground reminders too; turning back on restores them.
            if (next !== 'off') notificationPermission(true).then(setNotif).then(() => refreshReminders()).catch(() => {});
            else refreshReminders().catch(() => {});
          }}
        />
        {notif === false && alerts !== 'off' ? (
          <Gutter style={styles.warn}>
            <Small tone="accent">{t('settings.notificationsOff')}</Small>
          </Gutter>
        ) : null}
        <SettingRow
          label={t('settings.gps')}
          hint={t('settings.gpsHint')}
          value={gps ? t('settings.on') : t('settings.off')}
          checked={gps}
          onPress={() => {
            const next = !gps;
            settings.setUseGps(next);
            setGps(next);
            if (next) gpsPermission(true);
          }}
        />

        <SettingRow
          label={t('settings.guessing')}
          hint={t('settings.guessingHint')}
          value={guessing ? t('settings.on') : t('settings.off')}
          checked={guessing}
          onPress={() => {
            settings.setGuessing(!guessing);
            setGuessing(!guessing);
          }}
        />
        <SettingRow
          label={t('settings.narration')}
          hint={t('settings.narrationHint')}
          value={narration ? t('settings.on') : t('settings.off')}
          checked={narration}
          onPress={() => {
            settings.setNarration(!narration);
            setNarration(!narration);
          }}
        />

        {PAYWALL_VISIBLE ? (
          <>
            <Gutter style={styles.section}>
              <Label tone="dim" accessibilityRole="header">{t('settings.subscription')}</Label>
            </Gutter>
            <Rule />
            <SettingRow label="SkyAtlas Pro" value={isProCached() ? t('settings.active') : t('settings.free')} onPress={() => nav.navigate('Paywall')} />
          </>
        ) : null}

        {SOCIAL_ENABLED ? (
          <View style={styles.section}>
            <AppleSignIn />
          </View>
        ) : null}

        <Gutter style={styles.section}>
          <Label tone="dim" accessibilityRole="header">{t('settings.about')}</Label>
        </Gutter>
        <Rule />
        <LinkRow label={t('settings.privacy')} onPress={() => Linking.openURL(legalUrl('privacy', locale))} external />
        <LinkRow label={t('settings.terms')} onPress={() => Linking.openURL(legalUrl('terms', locale))} external />
        <LinkRow label={t('settings.licenses')} onPress={() => nav.navigate('Licenses')} />
        <Gutter style={styles.credits}>
          <Label tone="dim" accessibilityRole="header">{t('settings.dataSources')}</Label>
          <Space h={s.x2} />
          <Small>{API_ENABLED ? `${t('settings.credits')} ${t('settings.creditsServices')}` : t('settings.credits')}</Small>
        </Gutter>
        <Rule />
        <PressSurface
          onPress={() =>
            Alert.alert(t('settings.resetTitle'), t('settings.resetBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('settings.reset'), style: 'destructive', onPress: () => clearJournal() }
            ])
          }
          accessibilityLabel={t('settings.reset')}
          style={styles.row}
        >
          <Body tone="bad">{t('settings.reset')}</Body>
        </PressSurface>
        <Rule />
        <Gutter style={styles.version}>
          <DataSmall allowFontScaling={false}>{`SkyAtlas ${version}`}</DataSmall>
        </Gutter>
        <Space h={s.x12} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  back: { paddingVertical: s.x1, paddingRight: s.x4 },
  scroll: { paddingBottom: s.x8 },
  section: { paddingTop: s.x8, paddingBottom: s.x3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  warn: { paddingVertical: s.x2, backgroundColor: palette.warm },
  credits: { paddingVertical: s.x4 },
  version: { paddingVertical: s.x4 }
});
