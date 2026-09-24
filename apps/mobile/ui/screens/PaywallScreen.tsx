import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line } from '../design/tokens';
import { Display, Label, Body, Data, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Space, ActionBar, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import { getOfferings, purchasePackage, restorePurchases } from '../../src/core/monetization/revenueCat';
import { setPro } from '../../src/core/monetization/entitlement';
import { useToast } from '../components/Toast';
import { haptics } from '../../src/core/ux/haptics';
import { t } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Paywall'>;

/** Fallback tiers, shown when the store has not been reached. */
const TIERS = [
  // Prices shown until the store returns real ones; the store's always win.
  { id: 'trip_pass', price: '$2.99', label: 'tripPass', note: 'tripPassNote' },
  { id: 'annual', price: '$24.99', label: 'annual', note: 'annualNote' }
] as const;

/**
 * Pro, argued rather than sold.
 *
 * The screen names what the free tier actually stops at — five places — and what
 * lifting that costs. No countdown, no crossed-out price, no "most popular"
 * badge: the product is a trust instrument, and a paywall that behaves like a
 * timeshare pitch spends that trust for a few points of conversion.
 */
export default function PaywallScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const reveal = useReveal();

  const [selected, setSelected] = useState<string>('annual');
  const [offerings, setOfferings] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getOfferings()
      .then((packages) => {
        if (!alive || !packages.length) return;
        const byId: Record<string, unknown> = {};
        for (const p of packages) byId[p.identifier] = p;
        setOfferings(byId);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const buy = useCallback(async () => {
    const pkg = offerings?.[selected];
    if (!pkg) {
      // Products live in App Store Connect; without them there is nothing to buy.
      toast.show(t('paywall.unavailable'));
      return;
    }
    setBusy(true);
    try {
      const ok = await purchasePackage(pkg);
      if (ok) {
        // Written before navigating: the screen behind reads the cache on focus.
        setPro(true);
        haptics.success();
        nav.goBack();
      }
    } catch {
      haptics.error();
      toast.show(t('errors.somethingWrong'));
    } finally {
      setBusy(false);
    }
  }, [offerings, selected, nav, toast]);

  const restore = useCallback(async () => {
    const ok = await restorePurchases().catch(() => false);
    if (ok) setPro(true);
    toast.show(ok ? t('paywall.restored') : t('paywall.nothingToRestore'));
    if (ok) nav.goBack();
  }, [nav, toast]);

  const includes = [
    t('paywall.featPlaces'),
    t('paywall.featAtlas'),
    t('paywall.featHistory'),
    t('paywall.featAudio'),
    t('paywall.featWrapped')
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View style={reveal}>
          <Gutter style={styles.head}>
            <Label tone="accent">SKYATLAS PRO</Label>
            <PressSurface
              onPress={() => nav.goBack()}
              accessibilityLabel={t('common.cancel')}
              style={styles.close}
            >
              <Label tone="dim">{t('common.cancel')}</Label>
            </PressSurface>
          </Gutter>

          <Space h={s.x6} />
          <Gutter>
            <Display>{t('paywall.title')}</Display>
            <Space h={s.x3} />
            <Body tone="muted" style={styles.measure}>
              {t('paywall.body')}
            </Body>
          </Gutter>

          <Space h={s.x8} />
          <Rule />
          {includes.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.pip} />
              <Body style={styles.featureText}>{feature}</Body>
            </View>
          ))}
          <Rule />

          <Space h={s.x8} />
          <Gutter>
            <Label tone="dim">{t('paywall.choose')}</Label>
          </Gutter>
          <Space h={s.x3} />

          {TIERS.map((tier) => {
            const live = offerings?.[tier.id];
            const price = live?.product?.priceString ?? tier.price;
            const on = selected === tier.id;
            return (
              <PressSurface
                key={tier.id}
                onPress={() => setSelected(tier.id)}
                accessibilityLabel={`${t(`paywall.${tier.label}`)} ${price}`}
                style={[styles.tier, on && styles.tierOn]}
              >
                <View style={styles.tierText}>
                  <Title tone={on ? 'accent' : 'default'}>{t(`paywall.${tier.label}`)}</Title>
                  <Space h={s.x1} />
                  <DataSmall>{t(`paywall.${tier.note}`)}</DataSmall>
                </View>
                <Data tone={on ? 'accent' : 'muted'} allowFontScaling={false}>
                  {price}
                </Data>
              </PressSurface>
            );
          })}

          <Space h={s.x6} />
          <PressSurface onPress={restore} accessibilityLabel={t('paywall.restore')} style={styles.restore}>
            <Label tone="dim">{t('paywall.restore')}</Label>
          </PressSurface>
        </Animated.View>

        <Space h={s.x12} />
      </ScrollView>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={palette.amber} />
        </View>
      ) : (
        <ActionBar label={t('paywall.subscribe')} onPress={buy} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: s.x4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: s.x3 },
  close: { paddingVertical: s.x2, paddingLeft: s.x4 },
  measure: { maxWidth: 360 },

  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.amber, marginTop: 9 },
  featureText: { flex: 1 },

  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.ruleSoft
  },
  tierOn: { backgroundColor: palette.warm, borderLeftWidth: 2, borderLeftColor: palette.amber },
  tierText: { flex: 1 },

  restore: { alignItems: 'center', paddingVertical: s.x4 },
  busy: {
    alignItems: 'center',
    paddingVertical: s.x6,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule
  }
});
