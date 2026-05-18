import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${colors.error}22`,
    borderWidth: 1, borderColor: colors.error,
    borderRadius: 10, padding: 12, margin: 16
  },
  icon: { fontSize: 16 },
  message: { flex: 1, color: colors.text, fontSize: 13 },
  retryButton: {
    backgroundColor: colors.error, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6
  },
  retryText: { color: colors.text, fontSize: 12, fontWeight: '600' }
});
