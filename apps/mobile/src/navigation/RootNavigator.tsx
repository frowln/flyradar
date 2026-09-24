import { NavigationContainer, DarkTheme, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { palette } from '../../ui/design/tokens';
import type { RootStackParamList } from './types';
import { hasCompletedOnboarding } from '../../ui/onboardingState';
import { SOCIAL_ENABLED } from '../core/features';
import { MONETIZATION_ENABLED } from '../core/monetization/revenueCat';

import OnboardingScreen from '../../ui/screens/OnboardingScreen';
import Tabs from '../../ui/Tabs';
import AddFlightScreen from '../../ui/screens/AddFlightScreen';
import AloftScreen from '../../ui/screens/AloftScreen';
import PlaceScreen from '../../ui/screens/PlaceScreen';
import ArrivalScreen from '../../ui/screens/ArrivalScreen';
import AchievementsScreen from '../../ui/screens/AchievementsScreen';
import PaywallScreen from '../../ui/screens/PaywallScreen';
import SettingsScreen from '../../ui/screens/SettingsScreen';
import PeopleScreen from '../../ui/screens/PeopleScreen';
import PersonScreen from '../../ui/screens/PersonScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Deep links. Also how the browser preview opens a given screen directly, which
 * is what makes every screen reviewable as a screenshot.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['skyatlas://'],
  config: {
    screens: {
      Onboarding: 'welcome',
      Tabs: { screens: { Board: 'board', Atlas: 'atlas' } },
      AddFlight: 'add',
      InFlight: 'flight/:flightId',
      POIDetail: 'place/:flightId/:poiId',
      FlightSummary: 'arrival/:flightId',
      Achievements: 'achievements',
      Settings: 'settings',
      Paywall: 'pro'
    }
  }
};

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: palette.ground, card: palette.ground, primary: palette.amber, border: palette.rule }
};

export default function RootNavigator() {
  return (
    <NavigationContainer linking={linking} theme={theme}>
      <Stack.Navigator
        initialRouteName={hasCompletedOnboarding() ? 'Tabs' : 'Onboarding'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.ground },
          animation: 'slide_from_right',
          animationDuration: 250
        }}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="AddFlight" component={AddFlightScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="InFlight" component={AloftScreen} />
        <Stack.Screen name="POIDetail" component={PlaceScreen} />
        <Stack.Screen name="FlightSummary" component={ArrivalScreen} />
        <Stack.Screen name="Achievements" component={AchievementsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        {MONETIZATION_ENABLED ? <Stack.Screen name="Paywall" component={PaywallScreen} options={{ animation: 'slide_from_bottom' }} /> : null}
        {SOCIAL_ENABLED ? <Stack.Screen name="People" component={PeopleScreen} /> : null}
        {SOCIAL_ENABLED ? <Stack.Screen name="Person" component={PersonScreen} /> : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
