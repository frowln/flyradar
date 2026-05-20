import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { t } from '../i18n';
import { downloadPackage } from '../core/offline/packageDownloader';
import BoardingPassScanner from '../components/BoardingPassScanner';
import type { BoardingPassData } from '../components/BoardingPassScanner';
import type { RootStackParamList } from '../navigation/types';
import { haptics } from '../core/ux/haptics';
import { useToast } from '../components/Toast';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddFlight'>;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddFlightScreen() {
  const nav = useNavigation<Nav>();
  const [flightNumber, setFlightNumber] = useState('');
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const toast = useToast();

  const isValid = flightNumber.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const handleScan = (data: BoardingPassData) => {
    setFlightNumber(data.flightNumber);
    setDate(data.date);
    setShowScanner(false);
  };

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    haptics.medium();
    setLoading(true);
    try {
      const pkg = await downloadPackage(flightNumber.trim().toUpperCase(), date);
      haptics.success();
      nav.replace('FlightDetail', { flightId: pkg.flight.id });
    } catch (e: any) {
      haptics.error();
      toast.show(e?.message ?? 'Please check the flight number and date, then try again.', 'error');
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
        <Text style={[typography.h2, styles.sectionTitle]}>{t('addFlight.sectionTitle')}</Text>

        <Text style={styles.label}>{t('addFlight.flightNumber')}</Text>
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

        <Text style={styles.label}>{t('addFlight.date')}</Text>
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

        <Text style={styles.hint}>{t('addFlight.hint')}</Text>

        <Pressable
          style={[styles.scanButton]}
          onPress={() => setShowScanner(true)}
          disabled={loading}
        >
          <Text style={styles.scanButtonText}>{t('addFlight.scan')}</Text>
        </Pressable>

        <Pressable
          style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>{t('addFlight.download')}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <BoardingPassScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      </Modal>
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
  },
  scanButton: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8
  },
  scanButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600'
  }
});
