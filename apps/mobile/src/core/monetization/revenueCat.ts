import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const RC_API_KEY = process.env['EXPO_PUBLIC_RC_KEY'] ?? '';

let initialized = false;

export async function initRevenueCat(userId?: string): Promise<void> {
  if (initialized) return;
  if (!RC_API_KEY) {
    console.warn('RevenueCat API key not set — monetization disabled');
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  await Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId });
  initialized = true;
}

export async function isPro(): Promise<boolean> {
  if (!RC_API_KEY) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return Boolean(info.entitlements.active['pro']);
  } catch {
    return false;
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
