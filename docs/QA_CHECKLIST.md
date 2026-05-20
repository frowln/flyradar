# SkyAtlas — Manual QA Checklist

**Version:** 1.0  
**Date:** 2026-05-20  
**Tester:** ___________________  
**Device / OS:** ___________________  
**Build:** ___________________

---

## How to use this checklist

- Mark each item: **Pass** | **Fail** | **Blocked** | **N/A**
- Fill the Notes column with any observed deviations, crash logs, or screenshots
- Run through Critical User Flows last — they validate end-to-end paths

---

## 1. Onboarding

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 1.1 | Fresh install, open app | Onboarding slide 1 shown (not HomeScreen) | | |
| 1.2 | Verify slide 1 content | Illustration + headline + subtitle visible, no clipping | | |
| 1.3 | Swipe right to slide 2 | Slide 2 appears with animated transition | | |
| 1.4 | Swipe right to slide 3 | Slide 3 appears with animated transition | | |
| 1.5 | Tap "Skip" on slide 1 | Jumps directly to HomeScreen, onboarding not shown again | | |
| 1.6 | Tap "Get Started" on slide 3 | Navigates to HomeScreen | | |
| 1.7 | Kill and relaunch after completing onboarding | HomeScreen shown directly (onboarding not repeated) | | |
| 1.8 | Verify dot indicators | 3 dots shown, active dot highlighted per current slide | | |

---

## 2. Home Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 2.1 | Open HomeScreen with no flights | Empty state illustration + "Add your first flight" CTA shown | | |
| 2.2 | Open HomeScreen with upcoming flight | Hero card shows flight number, route, countdown to departure | | |
| 2.3 | Hero countdown auto-updates | Remaining time changes every second without manual refresh | | |
| 2.4 | Tap hero card | Opens FlightDetailScreen for that flight | | |
| 2.5 | Multiple flights — scroll past hero | Past/future flights listed below hero card | | |
| 2.6 | Tap "+" FAB | Opens AddFlightScreen | | |
| 2.7 | Pull-to-refresh | Flight list refreshes, spinner visible, resolves without crash | | |

---

## 3. Add Flight

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 3.1 | Open AddFlightScreen | Flight number input focused, date picker defaults to today | | |
| 3.2 | Enter valid flight number + date, tap "Search" | Loading spinner → flight info card appears | | |
| 3.3 | Confirm flight → tap "Add" | Flight saved, navigate back to HomeScreen, flight appears in list | | |
| 3.4 | Enter invalid flight number (e.g. "XXX999") | Error state shown: "Flight not found" — no crash | | |
| 3.5 | Leave flight number empty, tap "Search" | Inline validation error, button disabled or error shown | | |
| 3.6 | Enter flight for past date | Either accepted or meaningful error, no crash | | |
| 3.7 | Simulate network error (airplane mode on, search) | Error banner displayed, retry option available | | |
| 3.8 | Tap camera / scanner icon | Scanner view opens (if implemented) | | |
| 3.9 | Add via Apple Wallet pass (if visible) | Wallet import flow opens | | |
| 3.10 | Duplicate flight (add same flight twice) | Graceful handling — either blocked or warning shown | | |

---

## 4. Flight Detail Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 4.1 | Open FlightDetailScreen for upcoming flight | Shows flight number, route (IATA codes), departure/arrival times, airline | | |
| 4.2 | Weather section | Destination weather shown (temp, condition icon) | | |
| 4.3 | Packing suggestions section | List of packing items appropriate to destination | | |
| 4.4 | "Confirm Takeoff" button visible | Button present when departure is within 24 hours | | |
| 4.5 | Tap "Confirm Takeoff" | Transitions to InFlightScreen, flight marked as in-progress | | |
| 4.6 | Back navigation | Returns to HomeScreen without data loss | | |
| 4.7 | Flight info auto-refreshes | Status badge updates if flight status changes | | |
| 4.8 | Open for past/completed flight | Shows historical info, no "Confirm Takeoff" button | | |

---

## 5. InFlight Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 5.1 | Map renders | MapView visible, flight path drawn on map | | |
| 5.2 | Zoom in / out | Map responds to pinch gesture, no white tiles | | |
| 5.3 | Plane icon / position indicator | Airplane marker visible on route | | |
| 5.4 | POI cards appear | At least one POI card visible in bottom sheet / list | | |
| 5.5 | POI card shows title + distance | Card has name and km/mi label | | |
| 5.6 | Tap POI card | Opens POIDetailScreen | | |
| 5.7 | Navigation HUD | Speed, altitude, ETA visible and updating | | |
| 5.8 | Progress bar / track indicator | Shows % of flight completed | | |
| 5.9 | POIs update as flight progresses | Cards change to reflect current position on route | | |
| 5.10 | Simulator mode — jump to 50% | POIs and map reflect mid-flight position | | |
| 5.11 | Landscape rotation | Layout adapts, map still usable | | |
| 5.12 | Background / foreground cycle | App resumes correctly, no stale data or crash | | |

