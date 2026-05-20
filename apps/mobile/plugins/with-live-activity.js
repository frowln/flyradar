// Config plugin scaffold for iOS Live Activity / ActivityKit
// Manual setup required: see docs/live-activity-setup.md
const { withInfoPlist } = require('@expo/config-plugins');

module.exports = function withLiveActivity(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults['NSSupportsLiveActivities'] = true;
    return cfg;
  });
};
