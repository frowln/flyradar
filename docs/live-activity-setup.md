# iOS Live Activity / Dynamic Island Setup

## Current status

`NSSupportsLiveActivities = true` is set in `Info.plist` via the config plugin at
`apps/mobile/plugins/with-live-activity.js`. This enables users to opt in once
the native ActivityKit code is added.

## What is required to go live

Full Dynamic Island + Lock Screen Live Activity requires:

1. **Xcode + Swift** — A Widget Extension target in the Xcode project.
2. **ActivityAttributes struct** — Defines the static and dynamic content of your activity.
3. **ActivityKit APIs** — `Activity.request(...)` called from the React Native layer via a native module.
4. **Apple Developer Program** — $99/year membership required to build native extensions.

## Estimated effort

- iOS developer: 3–5 days of work
- Exposes flight progress, altitude, ETA on the Dynamic Island during active flights

## Resources

- https://developer.apple.com/documentation/activitykit
- https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension
- Community package to watch: https://github.com/bndkt/react-native-live-activity
