import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { View } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import Toast from './src/components/Toast';
import AchievementToast from './src/components/AchievementToast';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initNotifications } from './src/core/ux/notifications';

export default function App() {
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <RootNavigator />
        <Toast />
        <AchievementToast />
      </View>
    </ErrorBoundary>
  );
}
