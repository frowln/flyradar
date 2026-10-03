/**
 * app.json, plus what depends on the build's environment.
 *
 * A build connected to the SkyAtlas flight services (EXPO_PUBLIC_API_URL set)
 * sends flight numbers and route points to our server, which the iOS privacy
 * manifest must declare; a build without them collects nothing. See
 * store-metadata/APP_PRIVACY.md.
 *
 * IOS_PERSONAL_TEAM=1 builds for a free Apple ID in Xcode: a personal team
 * cannot sign push, Sign in with Apple or time-sensitive notifications, so
 * those entitlements are dropped (local reminders still work). A free team also
 * cannot use a bundle id registered by someone else — set IOS_BUNDLE_ID to one
 * of your own. See docs/IOS.md.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

const FLIGHT_SERVICE_DATA = {
  NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherDataTypes',
  NSPrivacyCollectedDataTypeLinked: false,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality']
};

const PAID_ONLY_ENTITLEMENTS = ['aps-environment', 'com.apple.developer.applesignin', 'com.apple.developer.usernotifications.time-sensitive'];

/**
 * Registered first, so its mod runs after the library plugins that add these
 * keys (expo-notifications, expo-apple-authentication).
 */
const withoutPaidEntitlements = (config) =>
  withEntitlementsPlist(config, (c) => {
    for (const key of PAID_ONLY_ENTITLEMENTS) delete c.modResults[key];
    return c;
  });

module.exports = ({ config }) => {
  let out = config;

  if (process.env.EXPO_PUBLIC_API_URL) {
    const manifest = out.ios?.privacyManifests ?? {};
    out = {
      ...out,
      ios: {
        ...out.ios,
        privacyManifests: {
          ...manifest,
          NSPrivacyCollectedDataTypes: [...(manifest.NSPrivacyCollectedDataTypes ?? []), FLIGHT_SERVICE_DATA]
        }
      }
    };
  }

  if (process.env.IOS_BUNDLE_ID) {
    out = { ...out, ios: { ...out.ios, bundleIdentifier: process.env.IOS_BUNDLE_ID } };
  }

  if (process.env.IOS_PERSONAL_TEAM === '1') {
    const { entitlements: _paid, ...ios } = out.ios ?? {};
    out = withoutPaidEntitlements({ ...out, ios });
  }

  return out;
};
