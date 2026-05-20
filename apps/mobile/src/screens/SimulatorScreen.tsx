import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { downloadPackage } from '../core/offline/packageDownloader';
import { useFlightStore } from '../core/flight/flightStore';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Simulator'>;

const DEMO_FLIGHT = 'DEMO123';
const MULTIPLIERS = [1, 10, 60, 600] as const;

const STEPS = [
  { num: '1️⃣', key: 'step1' as const },
  { num: '2️⃣', key: 'step2' as const },
  { num: '3️⃣', key: 'step3' as const },
  { num: '4️⃣', key: 'step4' as const },
] as const;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SimulatorScreen() {
  const nav = useNavigation<Nav>();
  const { confirmTakeoff, setPackage, setTimeMultiplier, timeMultiplier } = useFlightStore();
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOneTapDemo = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const pkg = await downloadPackage('DEMO999', today);
      const takeoffAt = new Date(Date.now() - 30 * 60 * 1000);
      setPackage(pkg);
      confirmTakeoff(takeoffAt);
      setTimeMultiplier(60);
      nav.replace('InFlight', { flightId: pkg.flight.id });
    } catch (e: any) {
      Alert.alert('Demo failed', e.message);
    }
  };

  async function spawnDemoFlight() {
    setSpawning(true);
    setError(null);
    try {
      const pkg = await downloadPackage(DEMO_FLIGHT, todayString());
      setPackage(pkg);
      confirmTakeoff(new Date());
      nav.navigate('InFlight', { flightId: pkg.flight.id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('simulator.spawnError'));
    } finally {
      setSpawning(false);
    }
  }

  function jumpToProgress(fraction: number) {
    const { activePackage } = useFlightStore.getState();
    if (!activePackage) {
      setError(t('simulator.noActiveFlight'));
      return;
    }
    const lastPoint = activePackage.route[activePackage.route.length - 1];
    const totalSec = lastPoint.elapsedSeconds;
    const targetSec = totalSec * fraction;
    const simulatedTakeoff = new Date(Date.now() - targetSec * 1000);
    confirmTakeoff(simulatedTakeoff);
    setError(null);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.devBadge}>
        <Text style={styles.devBadgeText}>{t('simulator.devTool')}</Text>
      </View>

      <Text style={[typography.h2, styles.heading]}>{t('simulator.title')}</Text>
      <Text style={[typography.body, styles.subtitle]}>{t('simulator.subtitle')}</Text>

      {/* Step-by-step guide */}
      <View style={styles.guideCard}>
        <Text style={styles.guideTitle}>🎬 {t('simulator.tryExperience')}</Text>
        <View style={styles.guideDivider} />
        {STEPS.map((step) => (
          <View key={step.key} style={styles.stepRow}>
            <Text style={styles.stepNum}>{step.num}</Text>
            <Text style={styles.stepText}>{t(`simulator.${step.key}`)}</Text>
          </View>
        ))}
      </View>

      {/* One-tap demo — primary CTA */}
      <Pressable style={styles.oneTapButton} onPress={handleOneTapDemo}>
        <Text style={styles.oneTapButtonText}>{t('simulator.oneTap')}</Text>
        <Text style={styles.oneTapButtonSub}>Spawns demo • 30 min in • 60× speed</Text>
      </Pressable>

      {/* Manual controls separator */}
      <View style={styles.separatorRow}>
        <View style={styles.separatorLine} />
        <Text style={styles.separatorText}>{t('simulator.manualControls')}</Text>
        <View style={styles.separatorLine} />
      </View>

      {/* Spawn demo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('simulator.spawnDemo')}</Text>
        <Pressable style={styles.primaryButton} onPress={spawnDemoFlight} disabled={spawning}>
          {spawning
            ? <ActivityIndicator color={colors.text} />
            : <Text style={styles.primaryButtonText}>{t('simulator.spawnButton', { flightId: DEMO_FLIGHT })}</Text>
          }
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {/* Jump to progress */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('simulator.jumpTo')}</Text>
        <Text style={[typography.caption, styles.sectionNote]}>{t('simulator.jumpNote')}</Text>
        <View style={styles.buttonRow}>
          {([0.25, 0.5, 0.75, 1.0] as const).map((frac) => (
            <Pressable
              key={frac}
              style={styles.jumpButton}
              onPress={() => frac === 1.0 ? jumpToProgress(0.999) : jumpToProgress(frac)}
            >
              <Text style={styles.jumpButtonText}>
                {frac === 1.0 ? t('simulator.landed') : `${frac * 100}%`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Time multiplier */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('simulator.timeSpeed')}</Text>
        <Text style={[typography.caption, styles.sectionNote]}>{t('simulator.timeSpeedNote')}</Text>
        <View style={styles.buttonRow}>
          {MULTIPLIERS.map((m) => (
            <Pressable
              key={m}
              style={[styles.multiplierButton, timeMultiplier === m && styles.multiplierButtonActive]}
              onPress={() => setTimeMultiplier(m)}
            >
              <Text style={[styles.multiplierButtonText, timeMultiplier === m && styles.multiplierButtonTextActive]}>
                {m}×
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  devBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  devBadgeText: { color: colors.bg, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  heading: { marginTop: 4 },
  subtitle: { color: colors.textMuted, lineHeight: 22, marginTop: -8 },

  guideCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10
  },
  guideTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  guideDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  stepNum: { fontSize: 18, lineHeight: 24 },
  stepText: { color: colors.text, fontSize: 14, lineHeight: 22, flex: 1 },

  oneTapButton: {
    backgroundColor: colors.accent,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 4,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6
  },
  oneTapButtonText: { color: colors.bg, fontWeight: '800', fontSize: 20 },
  oneTapButtonSub: { color: colors.bg, fontSize: 12, opacity: 0.75 },

  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: -4
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: colors.border },
  separatorText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sectionNote: { marginTop: -4 },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  primaryButtonText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  error: { color: colors.error, fontSize: 13 },
  buttonRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  jumpButton: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  jumpButtonText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  multiplierButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated
  },
  multiplierButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  multiplierButtonText: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  multiplierButtonTextActive: { color: colors.text }
});
