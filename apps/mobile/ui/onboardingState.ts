import { createMMKV } from 'react-native-mmkv';

/**
 * Whether the passenger has been through onboarding.
 *
 * Kept apart from the screen that shows it so the navigator can decide the
 * initial route without importing a whole surface — and so replacing the
 * onboarding UI never touches the flag that decides whether to show it.
 *
 * The store id and key match the previous implementation, so anyone who already
 * finished onboarding is not shown it again after the rewrite.
 */
const storage = createMMKV({ id: 'skyatlas-onboarding' });

export const ONBOARDING_KEY = 'onboarding_complete';

export function hasCompletedOnboarding(): boolean {
  return storage.getBoolean(ONBOARDING_KEY) ?? false;
}

export function markOnboardingComplete(): void {
  storage.set(ONBOARDING_KEY, true);
}
