import React, { type ErrorInfo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info);
    // TODO: wire to Sentry/crash reporting
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>😞</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable
            style={styles.button}
            onPress={this.reset}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  icon: { fontSize: 64 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  message: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginVertical: 8 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '700' }
});
