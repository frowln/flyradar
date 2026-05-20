import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { apiClient } from '../core/api/client';
import type { RootStackParamList } from '../navigation/types';
import type { OfflinePackage } from '@skyatlas/shared';
import { t } from '../i18n';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Tabs'>;

export default function BrowseScreen() {
  const nav = useNavigation<Nav>();
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OfflinePackage | null>(null);

  async function handleSearch() {
    if (!flightNumber.trim() || !date.trim()) {
      setError(t('browse.validationError'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post<OfflinePackage>('/flights/lookup', {
        flightNumber: flightNumber.trim().toUpperCase(),
        date: date.trim()
      });
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Flight not found.';
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[typography.h2, styles.heading]}>{t('browse.title')}</Text>
        <Text style={[typography.body, styles.subtitle]}>{t('browse.subtitle')}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('browse.flightNumberLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('browse.flightNumberPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={flightNumber}
            onChangeText={setFlightNumber}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>{t('browse.dateLabel')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('browse.datePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={loading}
            accessibilityLabel="Search for flight"
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color={colors.text} />
              : <Text style={styles.searchButtonText}>{t('browse.search')}</Text>
            }
          </Pressable>
        </View>

        {result && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.flightNumber}>{result.flight.flightNumber}</Text>
              <Text style={[typography.caption]}>{result.pois.length} {t('browse.placesToDiscover')}</Text>
            </View>
            <View style={styles.routeRow}>
              <View>
                <Text style={styles.iata}>{result.flight.origin.iata}</Text>
                <Text style={[typography.caption]}>{result.flight.origin.city}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.destBlock}>
                <Text style={styles.iata}>{result.flight.destination.iata}</Text>
                <Text style={[typography.caption]}>{result.flight.destination.city}</Text>
              </View>
            </View>

            <Pressable
              style={styles.addButton}
              onPress={() => nav.navigate('AddFlight')}
              accessibilityLabel="Add new flight"
              accessibilityRole="button"
            >
              <Text style={styles.addButtonText}>{t('browse.addToMyFlights')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  heading: { marginBottom: 4 },
  subtitle: { color: colors.textMuted, lineHeight: 22, marginBottom: 8 },
  form: { gap: 10 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16
  },
  error: { color: colors.error, fontSize: 13 },
  searchButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4
  },
  searchButtonText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  flightNumber: { color: colors.text, fontSize: 18, fontWeight: '700' },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iata: { color: colors.text, fontSize: 22, fontWeight: '700' },
  destBlock: { alignItems: 'flex-end' },
  arrow: { flex: 1, textAlign: 'center', color: colors.primary, fontSize: 20 },
  addButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  addButtonText: { color: colors.primary, fontWeight: '600', fontSize: 15 }
});
