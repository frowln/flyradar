import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <Text style={[typography.h1, styles.title]}>My Flights</Text>
      <Text style={[typography.body, styles.empty]}>No flights yet.</Text>
      <Pressable
        style={styles.fab}
        onPress={() => nav.navigate('AddFlight')}
      >
        <Text style={styles.fabText}>+ Add Flight</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20
  },
  title: {
    marginBottom: 24
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 80
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28
  },
  fabText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16
  }
});
