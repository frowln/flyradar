# Sound Assets

Place royalty-free MP3 files here before enabling sounds.

## Required files

| File | Purpose | Source |
|------|---------|--------|
| `achievement.mp3` | Achievement unlock — short celebratory ping | https://pixabay.com/sound-effects/search/achievement/ |
| `poi.mp3` | POI appear — soft notification ding | https://pixabay.com/sound-effects/search/notification/ |

## Notes

- Files are lazy-loaded via `expo-av` in `src/core/ux/sounds.ts`
- If files are missing, sounds are silently disabled — no crash
- Keep files under 100 KB for fast startup
- Recommended format: MP3, 44.1 kHz, stereo
