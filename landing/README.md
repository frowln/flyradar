# SkyAtlas landing page

Static files with no build step: `index.html`, the legal pages (`privacy.html`, `privacy-ru.html`, `terms.html`, `terms-ru.html`), `icon.png` and `screens/`.

- **Hosting:** serve this folder from any static host. For GitHub Pages, publish from a branch whose root is this folder (for example with a Pages workflow that uploads `landing/`), or copy it to `docs/`.
- **App Store Connect:** the Privacy Policy URL is `<host>/privacy.html`.
- **The app:** it reads `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` at build time (`apps/mobile/src/core/links.ts`). Set them to `<host>/privacy.html` and `<host>/terms.html`. Each English page links to its Russian version.
- **Legal pages:** these are generated from `docs/legal/*.md`. Edit the Markdown, then run `node landing/build-legal.mjs`.
- **Screenshots:** copy `apps/mobile/store-metadata/screenshots/en/01.png` … `05.png` into `landing/screens/`.
- **Before launch:** replace the App Store badge placeholder in `index.html` (`TODO(owner)`), and confirm the contact addresses.
