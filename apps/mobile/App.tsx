import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Fraunces_700Bold, Fraunces_900Black, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';
import NetworkBanner from './src/components/NetworkBanner';
import AchievementToast from './src/components/AchievementToast';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initNotifications } from './src/core/ux/notifications';
import { collectionsStore } from './src/core/gamification/collections';

SplashScreen.preventAutoHideAsync();
collectionsStore.markInstalled();

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_700Bold,
    Fraunces_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium
  });

  useEffect(() => {
    initNotifications();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <StatusBar style="light" backgroundColor="#0A0B14" />
        <RootNavigator />
        <Toast />
        <NetworkBanner />
        <AchievementToast />
      </View>
    </ErrorBoundary>
  );
}
