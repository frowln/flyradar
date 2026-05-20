import PostHog from 'posthog-react-native';

const POSTHOG_KEY = process.env['EXPO_PUBLIC_POSTHOG_KEY'];

let client: PostHog | null = null;

export function initAnalytics() {
  if (!POSTHOG_KEY) {
    if (__DEV__) console.log('[Analytics] PostHog key not set — using dev logger');
    return;
  }
  client = new PostHog(POSTHOG_KEY, { host: 'https://app.posthog.com' });
}

type EventName =
  | 'flight_added'
  | 'package_downloaded'
  | 'flight_started'
  | 'poi_viewed'
  | 'poi_dismissed'
  | 'achievement_unlocked'
  | 'paywall_shown'
  | 'purchase_made'
  | 'flight_completed'
  | 'theme_changed'
  | 'language_changed';

export const analytics = {
  track(event: EventName, properties?: Record<string, any>): void {
    if (__DEV__) console.log(`[Analytics] ${event}`, properties ?? {});
    client?.capture(event, properties);
  },

  identify(userId: string): void {
    if (__DEV__) console.log(`[Analytics] identify`, { userId });
    client?.identify(userId);
  }
};
