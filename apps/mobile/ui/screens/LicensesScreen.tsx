import { useState } from 'react';
import { View, FlatList, StyleSheet, Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { palette, s, gutter, line } from '../design/tokens';
import { Label, Body, Small, DataSmall, Title } from '../design/type';
import { Screen, Gutter, Space, PressSurface, Rule, textHitSlop } from '../design/layout';
import { t } from '../../src/i18n';
import licenses from '../../src/legal/licenses.json';
import { API_ENABLED } from '../../src/core/api/client';

/**
 * Where everything in the app comes from, and under what terms.
 *
 * Data first — it is what the passenger actually reads — then the typefaces,
 * then every open-source component compiled into the app (the list is
 * generated from the bundle by `scripts/licenses.mjs`).
 */

interface Pkg {
  name: string;
  version: string;
  license: string;
  copyright: string;
}

interface Source {
  key: string;
  name: string;
  license: string;
  url?: string;
}

const SOURCES: Source[] = [
  { key: 'editorial', name: 'SkyAtlas', license: '© SkyAtlas' },
  { key: 'naturalEarth', name: 'Natural Earth', license: 'Public domain', url: 'https://www.naturalearthdata.com' },
  { key: 'ourAirports', name: 'OurAirports', license: 'Public domain', url: 'https://ourairports.com/data/' },
  { key: 'mwgg', name: 'mwgg/Airports', license: 'MIT · © 2014 mwgg', url: 'https://github.com/mwgg/Airports' },
  { key: 'wikipedia', name: 'Wikipedia', license: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { key: 'commons', name: 'Wikimedia Commons', license: 'CC BY / CC BY-SA / public domain', url: 'https://commons.wikimedia.org' },
  { key: 'osm', name: 'OpenStreetMap', license: 'ODbL · © OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
  { key: 'tiles', name: 'OpenMapTiles · OpenFreeMap', license: '© OpenMapTiles', url: 'https://openfreemap.org' },
  {
    key: 'terrain',
    name: 'Terrain Tiles (AWS Open Data)',
    license: 'SRTM, GMTED2010, ETOPO1, NED and others',
    url: 'https://registry.opendata.aws/terrain-tiles/'
  },
  ...(Platform.OS === 'web'
    ? [{ key: 'sentinel', name: 'Copernicus Sentinel-2', license: 'Contains modified Copernicus Sentinel data', url: 'https://registry.opendata.aws/sentinel-2-l2a-cogs/' }]
    : [])
];

/** Only in a build connected to the SkyAtlas flight services. */
const SERVICE_SOURCES: Source[] = [
  { key: 'aeroDataBox', name: 'AeroDataBox', license: 'API', url: 'https://aerodatabox.com' },
  { key: 'fr24', name: 'Flightradar24', license: 'API', url: 'https://www.flightradar24.com' },
  { key: 'openMeteo', name: 'Open-Meteo', license: 'CC BY 4.0', url: 'https://open-meteo.com' }
];

/** The licence text for a package, choosing MIT out of an "MIT OR …" pair. */
function textFor(license: string): string | undefined {
  const texts = licenses.texts as Record<string, string>;
  const key = Object.keys(texts).find((k) => license.includes(k));
  return key ? texts[key] : undefined;
}

function PackageRow({ p }: { p: Pkg }) {
  const [open, setOpen] = useState(false);
  const text = textFor(p.license);
  return (
    <PressSurface
      onPress={() => setOpen(!open)}
      accessibilityLabel={`${p.name}, ${p.license}`}
      accessibilityState={{ expanded: open }}
      style={styles.pkg}
    >
      <View style={styles.pkgHead}>
        <Body style={styles.flex} numberOfLines={1}>
          {p.name}
        </Body>
        <DataSmall allowFontScaling={false}>{p.license}</DataSmall>
      </View>
      {p.copyright ? <Small numberOfLines={open ? undefined : 1}>{p.copyright}</Small> : null}
      {open && text ? (
        <>
          <Space h={s.x2} />
          <Small tone="dim">{text}</Small>
        </>
      ) : null}
    </PressSurface>
  );
}

export default function LicensesScreen() {
  const nav = useNavigation();

  const header = (
    <View>
      <Gutter>
        <Space h={s.x4} />
        <Title accessibilityRole="header">{t('licenses.title')}</Title>
      </Gutter>

      <Gutter style={styles.section}>
        <Label tone="dim" accessibilityRole="header">{t('licenses.data')}</Label>
      </Gutter>
      <Rule />
      {(API_ENABLED ? [...SOURCES, ...SERVICE_SOURCES] : SOURCES).map((src) => {
        const label = `${src.name}, ${t(`licenses.src.${src.key}`)}, ${src.license}`;
        const body = (
          <>
            <View style={styles.pkgHead}>
              <Body style={styles.flex}>{src.name}</Body>
              {src.url ? <DataSmall allowFontScaling={false}>›</DataSmall> : null}
            </View>
            <Small>{t(`licenses.src.${src.key}`)}</Small>
            <Small tone="dim">{src.license}</Small>
          </>
        );
        const url = src.url;
        return url ? (
          <PressSurface key={src.key} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={label} style={styles.pkg}>
            {body}
          </PressSurface>
        ) : (
          <View key={src.key} accessible accessibilityLabel={label} style={styles.pkg}>
            {body}
          </View>
        );
      })}

      <Gutter style={styles.section}>
        <Label tone="dim" accessibilityRole="header">{t('licenses.fonts')}</Label>
      </Gutter>
      <Rule />
      {licenses.fonts.map((f) => (
        <View key={f.name} style={styles.pkg}>
          <View style={styles.pkgHead}>
            <Body style={styles.flex}>{f.name}</Body>
            <DataSmall allowFontScaling={false}>{f.license}</DataSmall>
          </View>
          <Small>{f.copyright}</Small>
        </View>
      ))}
      <Gutter style={styles.note}>
        <Small tone="dim">{textFor('OFL-1.1')}</Small>
      </Gutter>

      <Gutter style={styles.section}>
        <Label tone="dim" accessibilityRole="header">
          {t('licenses.software', { n: licenses.packages.length })}
        </Label>
        <Space h={s.x2} />
        <Small>{t('licenses.softwareNote')}</Small>
      </Gutter>
      <Rule />
    </View>
  );

  return (
    <Screen>
      <View style={styles.top}>
        <PressSurface onPress={() => nav.goBack()} accessibilityLabel={t('common.back')} hitSlop={textHitSlop} style={styles.back}>
          <Label tone="muted">{`‹ ${t('common.back')}`}</Label>
        </PressSurface>
      </View>
      <FlatList
        data={licenses.packages as Pkg[]}
        keyExtractor={(p) => `${p.name}@${p.version}`}
        renderItem={({ item }) => <PackageRow p={item} />}
        ListHeaderComponent={header}
        ListFooterComponent={<Space h={s.x12} />}
        initialNumToRender={20}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.rule
  },
  back: { paddingVertical: s.x1, paddingRight: s.x4 },
  section: { paddingTop: s.x8, paddingBottom: s.x3 },
  note: { paddingVertical: s.x3 },
  pkg: {
    paddingHorizontal: gutter,
    paddingVertical: s.x3,
    gap: s.x1,
    borderBottomWidth: line.hair,
    borderBottomColor: palette.ruleSoft
  },
  pkgHead: { flexDirection: 'row', alignItems: 'center', gap: s.x3 }
});
