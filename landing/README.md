# SkyAtlas landing page

Static files with no build step: `index.html`, the legal pages (`privacy.html`, `privacy-ru.html`, `terms.html`, `terms-ru.html`), `icon.png` and `screens/`.

- **Hosting:** serve this folder from any static host. For GitHub Pages, publish from a branch whose root is this folder (for example with a Pages workflow that uploads `landing/`), or copy it to `docs/`.
- **App Store Connect:** the Privacy Policy URL is `<host>/privacy.html`.
- **The app:** it reads `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` at build time (`apps/mobile/src/core/links.ts`). Set them to `<host>/privacy.html` and `<host>/terms.html`. Each English page links to its Russian version.
- **Legal pages:** these are generated from `docs/legal/*.md`. Edit the Markdown, then run `node landing/build-legal.mjs`.
- **Screenshots:** `screens/*.jpg` are the English store screenshots (`apps/mobile/store-metadata/screenshots/en/`); copy them again after regenerating.
- **Before launch:** replace the App Store badge placeholder in `index.html` (`TODO(owner)`), and confirm the contact addresses.
- **Claims that depend on the build:** the page presents the flight services (find by flight number, a route that follows the flight's recent real track, the cloud forecast) and says what they send to the SkyAtlas server (How it works, Privacy, FAQ). They exist only in builds that set `EXPO_PUBLIC_API_URL` to a SkyAtlas server with provider keys configured (`apps/backend/README.md`, *Data providers*). If the store build ships without them, take them out of the page first.
- **Sections:** hero, figures, How it works (`#how`), Stories (`#stories`: a Mount Fuji card with the app's own English texts from `apps/mobile/content/places/en/b1-peaks.json`, the history layer with the Silk Road from `apps/mobile/content/history/en.json`, photo galleries, the quiz), At the window, Passport, Screens, Privacy, Honestly, FAQ. If those content texts change, update the quotes on the page.
