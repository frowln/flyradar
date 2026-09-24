import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

/** Reads a bundled asset file as text (native: from the app bundle on disk). */
export async function readAssetText(mod: number): Promise<string> {
  const asset = Asset.fromModule(mod);
  if (!asset.localUri) await asset.downloadAsync();
  return FileSystem.readAsStringAsync(asset.localUri ?? asset.uri);
}
