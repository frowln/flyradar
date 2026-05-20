# Lock Screen Widget — Manual Xcode Setup Required

Lock Screen widgets on iOS require a **WidgetKit extension target** inside the Xcode project.
This cannot be added via a JavaScript/TypeScript config plugin alone without ejecting from
Expo managed workflow, because WidgetKit targets must be compiled as a separate native binary
that runs outside the React Native runtime.

## What was evaluated

| Package | Verdict |
|---|---|
| `react-native-widget-extension` | Unmaintained; requires bare workflow + manual pbxproj edits |
| `expo-widget-template` | Does not exist as a published package (May 2026) |
| Custom Swift via `expo-modules-core` | Feasible but requires EAS custom build + Xcode target |

## How to add this properly (future iOS dev)

1. In Xcode, **File → New → Target → Widget Extension**.
2. Name it `SkyAtlasWidget`. Bundle ID: `com.skyatlas.app.widget`.
3. Create a `SkyAtlasWidget.swift` that reads from a shared `App Group` container
   (`group.com.skyatlas.app`) where the main app writes the next flight data via
   `UserDefaults(suiteName:)`.
4. In the main RN app, write next-flight data to the shared container after each
   flight load (use `@react-native-async-storage/async-storage` with the App Group
   or a native module).
5. In the widget `TimelineProvider`, read that data and render a `VStack` with
   origin → destination IATA codes + countdown.
6. Add the Widget Extension target to EAS build via `eas.json` `"targets"` field.

## Placeholder Swift file

See `SkyAtlasWidget.swift` in this directory for a commented skeleton.
