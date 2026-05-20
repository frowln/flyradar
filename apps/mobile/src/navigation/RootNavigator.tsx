import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { t } from '../i18n';
import type { RootStackParamList } from './types';

import OnboardingScreen, { hasCompletedOnboarding } from '../screens/OnboardingScreen';
import TabNavigator from './TabNavigator';
import AddFlightScreen from '../screens/AddFlightScreen';
import FlightDetailScreen from '../screens/FlightDetailScreen';
import InFlightScreen from '../screens/InFlightScreen';
import POIDetailScreen from '../screens/POIDetailScreen';
import FlightSummaryScreen from '../screens/FlightSummaryScreen';
import CollectionScreen from '../screens/CollectionScreen';
import PaywallScreen from '../screens/PaywallScreen';
import WrappedScreen from '../screens/WrappedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SimulatorScreen from '../screens/SimulatorScreen';
import ReferralScreen from '../screens/ReferralScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasCompletedOnboarding() ? 'Tabs' : 'Onboarding'}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          headerBackTitle: '',
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: 250
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false, animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="AddFlight" component={AddFlightScreen} options={{ title: t('nav.addFlight') }} />
        <Stack.Screen name="FlightDetail" component={FlightDetailScreen} options={{ title: t('nav.flightDetail') }} />
        <Stack.Screen name="InFlight" component={InFlightScreen} options={{ headerShown: false }} />
        <Stack.Screen name="POIDetail" component={POIDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="FlightSummary" component={FlightSummaryScreen} options={{ title: t('nav.flightDetail') }} />
        <Stack.Screen name="Collection" component={CollectionScreen} options={{ title: t('nav.collection') }} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ title: t('nav.paywall'), animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="Wrapped" component={WrappedScreen} options={{ headerShown: false, animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
        <Stack.Screen name="Simulator" component={SimulatorScreen} options={{ title: t('nav.simulator') }} />
        <Stack.Screen name="Referral" component={ReferralScreen} options={{ title: t('nav.referral') }} />
        <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: t('nav.leaderboard') || 'Leaderboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