---

## 6. POI Detail Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 6.1 | Open POIDetailScreen | Header image or illustration loads | | |
| 6.2 | Fact cards / info sections | At least 2-3 fact sections with text | | |
| 6.3 | Share button | Share sheet opens with POI name + app link | | |
| 6.4 | Audio narration button (if present) | Plays audio, button toggles to stop | | |
| 6.5 | Audio stops on back navigation | No audio leak when leaving screen | | |
| 6.6 | Back navigation | Returns to InFlightScreen | | |
| 6.7 | POI in kids mode | Language simplified, adult content hidden | | |

---

## 7. Flight Summary Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 7.1 | Appears after flight lands (or simulator end) | Summary screen shown automatically | | |
| 7.2 | Flight stats displayed | Distance (km/mi), duration, POIs seen count | | |
| 7.3 | Achievement unlock | If criteria met, achievement card shown with confetti | | |
| 7.4 | "Share as Instagram Story" | Share sheet opens with story-formatted card | | |
| 7.5 | "Done" / close | Returns to HomeScreen, flight marked completed | | |
| 7.6 | Flight added to Collection | Completed flight visible in CollectionScreen afterward | | |

---

## 8. Collection Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 8.1 | Countries tab | List of visited countries with flag + name | | |
| 8.2 | Countries count matches flights | Number of unique countries ≥ number of completed flights | | |
| 8.3 | Achievements tab | Grid/list of earned and locked achievements | | |
| 8.4 | Locked achievement appearance | Grayed out / lock icon, no spoilers for unearned | | |
| 8.5 | Stats tab | Aggregate numbers: total flights, distance, hours, POIs | | |
| 8.6 | Empty state (no flights) | Encouraging empty state message shown | | |

---

## 9. World Map Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 9.1 | Map renders | Full world map visible | | |
| 9.2 | Completed flight tracks visible | Route lines drawn for past flights | | |
| 9.3 | Multiple flights | All routes shown, different colors or distinguishable | | |
| 9.4 | Empty state | "No flights yet" shown when no flights completed | | |
| 9.5 | Tap a route | Opens detail or tooltip for that flight | | |
| 9.6 | Zoom / pan | Map responds correctly | | |

---

## 10. Browse / Search (BrowseScreen)

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 10.1 | Open BrowseScreen | Search input visible | | |
| 10.2 | Type flight number | Results list updates as user types | | |
| 10.3 | Tap a result | Route preview / flight detail shown | | |
| 10.4 | Search with no results | "No results" state shown, no crash | | |
| 10.5 | Clear search | Returns to default/empty state | | |

---

## 11. Profile Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 11.1 | Passport hero visible | User avatar, name / username area rendered | | |
| 11.2 | XP progress bar | Shows current XP and next level threshold | | |
| 11.3 | Streak counter | Active streak days displayed with flame icon | | |
| 11.4 | Menu items present | Settings, Referral, Stats, Wrapped, Leaderboard links | | |
| 11.5 | Tap each menu item | Correct screen opens | | |

---

## 12. Settings Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 12.1 | Language switch | App language changes immediately (or after restart) | | |
| 12.2 | Theme toggle (light/dark) | UI switches theme without restart | | |
| 12.3 | Units toggle (km / mi) | Distance values update throughout app | | |
| 12.4 | Kids mode toggle | Enables simplified language and content filtering | | |
| 12.5 | Sound toggle | Disables all in-app audio | | |
| 12.6 | Narrator toggle | Enables / disables audio narration in POI detail | | |
| 12.7 | Sound effects toggle | Toggles UI sound effects independently from narrator | | |
| 12.8 | Dev tools (if visible) | Opens debug / developer options panel | | |
| 12.9 | Settings persist across restart | All toggles retain state after kill and relaunch | | |

---

## 13. Wrapped Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 13.1 | Open Wrapped | Slide 1 visible with year / season label | | |
| 13.2 | Swipe through all 7 slides | All 7 slides render without blank screens | | |
| 13.3 | Slide content accuracy | Numbers match CollectionScreen stats | | |
| 13.4 | Final slide — "Share" button | Share sheet opens with story card | | |
| 13.5 | Back / close Wrapped | Returns to ProfileScreen | | |

---

## 14. Simulator Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 14.1 | Open SimulatorScreen | Flight selector or demo flight visible | | |
| 14.2 | Tap "Start Demo" / one-tap demo | InFlightScreen opens in simulated mode | | |
| 14.3 | Jump to % slider | Dragging slider moves simulated flight position | | |
| 14.4 | Time multiplier | Higher multiplier accelerates simulation visibly | | |
| 14.5 | Simulator ends | FlightSummaryScreen appears | | |

---

