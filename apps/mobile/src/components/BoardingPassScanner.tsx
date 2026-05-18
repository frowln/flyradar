import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme/colors';

export interface BoardingPassData {
  flightNumber: string;
  date: string; // YYYY-MM-DD
}

interface Props {
  onScan: (data: BoardingPassData) => void;
  onClose: () => void;
}

/**
 * Parse IATA BCBP (Bar Coded Boarding Pass) format
 * Format: M1LASTNAME/FIRSTNAME ETICKET ORIGIN DEST AIRLINE FLIGHTNO DATE CLASS...
 * Field positions (format S - single leg):
 *   Position 0: 'M' (format code)
 *   Position 1: number of legs
 *   Positions 2-22: passenger name
 *   Position 23: 'E' (electronic ticket indicator)
 *   Positions 30-35: origin (3 letters padded)
 *   Positions 36-42: destination (3 letters padded)
 *   Positions 42-45: airline designator (2 chars)
 *   Positions 44-47: flight number (4 digits, right-justified, space padded)
 *   Positions 46-48: day of year (3 digits)
 *
 * Note: exact positions vary by airline — we use regex as fallback
 */
function parseBCBP(raw: string): BoardingPassData | null {
  try {
    // Method 1: Try IATA BCBP structured parse
    if (raw.startsWith('M') && raw.length > 50) {
      // Extract flight number: airline (2 chars) + flight number (4 chars) starting at pos 42
      const airlineCode = raw.substring(36, 38).trim();
      const flightDigits = raw.substring(38, 43).trim().replace(/^0+/, '');
      const dayOfYear = parseInt(raw.substring(44, 47), 10);

      if (airlineCode.length >= 2 && !isNaN(dayOfYear) && dayOfYear > 0 && dayOfYear <= 366) {
        const flightNumber = `${airlineCode}${flightDigits}`;
        const date = dayOfYearToDate(dayOfYear);
        if (date && flightNumber.length >= 3) {
          return { flightNumber, date };
        }
      }
    }

    // Method 2: Regex fallback — find airline code + flight number pattern
    const flightMatch = raw.match(/\b([A-Z]{2})(\d{1,4})\b/);
    const dayMatch = raw.match(/\b(\d{3})\b/);

    if (flightMatch && dayMatch) {
      const dayOfYear = parseInt(dayMatch[1], 10);
      if (dayOfYear > 0 && dayOfYear <= 366) {
        const date = dayOfYearToDate(dayOfYear);
        if (date) {
          return {
            flightNumber: `${flightMatch[1]}${flightMatch[2]}`,
            date
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

function dayOfYearToDate(day: number): string | null {
  if (day < 1 || day > 366) return null;
  const year = new Date().getFullYear();
  const date = new Date(year, 0); // Jan 1
  date.setDate(day);
  // If the date is in the past by more than 30 days, try next year
  const now = new Date();
  if (date < now && (now.getTime() - date.getTime()) > 30 * 24 * 60 * 60 * 1000) {
    date.setFullYear(year + 1, 0, 1);
    date.setDate(day);
  }
  return date.toISOString().slice(0, 10);
}

export default function BoardingPassScanner({ onScan, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    const parsed = parseBCBP(data);
    if (parsed) {
      onScan(parsed);
    } else {
      Alert.alert(
        'Could not read boarding pass',
        'Try entering your flight details manually.',
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is required to scan boarding passes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['pdf417', 'qr', 'aztec'] }}
        onBarcodeScanned={handleBarcode}
      />
      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        <View style={styles.viewfinder} />
        <Text style={styles.hint}>Point at the barcode on your boarding pass</Text>
      </View>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeText}>✕ Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000'
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20
  },
  viewfinder: {
    width: 280,
    height: 120,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 8,
    backgroundColor: 'transparent'
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20
  },
  closeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  text: {
    color: colors.text,
    fontSize: 15,
    textAlign: 'center'
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8
  },
  cancelButton: {
    backgroundColor: colors.surface
  },
  buttonText: {
    color: colors.text,
    fontWeight: '600'
  }
});
