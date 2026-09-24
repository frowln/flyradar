/**
 * app.json, plus what depends on the build's environment.
 *
 * A build connected to the SkyAtlas flight services (EXPO_PUBLIC_API_URL set)
 * sends flight numbers and route points to our server, which the iOS privacy
 * manifest must declare; a build without them collects nothing. See
 * store-metadata/APP_PRIVACY.md.
 */
const FLIGHT_SERVICE_DATA = {
  NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeOtherDataTypes',
  NSPrivacyCollectedDataTypeLinked: false,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality']
};

module.exports = ({ config }) => {
  if (!process.env.EXPO_PUBLIC_API_URL) return config;
  const manifest = config.ios?.privacyManifests ?? {};
  return {
    ...config,
    ios: {
      ...config.ios,
      privacyManifests: {
        ...manifest,
        NSPrivacyCollectedDataTypes: [...(manifest.NSPrivacyCollectedDataTypes ?? []), FLIGHT_SERVICE_DATA]
      }
    }
  };
};