## 15. Referral Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 15.1 | Referral code visible | Unique code displayed prominently | | |
| 15.2 | Share button | Share sheet opens with referral link / code | | |
| 15.3 | Code is copied to clipboard (if tap-to-copy) | Clipboard receives correct value | | |

---

## 16. Paywall Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 16.1 | 3 plan options visible | Monthly, Annual, Lifetime (or equivalent) shown | | |
| 16.2 | Plan prices displayed | Correct prices from RevenueCat product catalog | | |
| 16.3 | Tap a plan → "Subscribe" | Native StoreKit / Play Billing sheet appears | | |
| 16.4 | "Restore Purchase" button | Restores existing subscription without error | | |
| 16.5 | Dismiss paywall | Returns to previous screen | | |
| 16.6 | Free tier limit reached | Paywall appears when free POI limit exceeded | | |
| 16.7 | Pro user | Paywall not shown for subscribed users | | |

---

## 17. Stats Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 17.1 | Total flights number | Matches completed flights in Collection | | |
| 17.2 | Distance chart | Chart renders with data (no blank area) | | |
| 17.3 | Fun equivalents | "You flew X times around the Earth" style labels present | | |
| 17.4 | Empty state | Friendly message shown if no flights yet | | |

---

## 18. Leaderboard Screen

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 18.1 | Leaderboard waitlist UI visible | "Join waitlist" form or info screen shown | | |
| 18.2 | Email input + submit | Submission succeeds or shows appropriate feedback | | |
| 18.3 | Duplicate submission | Handled gracefully, not crashed | | |

---

## 19. Critical User Flows

### Flow 1 — First-time user adds and flies their first flight

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| F1.1 | Fresh install → complete onboarding | HomeScreen reached | | |
| F1.2 | Tap "+" → search for a real flight | Flight info card shown | | |
| F1.3 | Add flight | Flight appears as hero card on HomeScreen | | |
| F1.4 | Tap "Confirm Takeoff" | InFlightScreen opens | | |
| F1.5 | Tap first POI card | POIDetailScreen opens with content | | |
| F1.6 | Share POI | Share sheet opens | | |
| F1.7 | Back to InFlight → end flight (simulator or real) | FlightSummaryScreen shown | | |
| F1.8 | View summary, close | HomeScreen, flight marked completed | | |

### Flow 2 — Returning user with upcoming flight

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| F2.1 | Relaunch app | HomeScreen with hero countdown shown immediately | | |
| F2.2 | Countdown is live | Seconds ticking down without manual action | | |
| F2.3 | Open FlightDetailScreen | Status badge reflects real-time status | | |
| F2.4 | Background app 5 min, reopen | Countdown still accurate, no stale data | | |

### Flow 3 — Power user post-flight achievement

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| F3.1 | Complete a qualifying flight (e.g. first international) | FlightSummaryScreen opens | | |
| F3.2 | Achievement card animates | Confetti or unlock animation plays | | |
| F3.3 | Achievement visible in Collection > Achievements | Badge shown as earned | | |
| F3.4 | Open Wrapped | Stats reflect the new flight | | |
| F3.5 | Share Wrapped final slide | Story card exported to share sheet | | |

### Flow 4 — Edge cases

| # | Step | Expected | Status | Notes |
|---|------|----------|--------|-------|
| E4.1 | Enable airplane mode during active InFlight | Map freezes gracefully, no crash; reconnects when back online | | |
| E4.2 | Switch language mid-flight (in Settings) | UI updates or prompts restart; no data corruption | | |
| E4.3 | Kill app during active InFlight, relaunch | App resumes from correct state or prompts recovery | | |
| E4.4 | Very long flight number input | Input capped or error shown before submit | | |
| E4.5 | Device rotation on all screens | No layout overflow or crash on any screen | | |
| E4.6 | Low memory (background heavy apps) | No crash or data loss | | |
| E4.7 | Downgrade — remove subscription, relaunch | Free tier limits enforced, no stale pro access | | |

---

## 20. Backend / API (reference for paired backend testing)

| # | Check | Expected | Status | Notes |
|---|-------|----------|--------|-------|
| B1 | `GET /health` | `{ok:true, ts:<number>}` — 200 | | |
| B2 | `GET /metrics` | Prometheus text format — 200 | | |
| B3 | `POST /flights/lookup` without auth | 401 | | |
| B4 | `POST /flights/lookup` with valid token | 200 with flight JSON | | |
| B5 | `POST /flights/lookup` with bad date | 400 with validation error | | |
| B6 | `POST /flights/package` — 6th call in 1 min | 429 rate limited | | |
| B7 | `POST /subscription/verify` with empty body | 400 | | |
| B8 | CORS from disallowed origin | 500 / 403, no response body | | |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev | | | |
| PM | | | |

**Overall result:** Pass / Fail / Conditional pass

**Notes:**
