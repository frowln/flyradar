import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { downloadPackage } from '../core/offline/packageDownloader';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddFlight'>;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddFlightScreen() {
  const nav = useNavigation<Nav>();
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);

  const isValid = flightNumber.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const pkg = await downloadPackage(flightNumber.trim().toUpperCase(), date);
      nav.replace('FlightDetail', { flightId: pkg.flight.id });
    } catch (e: any) {
      Alert.alert(
        'Could not add flight',
        e?.message ?? 'Please check the flight number and date, then try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[typography.h2, styles.sectionTitle]}>Flight Details</Text>

        <Text style={styles.label}>Flight Number</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. SU100, BA249"
          placeholderTextColor={colors.textMuted}
          value={flightNumber}
          onChangeText={setFlightNumber}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="next"
          editable={!loading}
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          editable={!loading}
        />

        <Text style={styles.hint}>
          Add your flight before boarding to download offline content.
        </Text>

        <Pressable
          style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Download & Add Flight</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 8
  },
  sectionTitle: {
    marginBottom: 16
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
    marginBottom: 8
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16
  },
  buttonDisabled: {
    opacity: 0.4
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  }
});
