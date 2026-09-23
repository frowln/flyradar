import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body, Small } from '../design/type';
import { Gutter, Space, PressSurface } from '../design/layout';
import { social } from '../../src/core/api/social';
import { haptics } from '../../src/core/ux/haptics';
import { t } from '../../src/i18n';

interface Props {
  onLinked?: (userId: string) => void;
}

/**
 * Claiming an anonymous account with an Apple identity.
 *
 * Deliberately not an onboarding step. The atlas already exists on the device
 * and keeps working signed out; signing in is what makes it survive a lost
 * phone. Framing it that way — as insurance rather than as a gate — is why the
 * button lives in settings and says what it protects.
 *
 * Apple relays a private email and may withhold the name entirely, so nothing
 * here depends on either: the account is identified by the stable subject alone.
 */
export default function AppleSignIn({ onLinked }: Props) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then((ok) => alive && setAvailable(ok));
    social.me().then((me) => alive && setLinked(Boolean(me?.linked)));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME]
      });
      if (!credential.user) throw new Error('No subject returned');

      const result = await social.linkApple(credential.user);
      if (!result) throw new Error('Link failed');

      // Apple only returns the name on the very first authorisation, so it is
      // now or never — and it is optional, which is why this cannot fail the flow.
      const given = credential.fullName?.givenName?.trim();
      if (given) await social.setHandle(given);

      haptics.success();
      setLinked(true);
      onLinked?.(result.id);
    } catch (err) {
      // A cancelled sign-in is not an error the passenger needs to hear about.
      const cancelled =
        typeof err === 'object' && err !== null && 'code' in err && err.code === 'ERR_REQUEST_CANCELED';
      if (!cancelled) {
        haptics.error();
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }, [onLinked]);

  if (!available) return null;

  if (linked) {
    return (
      <Gutter style={styles.linked}>
        <Label tone="accent">{t('apple.linked')}</Label>
        <Space h={s.x2} />
        <Small>{t('apple.linkedNote')}</Small>
      </Gutter>
    );
  }

  return (
    <View>
      <Gutter>
        <Label tone="dim">{t('apple.title')}</Label>
        <Space h={s.x2} />
        <Body tone="muted" style={styles.measure}>
          {t('apple.why')}
        </Body>
      </Gutter>
      <Space h={s.x3} />
      <PressSurface onPress={signIn} accessibilityLabel={t('apple.button')} style={styles.button}>
        {busy ? <ActivityIndicator color={palette.amber} /> : <Label tone="accent">{t('apple.button')}</Label>}
      </PressSurface>
      {failed ? (
        <Gutter style={styles.failed}>
          <Small tone="bad">{t('apple.failed')}</Small>
        </Gutter>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { maxWidth: 340 },
  button: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.raised
  },
  linked: { paddingVertical: s.x3 },
  failed: { paddingTop: s.x3 }
});
