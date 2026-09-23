import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold
} from '@expo-google-fonts/manrope';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  NotoSansJP_400Regular,
  NotoSansJP_500Medium,
  NotoSansJP_700Bold
} from '@expo-google-fonts/noto-sans-jp';
import * as SplashScreen from 'expo-splash-screen';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { social } from './src/core/api/social';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from './src/components/Toast';
import AchievementToast from './src/components/AchievementToast';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initNotifications } from './src/core/ux/notifications';
import { initSounds } from './src/core/ux/sounds';
import { collectionsStore } from './src/core/gamification/collections';
import { initSentry, SentryWrapper } from './src/core/observability/sentry';
import { initAnalytics } from './src/core/analytics';
import { restoreFromiCloud } from './src/core/cloud/iCloudBackup';
import { initRevenueCat } from './src/core/monetization/revenueCat';
import { refreshPro } from './src/core/monetization/entitlement';
import { scheduleDailyFact } from './src/core/ux/dailyFacts';

SplashScreen.preventAutoHideAsync();
collectionsStore.markInstalled();
initSentry();
initAnalytics();

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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

  useEffect(() => {
    initNotifications().then(() => {
      scheduleDailyFact().catch(() => {});
    });
    initSounds().catch(() => {});
    // Discoveries made at cruise were queued with no signal; send them now.
    // Without this they would sit on the device forever and the global counters
    // would only ever reflect passengers who happened to have Wi-Fi.
    social.flushPending().catch(() => {});
    // Purchases must be configured before any screen asks about entitlements,
    // and the cached "pro" flag reconciled with the store on every launch — a
    // lapsed or refunded subscription has to close the gate again.
    initRevenueCat()
      .then(() => refreshPro())
      .catch(() => {});
    // Attempt iCloud restore on mount — no-op on Android/web or if cloud is older
    restoreFromiCloud().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsSettled) {
      SplashScreen.hideAsync();
    }
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <ErrorBoundary>
      {/* Without this provider useSafeAreaInsets() silently returns zeros, and
          every screen that pads itself against the notch lands underneath it. */}
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <StatusBar style="light" backgroundColor={colors.bg} />
          <RootNavigator />
          <Toast />
          <AchievementToast />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Only wrap with Sentry when DSN is configured — otherwise wrap is a no-op that warns
const SENTRY_DSN = process.env['EXPO_PUBLIC_SENTRY_DSN'];
export default SENTRY_DSN ? SentryWrapper(App) : App;
