import { View, Text, Pressable, StyleSheet, Share, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { t } from '../i18n';

const REFERRAL_CODE = 'SKY-A7K2-9MQ3';

export default function ReferralScreen() {
  async function handleShare() {
    try {
      await Share.share({
        message: `Join me on SkyAtlas — discover the world from above on every flight! Use my code ${REFERRAL_CODE} and we both get a free month of Pro. https://skyatlas.app/invite/${REFERRAL_CODE}`
      });
    } catch {
      Alert.alert(t('referral.shareError'), 'Please try again.');
    }
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🤝</Text>
        <Text style={[typography.h1, styles.heading]}>{t('referral.title')}</Text>
        <Text style={[typography.body, styles.subtitle]}>{t('referral.subtitle')}</Text>
      </View>

      {/* Code */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>{t('referral.yourCode')}</Text>
        <Text style={styles.code}>{REFERRAL_CODE}</Text>
      </View>

      {/* Share button */}
      <Pressable style={styles.shareButton} onPress={handleShare}>
        <Text style={styles.shareButtonText}>{t('referral.shareButton')}</Text>
      </Pressable>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>{t('referral.friendsInvited')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>{t('referral.freeMonthsEarned')}</Text>
        </View>
      </View>

      {/* Explainer steps */}
      <View style={styles.steps}>
        <Step number="1" text={t('referral.step1')} />
        <Step number="2" text={t('referral.step2')} />
        <Step number="3" text={t('referral.step3')} />
      </View>
    </View>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={[typography.body, styles.stepText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    gap: 20
  },
  hero: { alignItems: 'center', gap: 12, marginTop: 8 },
  heroIcon: { fontSize: 52 },
  heading: { textAlign: 'center', lineHeight: 36 },
  subtitle: {
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16
  },
  codeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  code: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2
  },
  shareButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center'
  },
  shareButtonText: { color: colors.text, fontWeight: '700', fontSize: 17 },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  statDivider: { width: 1, backgroundColor: colors.border },
  steps: { gap: 14 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0
  },
  stepNumberText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  stepText: { flex: 1, color: colors.textMuted, lineHeight: 22, paddingTop: 3 }
});
