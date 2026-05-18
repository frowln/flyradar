import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { getOfferings, purchasePackage, restorePurchases } from '../core/monetization/revenueCat';
import { analytics } from '../core/analytics';

const FEATURES = [
  { icon: '🗺️', text: 'Unlimited POI discoveries per flight' },
  { icon: '🏆', text: 'Full achievements & collections' },
  { icon: '📜', text: 'Complete flight history' },
  { icon: '🌍', text: 'World map with all your flight tracks' },
  { icon: '📊', text: 'Detailed lifetime statistics' },
  { icon: '📷', text: 'High-resolution photos' }
];

export default function PaywallScreen() {
  const nav = useNavigation();
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);

  useEffect(() => {
    analytics.track('paywall_shown');
    getOfferings().then((pkgs) => {
      setPackages(pkgs);
      if (pkgs.length > 0) setSelectedPkg(pkgs[0]);
    }).finally(() => setLoading(false));
  }, []);

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    try {
      const success = await purchasePackage(selectedPkg);
      if (success) {
        Alert.alert('Welcome to SkyAtlas Pro! 🎉', 'Enjoy unlimited discoveries.', [
          { text: 'Let\'s Go!', onPress: () => nav.goBack() }
        ]);
      }
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const success = await restorePurchases();
      Alert.alert(
        success ? 'Restored! ✓' : 'Nothing to restore',
        success ? 'Your Pro access has been restored.' : 'No previous purchases found.'
      );
      if (success) nav.goBack();
    } catch {
      Alert.alert('Restore failed', 'Please try again later.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heroIcon}>✈️</Text>
        <Text style={[typography.h1, styles.title]}>SkyAtlas Pro</Text>
        <Text style={styles.subtitle}>Explore the world without limits</Text>
      </View>

      {/* Features */}
      <View style={styles.featuresCard}>
        {FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* Package picker */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : packages.length === 0 ? (
        <View style={styles.noPackages}>
          <Text style={styles.noPackagesText}>
            Pricing unavailable. Please check your connection.
          </Text>
        </View>
      ) : (
        <View style={styles.packages}>
          {packages.map((pkg) => {
            const isSelected = pkg.identifier === selectedPkg?.identifier;
            return (
              <Pressable
                key={pkg.identifier}
                style={[styles.packageCard, isSelected && styles.packageCardSelected]}
                onPress={() => setSelectedPkg(pkg)}
              >
                <View style={styles.packageInfo}>
                  <Text style={styles.packageTitle}>{pkg.packageType}</Text>
                  <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
                </View>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* CTA */}
      <Pressable
        style={[styles.ctaButton, (purchasing || !selectedPkg) && styles.ctaDisabled]}
        onPress={handlePurchase}
        disabled={purchasing || !selectedPkg}
      >
        {purchasing ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.ctaText}>Get SkyAtlas Pro</Text>
        )}
      </Pressable>

      <Pressable onPress={handleRestore} disabled={purchasing} style={styles.restoreButton}>
        <Text style={styles.restoreText}>Restore purchases</Text>
      </Pressable>

      <Text style={styles.legal}>
        Payment will be charged to your App Store / Google Play account. Subscription auto-renews unless cancelled.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  header: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  heroIcon: { fontSize: 48 },
  title: { textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },

  featuresCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    gap: 12, borderWidth: 1, borderColor: colors.border
  },
  featureRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  featureIcon: { fontSize: 18, width: 24 },
  featureText: { color: colors.text, fontSize: 14, flex: 1 },

  packages: { gap: 10 },
  packageCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border
  },
  packageCardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}18` },
  packageInfo: { gap: 2 },
  packageTitle: { color: colors.text, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  packagePrice: { color: colors.textMuted, fontSize: 13 },
  checkmark: { color: colors.primary, fontSize: 18, fontWeight: '700' },

  noPackages: { padding: 16, alignItems: 'center' },
  noPackagesText: { color: colors.textMuted, textAlign: 'center' },

  ctaButton: {
    backgroundColor: colors.primary, padding: 18, borderRadius: 16, alignItems: 'center'
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: colors.text, fontSize: 17, fontWeight: '700' },

  restoreButton: { alignItems: 'center', padding: 8 },
  restoreText: { color: colors.textMuted, fontSize: 14 },

  legal: { color: colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16 }
});
