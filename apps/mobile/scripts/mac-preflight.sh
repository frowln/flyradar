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
