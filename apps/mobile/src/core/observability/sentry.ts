import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env['EXPO_PUBLIC_SENTRY_DSN'];

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log('[Sentry] DSN not set — crash reporting disabled');
    return;
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: __DEV__,
    tracesSampleRate: 0.2,
    enableNativeCrashHandling: true
  });
}

export function captureError(error: unknown, context?: Record<string, any>) {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, { extra: context });
}

export const SentryWrapper = Sentry.wrap;
