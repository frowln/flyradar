import { useState, useLayoutEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, s, gutter, line, family } from '../design/tokens';
import { Label, Body, Small, Data } from '../design/type';
import { Screen, Gutter, Row, Space, ActionBar, PressSurface, Rule } from '../design/layout';
import { useReveal } from '../motion';
import { downloadPackage } from '../../src/core/offline/packageDownloader';
import { ApiError } from '../../src/core/api/client';
import BoardingPassScanner from '../../src/components/BoardingPassScanner';
import type { BoardingPassData } from '../../src/components/BoardingPassScanner';
import { parsePkpassFile } from '../../src/core/wallet/pkpassParser';
import { haptics } from '../../src/core/ux/haptics';
import { useToast } from '../../src/components/Toast';
import { t, getLocale } from '../../src/i18n';
import type { RootStackParamList } from '../../src/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddFlight'>;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Adding a flight is one question — which flight — so the screen asks one
 * question. The old form had a labelled field, a date field, a hint, a row of
 * suggestion cards and two emoji buttons competing for the same decision.
 *
 * Here the flight number is the screen: entered at instrument scale, in the
 * mono face the rest of the app uses for codes, so it reads as a designator
 * rather than a text field. Everything else is a quiet row beneath it.
 */
export default function AddFlightScreen() {
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const reveal = useReveal();

  const [code, setCode] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  useLayoutEffect(() => {
    nav.setOptions({ headerShown: false });
  }, [nav]);

  /**
   * Says what went wrong in terms the passenger can act on.
   *
   * "Flight not found" is the same sentence whether the number is mistyped or
   * whether the flight is real but further ahead than the data provider carries
   * — and the second case is the common one, because people add a flight when
   * they book it. When the server reports which dates it does have, say so.
   */
  const explainFailure = useCallback((e: unknown): string => {
    if (e instanceof ApiError && e.status === 404) {
      const dates = e.body['availableDates'];
      if (Array.isArray(dates) && dates.length > 0) {
        const shown = (dates as string[])
          .slice()
          .sort()
          .map((d) => {
            const parsed = new Date(`${d}T00:00:00Z`);
            return Number.isNaN(parsed.getTime())
              ? d
              : parsed.toLocaleDateString(getLocale(), {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC'
                });
          })
          .join(', ');
        return t('addFlight.onlyDates', { dates: shown });
      }
      return t('addFlight.notFound');
    }
    return e instanceof Error ? e.message : t('errors.somethingWrong');
  }, []);

  const submit = useCallback(
    async (flightNumber: string, when: string) => {
      const trimmed = flightNumber.replace(/\s+/g, '').toUpperCase();
      if (!trimmed) return;
      setBusy(true);
      try {
        await downloadPackage(trimmed, when);
        haptics.success();
        // Board is the flight detail in this IA — there is no separate screen to
        // land on, and sending the passenger back to it closes the loop.
        nav.navigate('Tabs');
      } catch (e) {
        haptics.error();
        toast.show(explainFailure(e));
      } finally {
        setBusy(false);
      }
    },
    [nav, toast, explainFailure]
  );

  const onScanned = useCallback(
    (pass: BoardingPassData) => {
      setScanning(false);
      setCode(pass.flightNumber);
      submit(pass.flightNumber, pass.date ?? date);
    },
    [submit, date]
  );

  const importWallet = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const parsed = await parsePkpassFile(picked.assets[0].uri);
      if (!parsed?.flightNumber) {
        toast.show(t('addFlight.walletParseError'));
        return;
      }
      setCode(parsed.flightNumber);
      submit(parsed.flightNumber, parsed.date ?? date);
    } catch {
      toast.show(t('addFlight.walletParseError'));
    }
  }, [submit, toast, date]);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={reveal}>
            <Gutter>
              <Space h={s.x6} />
              <Row style={styles.head}>
                <Label tone="dim">{t('addFlight.title')}</Label>
                <PressSurface
                  onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))}
                  accessibilityLabel={t('common.back')}
                  style={styles.close}
                >
                  <Label tone="muted">{t('common.cancel')}</Label>
                </PressSurface>
              </Row>

              <Space h={s.x8} />
              <Label tone="accent">{t('addFlight.flightNumber')}</Label>
              <Space h={s.x3} />

              {/* The designator itself — the only thing on the screen at scale. */}
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                placeholder="SQ 322"
                placeholderTextColor={palette.inkDim}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => submit(code, date)}
                style={styles.code}
                accessibilityLabel={t('addFlight.flightNumber')}
              />
            </Gutter>

            <Rule />

            {/* Date is a fact, not a decision — one quiet row, editable in place. */}
            <Gutter style={styles.dateRow}>
              <Label tone="dim">{t('addFlight.date')}</Label>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder={today()}
                placeholderTextColor={palette.inkDim}
                keyboardType="numbers-and-punctuation"
                style={styles.date}
                accessibilityLabel={t('addFlight.date')}
              />
            </Gutter>

            <Rule soft />

            <PressSurface
              onPress={() => setScanning(true)}
              accessibilityLabel={t('addFlight.scan')}
              style={styles.optionRow}
            >
              <Body>{t('addFlight.scanPlain')}</Body>
              <View style={styles.fillRow} />
              <Data tone="dim" allowFontScaling={false}>
                ›
              </Data>
            </PressSurface>

            <PressSurface
              onPress={importWallet}
              accessibilityLabel={t('addFlight.importWallet')}
              style={styles.optionRow}
            >
              <Body>{t('addFlight.importWalletPlain')}</Body>
              <View style={styles.fillRow} />
              <Data tone="dim" allowFontScaling={false}>
                ›
              </Data>
            </PressSurface>

            <Space h={s.x6} />
            <Gutter>
              <Small style={styles.hint}>{t('addFlight.hint')}</Small>
            </Gutter>
          </Animated.View>
        </ScrollView>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={palette.amber} />
            <Space h={s.x3} />
            <Label tone="muted">{t('common.loading')}</Label>
          </View>
        ) : (
          <ActionBar
            label={t('addFlight.download')}
            onPress={() => submit(code, date)}
            tone={code.trim() ? 'accent' : 'quiet'}
          />
        )}
      </KeyboardAvoidingView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <BoardingPassScanner onScan={onScanned} onClose={() => setScanning(false)} />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: s.x8 },
  head: { justifyContent: 'space-between' },
  close: { paddingVertical: s.x1, paddingLeft: s.x4 },

  code: {
    fontFamily: family.dataMid,
    fontSize: 46,
    lineHeight: 54,
    letterSpacing: -1,
    color: palette.ink,
    paddingVertical: s.x2,
    paddingBottom: s.x5
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s.x3
  },
  date: {
    fontFamily: family.data,
    fontSize: 15,
    color: palette.ink,
    textAlign: 'right',
    minWidth: 130,
    paddingVertical: s.x1
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s.x3,
    paddingHorizontal: gutter,
    paddingVertical: s.x4,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  fillRow: { flex: 1 },
  hint: { maxWidth: 330 },

  busy: {
    alignItems: 'center',
    paddingTop: s.x4,
    paddingBottom: s.x8,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule,
    backgroundColor: palette.raised
  }
});
