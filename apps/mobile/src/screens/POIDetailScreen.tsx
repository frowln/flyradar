import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export default function POIDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>POIDetailScreen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  text: { color: colors.text, fontSize: 20 }
});
