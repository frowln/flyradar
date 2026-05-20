import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';
import NetworkBanner from './src/components/NetworkBanner';
import AchievementToast from './src/components/AchievementToast';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initNotifications } from './src/core/ux/notifications';

export default function App() {
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style="light" backgroundColor="#0A0E1A" />
      <View style={{ flex: 1 }}>
        <RootNavigator />
        <Toast />
        <NetworkBanner />
        <AchievementToast />
      </View>
    </ErrorBoundary>
  );
}
