import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

import OnboardingScreen, { hasCompletedOnboarding } from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import AddFlightScreen from '../screens/AddFlightScreen';
import FlightDetailScreen from '../screens/FlightDetailScreen';
import InFlightScreen from '../screens/InFlightScreen';
import POIDetailScreen from '../screens/POIDetailScreen';
import FlightSummaryScreen from '../screens/FlightSummaryScreen';
import CollectionScreen from '../screens/CollectionScreen';
import PaywallScreen from '../screens/PaywallScreen';
import WrappedScreen from '../screens/WrappedScreen';
import SettingsScreen from '../screens/SettingsScreen';
import BrowseScreen from '../screens/BrowseScreen';
import SimulatorScreen from '../screens/SimulatorScreen';
import WorldMapScreen from '../screens/WorldMapScreen';
import ReferralScreen from '../screens/ReferralScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={hasCompletedOnboarding() ? 'Home' : 'Onboarding'}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg }
        }}
      >
        {!hasCompletedOnboarding() && (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        )}
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My Flights' }} />
        <Stack.Screen name="AddFlight" component={AddFlightScreen} options={{ title: 'Add Flight' }} />
        <Stack.Screen name="FlightDetail" component={FlightDetailScreen} options={{ title: 'Flight Details' }} />
        <Stack.Screen name="InFlight" component={InFlightScreen} options={{ headerShown: false }} />
        <Stack.Screen name="POIDetail" component={POIDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="FlightSummary" component={FlightSummaryScreen} options={{ title: 'Flight Summary' }} />
        <Stack.Screen name="Collection" component={CollectionScreen} options={{ title: 'My Collection' }} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ title: 'SkyAtlas Pro' }} />
        <Stack.Screen name="Wrapped" component={WrappedScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        <Stack.Screen name="Browse" component={BrowseScreen} options={{ title: 'Explore Flights' }} />
        <Stack.Screen name="Simulator" component={SimulatorScreen} options={{ title: 'Simulator' }} />
        <Stack.Screen name="WorldMap" component={WorldMapScreen} options={{ title: 'My World' }} />
        <Stack.Screen name="Referral" component={ReferralScreen} options={{ title: 'Invite Friends' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
