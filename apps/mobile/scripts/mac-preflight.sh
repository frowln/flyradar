# What a Mac needs to build the iPhone app, checked up front with a way to fix
# each. Sourced by scripts/xcode-demo.sh and scripts/record-demo.sh from
# apps/mobile.

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }
fail() {
  printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2
  exit 1
}

# --- What the Mac needs, checked up front with a way to fix each ---------------
[ "$(uname)" = "Darwin" ] || fail "Нужен Mac: iPhone-приложение собирается только в Xcode на macOS."
xcode-select -p >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1 ||
  fail "Не найден Xcode. Поставьте его из App Store, откройте один раз и выполните: sudo xcode-select -s /Applications/Xcode.app"
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  fail "Xcode ещё не закончил первую настройку. Выполните: sudo xcodebuild -runFirstLaunch (и примите лицензию: sudo xcodebuild -license accept)"
fi
command -v node >/dev/null || fail "Не найден Node.js. Поставьте: brew install node@20 (или с nodejs.org, версия 20.19+)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' ||
  fail "Node.js $(node -v) слишком старый, нужен 20.19 или новее: brew install node@20"
command -v pod >/dev/null || fail "Не найден CocoaPods. Поставьте: brew install cocoapods"

if [ ! -d ../../node_modules/expo ]; then
  say "Ставлю зависимости (npm install, 2–5 минут)…"
  (cd ../.. && npm install)
fi

# React Native's ready-made parts (Hermes, its dependencies, ~60 MB) come from
# Maven Central, which redirects to repo.reactnative.dev. Where that host does
# not answer, CocoaPods falls back to building Hermes from source and stops at
# a missing cmake; where it answers at a few hundred bytes a second, pod install
# hangs for hours. So the first 2 MB of one file are fetched for real, from
# Google's mirror of Maven Central first, and the first source that delivers
# them in 20 seconds is used (ENTERPRISE_REPOSITORY).
maven_mirror() {
  [ -z "${ENTERPRISE_REPOSITORY:-}" ] || return 0
  local v file base
  v="$(node -p "require('react-native/package.json').version")"
  file="com/facebook/react/react-native-artifacts/$v/react-native-artifacts-$v-hermes-ios-debug.tar.gz"
  for base in https://maven-central.storage-download.googleapis.com/maven2 https://repo1.maven.org/maven2; do
    if [ "$(curl -sL -r 0-2097151 --max-time 20 -o /dev/null -w '%{size_download}' "$base/$file")" = 2097152 ]; then
      export ENTERPRISE_REPOSITORY="$base"
      return 0
    fi
  done
  fail "Не скачиваются готовые части React Native ни с зеркала Google, ни с Maven Central. Проверьте интернет (включите или выключите VPN) и запустите скрипт снова."
}

# A fresh Xcode project from app.json, with its CocoaPods. Expo only warns when
# `pod install` fails and builds on regardless, so pods are installed here,
# where a failure stops the script with the reason.
xcode_project() {
  say "Создаю проект Xcode и ставлю CocoaPods (3–5 минут)…"
  npx expo prebuild --platform ios --clean --no-install
  maven_mirror
  (cd ios && pod install) ||
    fail "CocoaPods не поставился. Пришлите последние строки выше: по ним видно, чего не хватает."
  # A Release build uploads its source maps and symbols to Sentry, which fails
  # the build until a Sentry account is set up. Xcode's build phases read this
  # file, so it holds for ▶ in Xcode as well as for the scripts.
  echo 'export SENTRY_DISABLE_AUTO_UPLOAD=true' >> ios/.xcode.env.local
}


# The demo as the client should see it: sample travellers in «Люди», demo
# flights counted in the passport, the Pro screen; and, while we are still
# testing, the error screen says what broke, so a screenshot of it is enough to
# fix it. Read when Xcode bundles the JavaScript, so they live in a file rather
# than in the shell.
demo_env() {
  cat > .env.local <<'ENV'
EXPO_PUBLIC_DEMO_SOCIAL=1
EXPO_PUBLIC_DEMO_COUNTS=1
EXPO_PUBLIC_DEMO_PAYWALL=1
EXPO_PUBLIC_SHOW_ERRORS=1
ENV
}
