import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Browser preview: no share sheet. */
export async function shareView(_ref: RefObject<View | null>): Promise<boolean> {
  return false;
}
