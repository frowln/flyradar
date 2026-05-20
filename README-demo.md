# SkyAtlas Client Demo — Quick Start

## Prerequisites

1. Install ngrok:
   ```bash
   brew install ngrok
   ```
2. Create a free account at https://ngrok.com and authenticate:
   ```bash
   ngrok config add-authtoken <YOUR_TOKEN>
   ```

## Run the demo tunnel

```bash
bash scripts/start-demo-tunnel.sh
```

This starts the SkyAtlas backend on port 3000 and opens an ngrok HTTPS tunnel.

## Connect the mobile app

1. Copy the `https://xxx.ngrok-free.app` URL shown in the ngrok output.
2. Open `apps/mobile/.env` and set:
   ```
   EXPO_PUBLIC_API_URL=https://xxx.ngrok-free.app
   ```
3. Rebuild the app:
   ```bash
   cd apps/mobile && npx expo start --clear
   ```

## Share with client

- **TestFlight**: archive and upload via Xcode, then invite via TestFlight link.
- **Simulator screencast**: use QuickTime → New Movie Recording → select simulator as source.
- **Expo Go**: run `npx expo start` and share the QR code (client needs Expo Go app).

## Troubleshoot

- Backend not starting? Check: `tail -50 /tmp/skyatlas-backend.log`
- Wrong URL? Re-copy from the ngrok terminal — it changes each free-tier restart.
- Network blocked? Upgrade to ngrok paid plan for a static domain.
