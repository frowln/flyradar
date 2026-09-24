import { readAsStringAsync } from 'expo-file-system/legacy';
import { parseBCBP } from './bcbp';

export interface ParsedPass {
  flightNumber: string;
  date: string; // YYYY-MM-DD
  origin?: string; // IATA
  destination?: string;
  seat?: string;
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

export function extractFlightInfo(pass: any): ParsedPass | null {
  // The barcode is the airline's own machine-readable record: trust it over
  // display fields, whose keys differ between every airline's pass designer.
  const messages: string[] = [
    ...(Array.isArray(pass?.barcodes) ? pass.barcodes.map((b: any) => b?.message) : []),
    pass?.barcode?.message
  ].filter((m): m is string => typeof m === 'string');
  for (const m of messages) {
    const bp = parseBCBP(m);
    if (bp) return { flightNumber: bp.flightNumber, date: bp.date, origin: bp.from, destination: bp.to, seat: bp.seat };
  }

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

  if (!flightField?.value) return null;

  // Wallet dates are ISO strings with the airport's offset; the calendar date
  // is the part before the T. Converting through Date would move it to the
  // phone's zone and, east of UTC, onto the previous day.
  const dateStr = String(dateField?.value ?? '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateStr) ? dateStr.slice(0, 10) : '';
  if (!date) return null;

  return {
    flightNumber: String(flightField.value).replace(/\s+/g, '').toUpperCase(),
    date,
    origin: originField?.value ? String(originField.value).toUpperCase() : undefined,
    destination: destField?.value ? String(destField.value).toUpperCase() : undefined
  };
}
