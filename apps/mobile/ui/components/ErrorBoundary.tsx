import React, { type ErrorInfo, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { palette, s, gutter } from '../design/tokens';
import { Title, Body, Label } from '../design/type';
import { PressSurface, Space } from '../design/layout';
import { captureError } from '../../src/core/observability/sentry';
import { t } from '../../src/i18n';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** The last line of defence: a crash becomes a calm screen with a way back. */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Label tone="accent">{t('errors.crashLabel')}</Label>
        <Space h={s.x3} />
        <Title>{t('errors.crashTitle')}</Title>
        <Space h={s.x2} />
        <Body tone="muted">{t('errors.crashBody')}</Body>
        <Space h={s.x6} />
        <PressSurface onPress={this.reset} accessibilityLabel={t('errors.tryAgain')} style={styles.button}>
          <Label tone="accent">{t('errors.tryAgain')}</Label>
        </PressSurface>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: palette.ground, justifyContent: 'center', paddingHorizontal: gutter },
  button: { paddingVertical: s.x4, borderTopWidth: 1, borderTopColor: palette.rule }
});
