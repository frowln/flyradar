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
import { parsePkpassFile } from '../core/wallet/pkpassParser';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddFlight'>;

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

const QUICK_ADD_SUGGESTIONS = ['BA249', 'SU100', 'LH400', 'EK201', 'QR007', 'TK1'];

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

  const handleImportWallet = async () => {
    try {
      // expo-document-picker — install with: npx expo install expo-document-picker
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.apple.pkpass', '*/*']
      });
      if (result.canceled) return;
      const parsed = await parsePkpassFile(result.assets[0].uri);
      if (parsed) {
        haptics.success();
        setFlightNumber(parsed.flightNumber);
        setDate(parsed.date);
        toast.show(t('addFlight.walletImported'), 'success');
      } else {
        haptics.error();
        toast.show(t('addFlight.walletParseError'), 'error');
      }
    } catch {
      haptics.error();
      toast.show(t('addFlight.walletParseError'), 'error');
    }
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

        {/* Quick add suggestions */}
        <Text style={styles.label}>Quick Add</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsScroll}
          contentContainerStyle={styles.suggestionsContent}
        >
          {QUICK_ADD_SUGGESTIONS.map((fn) => (
            <Pressable
              key={fn}
              style={styles.suggestionChip}
              onPress={() => setFlightNumber(fn)}
              disabled={loading}
              accessibilityLabel={`Quick add flight ${fn}`}
              accessibilityRole="button"
            >
              <Text style={styles.suggestionText}>{fn}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          style={[styles.walletButton]}
          onPress={handleImportWallet}
          disabled={loading}
          accessibilityLabel="Import from Apple Wallet"
          accessibilityRole="button"
        >
          <Text style={styles.walletButtonText}>{t('addFlight.importWallet')}</Text>
        </Pressable>

        <Pressable
          style={[styles.scanButton]}
          onPress={() => setShowScanner(true)}
          disabled={loading}
          accessibilityLabel="Scan boarding pass"
          accessibilityRole="button"
        >
          <Text style={styles.scanButtonText}>{t('addFlight.scan')}</Text>
        </Pressable>

        <Pressable
          style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || loading}
          accessibilityLabel="Download flight data"
          accessibilityRole="button"
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
  walletButton: {
    backgroundColor: colors.surfaceTinted,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 8
  },
  walletButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600'
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
  },
  suggestionsScroll: {
    marginTop: 6,
    marginHorizontal: -20
  },
  suggestionsContent: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row'
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border
  },
  suggestionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5
  }
});
