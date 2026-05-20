import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

export const haptics = {
  light: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => enabled && Haptics.selectionAsync()
};
