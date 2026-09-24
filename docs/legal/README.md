# Legal documents

Privacy Policy and Terms of Use for the SkyAtlas app, in English (`privacy-policy.md`, `terms-of-service.md`) and Russian (`*.ru.md`). They describe the app as currently built: everything on the phone, no account, no server, no analytics, no crash reports, no purchases. Keep both languages in sync.

The App Store requires a public Privacy Policy URL (App Store Connect → App Privacy) that anyone can open without signing in. The landing site renders these files as pages (`landing/privacy.html`, `privacy-ru.html`, `terms.html`, `terms-ru.html`; regenerate with `node landing/build-legal.mjs`). Point the app at them with `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` (`apps/mobile/src/core/links.ts`; a Russian interface opens the `-ru.html` twin). Without those variables Settings links to these Markdown files on GitHub, which works only while the repository is public.

Before publishing, the owner must:

- [ ] Fill in the legal entity name and confirm `privacy@skyatlas.app` and `support@skyatlas.app` (see the `TODO(owner)` comments).
- [ ] Choose the governing law and courts (Terms, section 14).
- [ ] Update both documents, the App Privacy answers and the iOS privacy manifest in `app.json` **before** any build sets `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCIAL`, `EXPO_PUBLIC_RC_KEY`, `EXPO_PUBLIC_SENTRY_DSN` or `EXPO_PUBLIC_POSTHOG_KEY`.
