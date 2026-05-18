type EventName =
  | 'flight_added'
  | 'package_downloaded'
  | 'flight_started'
  | 'poi_viewed'
  | 'poi_dismissed'
  | 'achievement_unlocked'
  | 'paywall_shown'
  | 'purchase_made'
  | 'flight_completed';

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

const isDev = __DEV__;

export const analytics = {
  track(event: EventName, properties?: EventProperties): void {
    if (isDev) {
      console.log(`[Analytics] ${event}`, properties ?? {});
    }
    // TODO: Wire up PostHog when EXPO_PUBLIC_POSTHOG_KEY is set
    // Posthog.capture(event, properties);
  },

  identify(userId: string): void {
    if (isDev) {
      console.log(`[Analytics] identify`, { userId });
    }
  }
};
