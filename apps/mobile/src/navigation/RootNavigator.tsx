import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { t } from '../i18n';
import type { RootStackParamList } from './types';

import { hasCompletedOnboarding } from '../../ui/onboardingState';
import OnboardingScreen from '../../ui/screens/OnboardingScreen';
// New UI lives in ui/ — the old TabNavigator and its screens are no longer referenced.
import Tabs from '../../ui/Tabs';
import AddFlightScreen from '../../ui/screens/AddFlightScreen';
import InFlightScreen from '../../ui/screens/AloftScreen';
import POIDetailScreen from '../../ui/screens/PlaceScreen';
import FlightSummaryScreen from '../../ui/screens/ArrivalScreen';
import PaywallScreen from '../../ui/screens/PaywallScreen';
import WrappedScreen from '../../ui/screens/WrappedScreen';
import SettingsScreen from '../../ui/screens/SettingsScreen';
import StatsScreen from '../../ui/screens/StatsScreen';
import PeopleScreen from '../../ui/screens/PeopleScreen';
import PersonScreen from '../../ui/screens/PersonScreen';

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
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="AddFlight" component={AddFlightScreen} options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <Stack.Screen name="InFlight" component={InFlightScreen} options={{ headerShown: false }} />
        <Stack.Screen name="POIDetail" component={POIDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="FlightSummary" component={FlightSummaryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Paywall" component={PaywallScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Wrapped" component={WrappedScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="People" component={PeopleScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Person" component={PersonScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
