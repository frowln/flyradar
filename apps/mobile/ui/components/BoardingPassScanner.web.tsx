import { StyleSheet, View } from 'react-native';
import { Screen, PressSurface, Space } from '../design/layout';
import { Body, Label } from '../design/type';
import { s, gutter } from '../design/tokens';
import type { BoardingPass } from '../../src/core/wallet/bcbp';
import { t } from '../../src/i18n';

/** Browser preview: there is no camera to scan with. */
export default function BoardingPassScanner({ onClose }: { onScan: (p: BoardingPass) => void; onClose: () => void }) {
  return (
    <Screen style={styles.center}>
      <View style={{ paddingHorizontal: gutter }}>
        <Body tone="muted">{t('scan.permission')}</Body>
        <Space h={s.x4} />
        <PressSurface onPress={onClose} accessibilityLabel={t('common.cancel')}>
          <Label tone="accent">{t('common.cancel')}</Label>
        </PressSurface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ center: { justifyContent: 'center' } });
