import { Platform } from 'react-native';
import { collectionsStore } from '../gamification/collections';

// expo-av is optional — sounds are wired for future when sound files are added.
// We lazy-import so the app doesn't crash if expo-av isn't installed yet.
let Audio: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Audio = require('expo-av').Audio;
} catch {
  // expo-av not installed; sounds are silently disabled
}

let achievementSound: any | null = null;
let popSound: any | null = null;

export async function initSounds(): Promise<void> {
  if (Platform.OS === 'web' || !Audio || achievementSound) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
    const { sound: as } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../../assets/sounds/achievement.mp3')
    );
    achievementSound = as;
    const { sound: ps } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../../assets/sounds/poi.mp3')
    );
    popSound = ps;
  } catch (e) {
    console.warn('[Sounds] failed to load:', e);
  }
}

export function isSoundEnabled(): boolean {
  return collectionsStore.getSoundEnabled();
}

export function setSoundEnabled(enabled: boolean): void {
  collectionsStore.setSoundEnabled(enabled);
}

export async function playAchievementSound(): Promise<void> {
  if (!isSoundEnabled() || !achievementSound) return;
  try {
    await achievementSound.replayAsync();
  } catch {
    // Silently ignore playback errors
  }
}

export async function playPopSound(): Promise<void> {
  if (!isSoundEnabled() || !popSound) return;
  try {
    await popSound.replayAsync();
  } catch {
    // Silently ignore playback errors
  }
}
