# SkyAtlas Privacy Policy

Last updated: 24 September 2026

<!-- TODO(owner): confirm contact address and legal entity name -->

SkyAtlas ("the app") is a window-seat companion: it shows what is outside the airplane window and works offline. It is made by **[legal entity name]** ("we", "us"). This policy explains what happens to your information when you use the app. It describes the app as it is released today. A Russian version is in [privacy-policy.ru.md](privacy-policy.ru.md).

## The short version

- You do not need an account, and there is no sign-in.
- Your flights, your flight log and your settings are stored only on your phone. We do not get a copy.
- To download stories, photos and maps for a flight, your phone connects directly to Wikipedia/Wikimedia and OpenFreeMap. Like any website, they see your IP address and what is being downloaded.
- Your location and your camera are used only on the phone. Nothing from them is sent anywhere.
- No ads, no tracking, no sale of data. The current version sends no crash reports and no analytics.

## What is stored on your phone

When you add and fly a flight, the app saves the following in its private storage on your phone:

- **Flight details you enter or scan:** departure and arrival airports, date, departure and arrival times, and, if you add them, the flight number and seat.
- **The prepared flight:** the modelled route, the places along it, their stories and photos, and an offline map of the route.
- **The flight in progress:** take-off time, the places you opened or marked as seen, your answers to "what is about to appear?", and the most recent GPS reading (see *Location* below).
- **Your flight log ("passport"):** completed flights, the countries crossed, stamps and achievements.
- **Preferences:** language, units, alert level, GPS, guessing and audio guide settings.
- **If purchases are offered:** whether Pro is active.

We cannot see or access any of this. If your phone backs up app data (for example to iCloud or Google), the backup may include it; that is governed by your device settings and by Apple's or Google's policies.

## Connections your phone makes

The route, the places along it and the timeline are calculated on your phone from data built into the app. Only stories, photos and maps need the internet. When you add a flight while online, your phone itself connects to:

| Service | Addresses | Used for |
| --- | --- | --- |
| Wikimedia Foundation | `www.wikidata.org`, `<language>.wikipedia.org`, `commons.wikimedia.org`, `upload.wikimedia.org` | Short article summaries, photos, and photo author and licence |
| OpenFreeMap | `tiles.openfreemap.org` | Map style and map tiles for the route |

The map may also load tiles when you view it while online, a photo that was not saved in advance may load when you open that place, and tapping a story's source link opens Wikipedia in your browser.

These are ordinary web requests. As with any website, these services receive your IP address, standard technical details of the request, and which articles and map areas were requested, in your app language. Together, this can hint at your route. The app does not add your name, an account, an advertising ID, or any identifier of ours. The services handle this data under their own policies: [Wikimedia privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy) and [OpenFreeMap](https://openfreemap.org/). They may be located outside your country, including in the United States.

In the air, without a connection, the app makes no requests at all. The current version has no server of ours to talk to: it never sends your flights, or anything else, to us.

## Permissions

- **Location (only while using the app).** During a flight, the flight screen reads the phone's GPS to show more precisely what is below the aircraft. This is done on the phone. The latest reading is kept with the current flight until you start another flight or delete this one. It is not added to your flight log and never leaves the phone. You can turn it off in the app (Settings → *Refine with GPS*) or in your phone's settings; the app then estimates the position from the clock.
- **Camera.** Used only to read the barcode on your boarding pass. The barcode also contains your name and booking reference; the app skips them and keeps only the airports, airline, flight number, date and seat. No image is saved or sent.
- **Files.** If you import an Apple Wallet boarding pass (`.pkpass`), the file you choose is read on the phone to get the same flight details. It is not uploaded.
- **Notifications.** Reminders on the ground (which window to ask for at check-in, and "Airborne?" shortly after the scheduled departure) and alerts in flight (for example "look left in 10 minutes") are scheduled on the phone and fire from its clock. There is no push server and no push token. Their text, such as your route, can appear on your lock screen; your phone's notification settings control this.

## Other features

- **Audio guide.** Uses your phone's built-in text-to-speech voice. The app does not send the text anywhere.
- **Sharing a postcard.** The image is created on your phone and handed to the system share sheet. You choose where it goes; the app does not upload it.

## Purchases (when offered)

The current version has no purchases; all features are open. If SkyAtlas Pro is offered in the future:

- **Apple** processes the payment. We never see your card or payment details.
- **RevenueCat** manages purchase status for us. It receives an anonymous ID it creates for your installation, your purchase receipts from the App Store, and basic technical data such as device type, system version, app version, store country and IP address. See the [RevenueCat privacy policy](https://www.revenuecat.com/privacy/).

## Crash reports and analytics

The current version sends no crash reports and no analytics. The code contains optional support for **Sentry** (crash reports) and **PostHog** (usage statistics). They stay switched off unless the app is built with keys for them. We will update this policy before turning either one on. For transparency, if enabled they would receive:

- **Sentry:** details of the error, technical context (device model, system and app version), a trail of recent app activity, and the IP address of the connection.
- **PostHog:** two events: "flight added" (departure and arrival airport codes, number of places) and "flight completed" (an internal flight ID made of the flight number or route, date and departure time). Each event would come with standard device details and a random installation ID. No name, e-mail or precise location.

## What we do not do

- We do not show ads, use advertising IDs, or track you across other apps and websites.
- We do not sell or share personal information, and we do not build profiles.

## Optional online features

The code also contains optional features that need a server of ours: accounts with Sign in with Apple, place reviews, leaderboards, and a server-side check of Pro purchases. The current version is built without that server, so these features are switched off and send nothing. If we ever turn them on, we will update this policy first and ask for your consent where the law requires it.

## Keeping and deleting your data

Your data stays on your phone until you delete it:

- **Delete a flight** on the Board: removes its saved route, stories, photos and offline map. Its entry in your flight log stays.
- **Settings → Clear the passport:** erases all flights, stamps and achievements in your flight log. Saved flights (routes, stories, photos, maps) stay until you delete them on the Board.
- **Delete the app:** removes everything the app stored on the phone (copies in your device backups excepted).

Because we do not hold your data, we cannot delete or export it for you, and we cannot restore it if you lose your phone.

## Your rights

If the GDPR, the UK GDPR, the California Consumer Privacy Act (CCPA/CPRA) or a similar law applies to you, you have the right to access, correct, delete and export your personal data, to object to or restrict its use, to withdraw consent, and to complain to your data protection authority.

In practice, with SkyAtlas:

- Everything the app knows about your flights is on your phone and under your control. You can see it in the app and delete it as described above.
- We hold no personal data about you, except what you choose to send us by e-mail.
- Where the GDPR applies, we use an e-mail you send us only to answer it (legitimate interest).
- **California:** we do not sell or share personal information and do not use it for targeted advertising. We will not treat you differently for using your rights.

To use any of these rights, or if you have a question, contact us (see below).

## Children

SkyAtlas is not directed at children under 13, or under the minimum age set by the law of your country. We do not knowingly collect personal information from children. The app does not send us any personal information in the first place. If you think a child has sent us personal information, contact us and we will delete it.

## Changes to this policy

We will update this policy when the app changes, and always before enabling any feature that sends data to us or to a new service. The date at the top shows the current version. We will point out important changes in the app or in the release notes.

## Contact

Write to **[legal entity name]** at privacy@skyatlas.app.
