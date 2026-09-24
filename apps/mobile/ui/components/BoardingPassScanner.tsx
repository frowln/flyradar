import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body } from '../design/type';
import { Screen, Space, PressSurface } from '../design/layout';
import { parseBCBP, type BoardingPass } from '../../src/core/wallet/bcbp';
import { haptics } from '../../src/core/ux/haptics';
import { t } from '../../src/i18n';

/**
 * Scanning the barcode on a boarding pass — paper, screen or Wallet.
 *
 * The frame stays live after a miss: glare and a half-visible code are the
 * usual reasons, and asking the passenger to dismiss a dialog before trying
 * again turns a two-second action into a chore.
 */
export default function BoardingPassScanner({
  onScan,
  onClose
}: {
  onScan: (pass: BoardingPass) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [miss, setMiss] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const onBarcode = ({ data }: { data: string }) => {
    if (done.current) return;
    const pass = parseBCBP(data);
    if (pass) {
      done.current = true;
      haptics.success();
      onScan(pass);
    } else {
      setMiss(true);
    }
  };

  if (!permission?.granted) {
    return (
      <Screen style={styles.center}>
        <View style={styles.pad}>
          <Label tone="accent">{t('scan.title')}</Label>
          <Space h={s.x3} />
          <Body tone="muted">{t('scan.permission')}</Body>
          <Space h={s.x6} />
          <PressSurface onPress={requestPermission} style={styles.button} accessibilityLabel={t('scan.allow')}>
            <Label tone="accent">{t('scan.allow')}</Label>
          </PressSurface>
          <PressSurface onPress={onClose} style={styles.button} accessibilityLabel={t('common.cancel')}>
            <Label tone="muted">{t('common.cancel')}</Label>
          </PressSurface>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['pdf417', 'aztec', 'qr', 'datamatrix'] }}
        onBarcodeScanned={onBarcode}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Space h={s.x5} />
        <View style={styles.hint}>
          <Body>{miss ? t('scan.miss') : t('scan.hint')}</Body>
        </View>
      </View>
      <PressSurface onPress={onClose} style={styles.close} accessibilityLabel={t('common.cancel')}>
        <Label tone="default">{t('common.cancel')}</Label>
      </PressSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.void },
  center: { justifyContent: 'center' },
  pad: { paddingHorizontal: gutter },
  button: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderTopColor: palette.rule
  },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '82%',
    aspectRatio: 2.6,
    borderWidth: line.bold,
    borderColor: palette.amber
  },
  hint: {
    marginHorizontal: gutter,
    paddingHorizontal: s.x4,
    paddingVertical: s.x3,
    backgroundColor: 'rgba(8,10,12,0.8)'
  },
  close: {
    position: 'absolute',
    top: s.x16,
    right: gutter,
    paddingHorizontal: s.x4,
    paddingVertical: s.x2,
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.ground
  }
});
