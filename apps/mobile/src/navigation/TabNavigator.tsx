import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Plane, Search, Map, User } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { t } from '../i18n';

import HomeScreen from '../screens/HomeScreen';
import BrowseScreen from '../screens/BrowseScreen';
import WorldMapScreen from '../screens/WorldMapScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const tabIcon = (Icon: typeof Plane) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Icon size={24} color={color} strokeWidth={focused ? 2.5 : 1.8} />
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
        options={{ tabBarIcon: tabIcon(Plane), title: t('tabs.flights') }}
      />
      <Tab.Screen
        name="Explore"
        component={BrowseScreen}
        options={{ tabBarIcon: tabIcon(Search), title: t('tabs.explore') }}
      />
      <Tab.Screen
        name="World"
        component={WorldMapScreen}
        options={{ tabBarIcon: tabIcon(Map), title: t('tabs.world') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: tabIcon(User), title: t('tabs.profile') }}
      />
    </Tab.Navigator>
  );
}
