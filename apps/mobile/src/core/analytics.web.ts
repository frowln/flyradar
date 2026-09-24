/** Browser preview: events go to the console only. */
export function initAnalytics() {}
export const analytics = {
  track(_event: string, _properties?: Record<string, unknown>): void {},
  identify(_userId: string): void {}
};
