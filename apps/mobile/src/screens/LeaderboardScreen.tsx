import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { collectionsStore } from '../core/gamification/collections';
import { t } from '../i18n';

export default function LeaderboardScreen() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSignup() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert(t('leaderboard.invalidEmail'));
      return;
    }
    collectionsStore.setLeaderboardEmail(trimmed);
    setSubmitted(true);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.hero}>🏆</Text>
      <Text style={styles.headline}>{t('leaderboard.comingSoonTitle')}</Text>
      <Text style={styles.subtitle}>{t('leaderboard.comingSoonSubtitle')}</Text>

      {submitted ? (
        <View style={styles.thankYouBox}>
          <Text style={styles.thankYouText}>{t('leaderboard.thankYou')}</Text>
        </View>
      ) : (
        <View style={styles.signupBox}>
          <TextInput
            style={styles.input}
            placeholder={t('leaderboard.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.button} onPress={handleSignup}>
            <Text style={styles.buttonText}>{t('leaderboard.notifyMe')}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 24,
    paddingBottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1
  },
  hero: {
    fontSize: 72,
    marginBottom: 24,
    textAlign: 'center'
  },
  headline: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
    maxWidth: 300
  },
  signupBox: {
    width: '100%',
    gap: 12
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  thankYouBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center'
  },
  thankYouText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600'
  }
});
