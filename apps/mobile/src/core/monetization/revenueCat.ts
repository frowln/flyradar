import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { apiClient, API_ENABLED } from '../api/client';

const RC_API_KEY = process.env['EXPO_PUBLIC_RC_KEY'] ?? '';

/**
 * Whether purchases exist in this build at all. Without a key there is nothing
 * to buy, so the app does not pretend: every feature is simply open.
 */
export const MONETIZATION_ENABLED = RC_API_KEY.length > 0;

let initialized = false;

export async function initRevenueCat(userId?: string): Promise<void> {
  if (initialized) return;
  if (!RC_API_KEY) {
    // info, not warn: until the App Store Connect products exist there is no key
    // to set, so this fires on every development launch. As a warning it raised
    // a LogBox toast that sat over the tab bar and blocked the two screens
    // behind it — noise that hides the warnings actually worth reading.
    console.info('RevenueCat API key not set — monetization disabled');
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  await Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId });
  initialized = true;
}

/**
 * The store's answer, or null when it could not be asked.
 *
 * "Could not ask" is the normal state at cruise, and it must not be read as
 * "not subscribed" — the previous version did, and a paying passenger who
 * opened the app in the air lost Pro for the whole flight.
 */
export async function isPro(): Promise<boolean | null> {
  if (!RC_API_KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    const clientSays = Boolean(info.entitlements.active['pro']);
    if (!clientSays) return false;

    // RevenueCat has already validated the receipt with Apple. Our own server
    // double-checks only when this build has one.
    if (!API_ENABLED) return true;
    const verified = await apiClient.post<{ verified: boolean }>('/subscription/verify', {
      appUserId: info.originalAppUserId
    });
    return verified.verified;
  } catch {
    return null;
  }
}

export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch {
    return [];
  }
}

export async function purchasePackage(pkg: any): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return Boolean(customerInfo.entitlements.active['pro']);
  } catch (e: any) {
    if (e?.userCancelled) return false;
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const info = await Purchases.restorePurchases();
    return Boolean(info.entitlements.active['pro']);
  } catch {
    return false;
  }
}
