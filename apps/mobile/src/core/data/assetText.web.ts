import { Asset } from 'expo-asset';

/** Browser: assets are served next to the bundle. */
export async function readAssetText(mod: number): Promise<string> {
  const res = await fetch(Asset.fromModule(mod).uri);
  return res.text();
}
