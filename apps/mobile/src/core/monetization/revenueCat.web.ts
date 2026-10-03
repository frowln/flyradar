/** Browser preview: no store. */
export const MONETIZATION_ENABLED = false;
/** The hosted demo shows the Pro screen without selling anything. */
export const PAYWALL_VISIBLE = process.env['EXPO_PUBLIC_DEMO_PAYWALL'] === '1';
export async function initRevenueCat(): Promise<void> {}
export async function isPro(): Promise<boolean | null> {
  return false;
}
export async function getOfferings(): Promise<unknown[]> {
  return [];
}
export async function purchasePackage(): Promise<boolean> {
  return false;
}
export async function restorePurchases(): Promise<boolean> {
  return false;
}
