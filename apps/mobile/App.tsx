import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Each face is imported from its own file. The packages' index modules require
// every weight they ship — nine Noto Sans JP files alone are ~49 MB — and all of
// it would land in the app binary.
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp/400Regular';
import { NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp/500Medium';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './ui/components/Toast';
import ErrorBoundary from './ui/components/ErrorBoundary';
import { palette } from './ui/design/tokens';
import { social } from './src/core/api/social';
import { API_ENABLED } from './src/core/api/client';
import { settings } from './src/core/settings';
import { initSentry, SentryWrapper } from './src/core/observability/sentry';
import { initAnalytics } from './src/core/analytics';
import { initRevenueCat, MONETIZATION_ENABLED } from './src/core/monetization/revenueCat';
import { refreshPro } from './src/core/monetization/entitlement';
import { installPreview } from './src/preview/fixtures';
import { ensureDatasets } from './src/core/data/datasets';

SplashScreen.preventAutoHideAsync().catch(() => {});
settings.markInstalled();
initSentry();
initAnalytics();

// Airports, places and country outlines are read before the first screen, so
// every screen can use them synchronously. A failure still opens the app: the
// screens that need the data show their own error.
const boot = ensureDatasets()
  .catch(() => {})
  .then(() => installPreview());

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
    NotoSansJP_700Bold
  });

  // Render once fonts are ready OR loading has definitively failed. Gating only
  // on `fontsLoaded` leaves the splash screen up forever when a face fails to
  // load; degrading to system fonts is far better than a permanently blank app.
  const fontsSettled = fontsLoaded || fontError != null;
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    boot.finally(() => setBooted(true));
  }, []);
  const ready = fontsSettled && booted;

  useEffect(() => {
    // Discoveries made at cruise were queued with no signal; send them now.
    if (API_ENABLED) social.flushPending().catch(() => {});
    // Purchases are configured only when this build sells anything; the cached
    // entitlement is reconciled with the store, and an unreachable store leaves
    // it untouched rather than revoking it.
    if (MONETIZATION_ENABLED) {
      initRevenueCat()
        .then(() => refreshPro())
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      {/* Without this provider useSafeAreaInsets() silently returns zeros, and
          every screen that pads itself against the notch lands underneath it. */}
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: palette.ground }}>
          <StatusBar style="light" backgroundColor={palette.ground} />
          <RootNavigator />
          <Toast />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Only wrap with Sentry when DSN is configured — otherwise wrap is a no-op that warns
const SENTRY_DSN = process.env['EXPO_PUBLIC_SENTRY_DSN'];
export default SENTRY_DSN ? SentryWrapper(App) : App;
