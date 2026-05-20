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
  if (Platform.OS === 'web' || !Audio) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
    // Sound assets not bundled yet — placeholder for future implementation.
    // When adding sounds, load them here:
    //   const { sound } = await Audio.Sound.createAsync(require('../../../assets/sounds/achievement.mp3'));
    //   achievementSound = sound;
  } catch {
    // Silently ignore — audio permission not granted or device unsupported
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
