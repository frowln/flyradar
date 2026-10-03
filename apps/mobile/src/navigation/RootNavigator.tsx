import { NavigationContainer, DarkTheme, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { palette } from '../../ui/design/tokens';
import type { RootStackParamList } from './types';
import { hasCompletedOnboarding } from '../../ui/onboardingState';
import { SOCIAL_ENABLED } from '../core/features';
import { PAYWALL_VISIBLE } from '../core/monetization/revenueCat';
import { onNotificationResponse } from '../core/ux/notifications';
import { navRef, openFromNotification } from './notificationRoutes';

import OnboardingScreen from '../../ui/screens/OnboardingScreen';
import Tabs from '../../ui/Tabs';
import AddFlightScreen from '../../ui/screens/AddFlightScreen';
import AloftScreen from '../../ui/screens/AloftScreen';
import PlaceScreen from '../../ui/screens/PlaceScreen';
import ArrivalScreen from '../../ui/screens/ArrivalScreen';
import AchievementsScreen from '../../ui/screens/AchievementsScreen';
import PaywallScreen from '../../ui/screens/PaywallScreen';
import SettingsScreen from '../../ui/screens/SettingsScreen';
import LicensesScreen from '../../ui/screens/LicensesScreen';
import PersonScreen from '../../ui/screens/PersonScreen';
import YearScreen from '../../ui/screens/YearScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Deep links. Also how the browser preview opens a given screen directly, which
 * is what makes every screen reviewable as a screenshot.
 */
const linking: LinkingOptions<RootStackParamList> = {
  // A web build hosted under a path of its own (a shared demo) keeps its
  // address: screen paths like /board would not exist there on a reload.
  enabled: process.env.EXPO_PUBLIC_WEB_LINKING !== 'off',
  prefixes: ['skyatlas://'],
  config: {
    screens: {
      Onboarding: 'welcome',
      Tabs: { screens: { Board: 'board', Atlas: 'atlas', People: 'people' } },
      AddFlight: 'add',
      InFlight: 'flight/:flightId',
      POIDetail: 'place/:flightId/:poiId',
      FlightSummary: 'arrival/:flightId',
      Achievements: 'achievements',
      Year: 'year',
      Settings: 'settings',
      Licenses: 'licenses',
      Paywall: 'pro'
    }
  }
};

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: palette.ground, card: palette.ground, primary: palette.amber, border: palette.rule }
};

function listenForTaps() {
  // Subscribed once the navigator can take a route; the tap that cold-started
  // the app is delivered then too.
  onNotificationResponse((r) => {
    openFromNotification(r).catch(() => {});
  });
}

export default function RootNavigator() {
  return (
    <NavigationContainer ref={navRef} linking={linking} theme={theme} onReady={listenForTaps}>
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
        <Stack.Screen name="Year" component={YearScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Licenses" component={LicensesScreen} />
        {PAYWALL_VISIBLE ? <Stack.Screen name="Paywall" component={PaywallScreen} options={{ animation: 'slide_from_bottom' }} /> : null}
        {SOCIAL_ENABLED ? <Stack.Screen name="Person" component={PersonScreen} /> : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
