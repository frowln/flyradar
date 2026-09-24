import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

/** Renders a view to an image and opens the system share sheet with it. */
export async function shareView(ref: RefObject<View | null>): Promise<boolean> {
  if (!ref.current || !(await Sharing.isAvailableAsync())) return false;
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
  return true;
}
