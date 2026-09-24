import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { palette, s, line, family } from './design/tokens';
import { t } from '../src/i18n';

import BoardScreen from './screens/BoardScreen';
import AtlasScreen from './screens/AtlasScreen';

const Tab = createBottomTabNavigator();

/**
 * Two destinations, not four.
 *
 * The old bar listed Flights / Search / World / Profile — an IA organised around
 * data entities rather than around what the passenger is doing. There are only
 * two things to be doing: preparing for or taking a flight, and looking at what
 * you have collected. Search is an action inside the first; profile is settings
 * reached from the second. Neither is a place.
 */

/**
 * Tab marks are rules, not pictograms: a lit bar over a label. Icons at this
 * size add visual weight without adding meaning, and the instrument language
 * already speaks in rules.
 */
const mark =
  () =>
  ({ focused }: { focused: boolean }) => (
    <View style={[styles.mark, focused && styles.markOn]} />
  );

export default function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: palette.amber,
        tabBarInactiveTintColor: palette.inkDim,
        tabBarLabelStyle: styles.label,
        tabBarIconStyle: styles.icon,
        headerShown: false
      }}
    >
      <Tab.Screen
        name="Board"
        component={BoardScreen}
        options={{ tabBarIcon: mark(), title: t('tabs.board') }}
      />
      <Tab.Screen
        name="Atlas"
        component={AtlasScreen}
        options={{ tabBarIcon: mark(), title: t('tabs.atlas') }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.ground,
    borderTopColor: palette.rule,
    borderTopWidth: line.hair,
    height: 78,
    paddingBottom: s.x6,
    // The top inset lives on the icon rather than the bar, so each tab's touch
    // target runs to the bar's top edge (53pt) instead of stopping at 41pt.
    paddingTop: 0
  },
  icon: { height: 3, marginTop: s.x3, marginBottom: s.x2 },
  mark: {
    width: 22,
    height: 2,
    backgroundColor: palette.inkDim,
    opacity: 0.5
  },
  markOn: { backgroundColor: palette.amber, opacity: 1 },
  label: {
    fontFamily: family.dataMid,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase'
  }
});
