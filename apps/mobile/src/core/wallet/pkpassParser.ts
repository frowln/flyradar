import { readAsStringAsync } from 'expo-file-system/legacy';

export interface ParsedPass {
  flightNumber: string;
  date: string; // YYYY-MM-DD
  origin?: string; // IATA
  destination?: string;
  passenger?: string;
}

export async function parsePkpassFile(uri: string): Promise<ParsedPass | null> {
  try {
    // jszip is required — add it via: npm install jszip
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const JSZip = require('jszip');
    const base64 = await readAsStringAsync(uri, { encoding: 'base64' });
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const passFile = zip.file('pass.json');
    if (!passFile) return null;
    const json = JSON.parse(await passFile.async('string'));
    return extractFlightInfo(json);
  } catch {
    return null;
  }
}

function extractFlightInfo(pass: any): ParsedPass | null {
  // Apple Wallet boarding pass structure:
  // pass.boardingPass.{auxiliaryFields, secondaryFields, primaryFields, headerFields}
  const fields = pass.boardingPass;
  if (!fields) return null;

  const allFields: any[] = [
    ...(fields.headerFields ?? []),
    ...(fields.primaryFields ?? []),
    ...(fields.secondaryFields ?? []),
    ...(fields.auxiliaryFields ?? [])
  ];

  const findField = (keys: string[]) =>
    allFields.find((f: any) =>
      keys.some((k) => f.key?.toLowerCase().includes(k.toLowerCase()))
    );

  const flightField = findField(['flight', 'flightnumber', 'flight-no']);
  const dateField = findField(['date', 'departure-date', 'boardingdate']);
  const originField = findField(['origin', 'depart', 'from']);
  const destField = findField(['destination', 'arrive', 'to']);
  const passField = findField(['passenger', 'name']);

  if (!flightField?.value) return null;

  const dateStr = String(dateField?.value ?? '');
  let date = new Date().toISOString().slice(0, 10);
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);

  return {
    flightNumber: String(flightField.value).replace(/\s+/g, '').toUpperCase(),
    date,
    origin: originField?.value ? String(originField.value).toUpperCase() : undefined,
    destination: destField?.value ? String(destField.value).toUpperCase() : undefined,
    passenger: passField?.value ? String(passField.value) : undefined
  };
}
