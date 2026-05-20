import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../theme/colors';
import { t } from '../i18n';

import HomeScreen from '../screens/HomeScreen';
import BrowseScreen from '../screens/BrowseScreen';
import WorldMapScreen from '../screens/WorldMapScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const tabIcon = (emoji: string) =>
  ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false
      }}
    >
      <Tab.Screen
        name="Flights"
        component={HomeScreen}
        options={{ tabBarIcon: tabIcon('✈️'), title: t('tabs.flights') }}
      />
      <Tab.Screen
        name="Explore"
        component={BrowseScreen}
        options={{ tabBarIcon: tabIcon('🗺️'), title: t('tabs.explore') }}
      />
      <Tab.Screen
        name="World"
        component={WorldMapScreen}
        options={{ tabBarIcon: tabIcon('🌍'), title: t('tabs.world') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon('👤'), title: t('tabs.profile') }}
      />
    </Tab.Navigator>
  );
}
