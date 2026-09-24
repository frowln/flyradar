import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import maplibregl, { type Map as GLMap, type Marker as GLMarker, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { POI } from '@skyatlas/shared';
import type { RouteMapProps } from './RouteMap';
import { palette, line, s as space } from '../design/tokens';
import { decorative } from '../design/layout';
import { Label } from '../design/type';
import { t } from '../../src/i18n';
import { getCountries } from '../../src/core/data/datasets';

/**
 * The route as a chart, in a browser.
 *
 * A hosted demo cannot reach tile servers, so this map draws everything from
 * data it carries: elevation tiles shipped with the build (public/dem/, made by
 * scripts/preview/fetch-dem.mjs) coloured by height — sea blue by depth, green
 * lowlands, brown uplands, white summits — and shaded, with country borders
 * from the app's own dataset. Places are marks the passenger can tap, as on the
 * phone. Without the elevation files it still draws land, borders and route.
 */

const CRUISE_ZOOM = 4.2;

const DAY = {
  ocean: '#9fc3e2',
  land: '#dfe4cf',
  border: 'rgba(55, 58, 66, 0.5)',
  leg: '#56657A',
  flown: '#E07A12',
  dot: '#3A4656',
  label: '#1C2530',
  halo: 'rgba(255, 255, 255, 0.92)',
  opened: '#C25E00'
};
const NIGHT = {
  ocean: '#080d13',
  land: '#161c24',
  border: 'rgba(154, 165, 180, 0.32)',
  leg: palette.rule,
  flown: palette.amber,
  dot: palette.inkMuted,
  label: palette.inkMuted,
  halo: palette.void,
  opened: palette.amber
};

/** Hypsometric tints: depth in blues, height from green through brown to snow. */
const RELIEF_DAY = [
  'interpolate', ['linear'], ['elevation'],
  -8000, '#0d3564', -5000, '#1e5694', -2500, '#3d7dbd', -600, '#6fa7dc', -60, '#9cc6ea', -1, '#a9cfee',
  0, '#98c28a', 150, '#b2d197', 500, '#d9d9a0', 1000, '#dcc08c', 1800, '#c89e70', 2800, '#a98160', 3800, '#b9aa9f', 4800, '#ecebea', 7000, '#ffffff'
];
const RELIEF_NIGHT = [
  'interpolate', ['linear'], ['elevation'],
  -8000, '#04070b', -600, '#0a1017', -1, '#0d141c',
  0, '#19202a', 800, '#1f2630', 2000, '#29313c', 3500, '#36404c', 5000, '#4a5360'
];
const SHADE_DAY = {
  'hillshade-exaggeration': 0.55,
  'hillshade-shadow-color': 'rgba(58, 44, 24, 0.6)',
  'hillshade-highlight-color': 'rgba(255, 255, 255, 0.4)',
  'hillshade-accent-color': 'rgba(58, 44, 24, 0.25)'
};
const SHADE_NIGHT = {
  'hillshade-exaggeration': 0.6,
  'hillshade-shadow-color': 'rgba(0, 0, 0, 0.7)',
  'hillshade-highlight-color': 'rgba(150, 168, 196, 0.18)',
  'hillshade-accent-color': 'rgba(0, 0, 0, 0.3)'
};

// ─── Elevation tiles shipped with the build ────────────────────────────────

interface DemIndex {
  chunks: number;
  maxzoom: number;
  tiles: Record<string, [number, number, number]>;
}

let index: Promise<DemIndex | null> | null = null;
const chunks = new Map<number, Promise<ArrayBuffer>>();

/**
 * Where the build is served from, taken once at load: screens change the
 * address later (/flight/…), and a relative URL would then point inside it.
 */
const BASE = typeof location === 'undefined' ? '' : location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

function demIndex(): Promise<DemIndex | null> {
  index ??= fetch(`${BASE}dem/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<DemIndex>) : null))
    .catch(() => null);
  return index;
}

function chunk(i: number): Promise<ArrayBuffer> {
  let c = chunks.get(i);
  if (!c) {
    c = fetch(`${BASE}dem/pack-${i}.bin`).then((r) => r.arrayBuffer());
    chunks.set(i, c);
  }
  return c;
}

async function tileBytes(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  const idx = await demIndex();
  const at = idx?.tiles[`${z}/${x}/${y}`];
  if (!at) return null;
  const buf = await chunk(at[0]);
  return buf.slice(at[1], at[1] + at[2]);
}

/**
 * A tile the build does not carry, cut from the nearest ancestor it does.
 * Heights are decoded, interpolated bilinearly and encoded again: Terrarium
 * packs a height into the RGB bytes, so scaling the image itself would either
 * blend bytes into heights that never existed (smoothing) or show blocks
 * (nearest neighbour).
 */
async function fromAncestor(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  for (let up = 1; up <= z; up++) {
    const pz = z - up;
    const px = x >> up;
    const py = y >> up;
    const bytes = await tileBytes(pz, px, py);
    if (!bytes) continue;
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const src = new OffscreenCanvas(256, 256);
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.drawImage(img, 0, 0);
    const from = sctx.getImageData(0, 0, 256, 256).data;
    const height = (i: number) => from[i]! * 256 + from[i + 1]! + from[i + 2]! / 256 - 32768;
    const scale = 1 / (1 << up);
    const ox = (x - (px << up)) * 256 * scale;
    const oy = (y - (py << up)) * 256 * scale;
    const out = new OffscreenCanvas(256, 256);
    const octx = out.getContext('2d');
    if (!octx) return null;
    const img2 = octx.createImageData(256, 256);
    const to = img2.data;
    for (let j = 0; j < 256; j++) {
      const fy = Math.min(255, oy + (j + 0.5) * scale - 0.5);
      const y0 = Math.max(0, Math.floor(fy));
      const y1 = Math.min(255, y0 + 1);
      const ty = Math.max(0, fy - y0);
      for (let i = 0; i < 256; i++) {
        const fx = Math.min(255, ox + (i + 0.5) * scale - 0.5);
        const x0 = Math.max(0, Math.floor(fx));
        const x1 = Math.min(255, x0 + 1);
        const tx = Math.max(0, fx - x0);
        const h =
          (height((y0 * 256 + x0) * 4) * (1 - tx) + height((y0 * 256 + x1) * 4) * tx) * (1 - ty) +
          (height((y1 * 256 + x0) * 4) * (1 - tx) + height((y1 * 256 + x1) * 4) * tx) * ty;
        const v = h + 32768;
        const k = (j * 256 + i) * 4;
        to[k] = Math.floor(v / 256);
        to[k + 1] = Math.floor(v) % 256;
        to[k + 2] = Math.floor((v - Math.floor(v)) * 256);
        to[k + 3] = 255;
      }
    }
    octx.putImageData(img2, 0, 0);
    return (await out.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }
  return null;
}

let protocolAdded = false;
function addDemProtocol(): void {
  if (protocolAdded) return;
  protocolAdded = true;
  maplibregl.addProtocol('dem', async (params) => {
    const m = /dem:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error('bad tile address');
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const data = (await tileBytes(z, x, y)) ?? (await fromAncestor(z, x, y));
    if (!data) throw new Error('no elevation here');
    return { data };
  });
}

// ─── Map ───────────────────────────────────────────────────────────────────

function unwrap(points: Array<{ lat: number; lon: number }>): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | null = null;
  for (const p of points) {
    let lon = p.lon;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push([lon, p.lat]);
    prev = lon;
  }
  return out;
}

function bordersGeoJSON(): GeoJSON.FeatureCollection {
  try {
    return {
      type: 'FeatureCollection',
      features: getCountries().map((c) => ({ type: 'Feature', properties: { cc: c.cc }, geometry: c.g as unknown as GeoJSON.MultiPolygon }))
    };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

function styleFor(night: boolean): StyleSpecification {
  const ink = night ? NIGHT : DAY;
  return {
    version: 8,
    sources: {
      dem: { type: 'raster-dem', tiles: ['dem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 6, encoding: 'terrarium' },
      countries: { type: 'geojson', data: bordersGeoJSON() },
      leg: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      flown: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': ink.ocean } },
      { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': ink.land } },
      { id: 'relief', type: 'color-relief', source: 'dem', paint: { 'color-relief-color': (night ? RELIEF_NIGHT : RELIEF_DAY) as never } },
      { id: 'shade', type: 'hillshade', source: 'dem', paint: night ? SHADE_NIGHT : SHADE_DAY },
      { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': ink.border, 'line-width': 0.8 } },
      {
        id: 'leg',
        type: 'line',
        source: 'leg',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ink.leg, 'line-width': 1.5, 'line-dasharray': [3, 4] }
      },
      {
        id: 'flown',
        type: 'line',
        source: 'flown',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ink.flown, 'line-width': 2.6 }
      }
    ]
  };
}

function placeElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateY(8px)';
  const dot = document.createElement('div');
  dot.style.cssText = 'width:9px;height:9px;border-radius:50%;box-sizing:border-box';
  const label = document.createElement('div');
  label.style.cssText = 'margin-top:3px;font:11px/1.2 Inter_500Medium, Inter, system-ui, sans-serif;white-space:nowrap;pointer-events:none';
  el.append(dot, label);
  return el;
}

function paintPlace(el: HTMLElement, name: string, opened: boolean, night: boolean): void {
  const ink = night ? NIGHT : DAY;
  const [dot, label] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
  const color = opened ? ink.opened : ink.dot;
  dot.style.border = `1.5px solid ${color}`;
  dot.style.background = opened ? color : 'transparent';
  label.textContent = name;
  label.style.color = opened ? ink.opened : ink.label;
  label.style.textShadow = `0 0 2px ${ink.halo}, 0 0 3px ${ink.halo}, 0 0 4px ${ink.halo}`;
}

export default function RouteMap({
  route,
  position,
  pois = [],
  seen,
  follow = true,
  onSelectPOI,
  labelFor,
  night: nightOutside = false,
  expanded = false,
  onToggleExpand
}: RouteMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<GLMap | null>(null);
  const plane = useRef<GLMarker | null>(null);
  const marks = useRef(new Map<string, GLMarker>());
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(CRUISE_ZOOM);
  const [override, setOverride] = useState<boolean | null>(null);
  const night = override ?? nightOutside;
  const interacting = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const select = useRef(onSelectPOI);
  select.current = onSelectPOI;

  // Create the map once.
  useEffect(() => {
    if (!host.current) return;
    addDemProtocol();
    const m = new maplibregl.Map({
      container: host.current,
      style: styleFor(night),
      center: [position.lon, position.lat],
      zoom: CRUISE_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Relief: AWS Terrain Tiles (SRTM, GMTED2010, ETOPO1 and others) · Borders: Natural Earth'
      }),
      'bottom-left'
    );
    // Folded to its "i" until tapped: open, it covers the map's own buttons.
    m.once('load', () => host.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
    m.on('zoomend', () => setZoom(m.getZoom()));
    const touched = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      interacting.current = true;
      if (idle.current) clearTimeout(idle.current);
      // Give the camera back only once the passenger has clearly stopped exploring.
      idle.current = setTimeout(() => (interacting.current = false), 12_000);
    };
    m.on('dragstart', touched);
    m.on('zoomstart', touched);
    m.on('load', () => setReady(true));
    const el = document.createElement('div');
    el.style.cssText = `width:22px;height:22px;border-radius:11px;border:1px solid ${palette.amberDim};display:flex;align-items:center;justify-content:center`;
    el.innerHTML = `<div style="width:8px;height:8px;border-radius:4px;background:${palette.amber}"></div>`;
    plane.current = new maplibregl.Marker({ element: el }).setLngLat([position.lon, position.lat]).addTo(m);
    map.current = m;
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      if (idle.current) clearTimeout(idle.current);
      marks.current.forEach((mk) => mk.remove());
      marks.current.clear();
      m.remove();
      map.current = null;
    };
    // The map is created once; later changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Day or night: repaint in place, keeping the camera and the marks.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const ink = night ? NIGHT : DAY;
    m.setPaintProperty('ocean', 'background-color', ink.ocean);
    m.setPaintProperty('land', 'fill-color', ink.land);
    m.setPaintProperty('relief', 'color-relief-color', (night ? RELIEF_NIGHT : RELIEF_DAY) as never);
    for (const [k, v] of Object.entries(night ? SHADE_NIGHT : SHADE_DAY)) m.setPaintProperty('shade', k, v);
    m.setPaintProperty('borders', 'line-color', ink.border);
    m.setPaintProperty('leg', 'line-color', ink.leg);
    m.setPaintProperty('flown', 'line-color', ink.flown);
  }, [night, ready]);

  const path = useMemo(() => unwrap(route), [route]);

  useEffect(() => {
    const src = map.current?.getSource('leg') as maplibregl.GeoJSONSource | undefined;
    if (!ready || !src) return;
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } });
  }, [path, ready]);

  useEffect(() => {
    const m = map.current;
    const src = m?.getSource('flown') as maplibregl.GeoJSONSource | undefined;
    if (!m || !ready || !src) return;
    const n = route.filter((p) => p.elapsedSeconds <= position.elapsedS).length;
    const coords = n > 1 ? path.slice(0, n) : [[position.lon, position.lat], [position.lon, position.lat]];
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    plane.current?.setLngLat([position.lon, position.lat]);
    if (follow && !interacting.current) {
      m.easeTo({ center: [position.lon, position.lat], zoom: expanded ? CRUISE_ZOOM + 0.8 : CRUISE_ZOOM, duration: 600 });
    }
  }, [route, path, position.elapsedS, position.lat, position.lon, follow, expanded, ready]);

  // Places: one mark each, repainted when opened or when the theme changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const keep = new Set(pois.map((p) => p.id));
    for (const [id, mk] of marks.current) {
      if (!keep.has(id)) {
        mk.remove();
        marks.current.delete(id);
      }
    }
    for (const poi of pois) {
      let mk = marks.current.get(poi.id);
      if (!mk) {
        const el = placeElement();
        const target: POI = poi;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          select.current?.(target);
        });
        mk = new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat([poi.lon, poi.lat]).addTo(m);
        marks.current.set(poi.id, mk);
      }
      const opened = seen?.has(poi.id) ?? false;
      paintPlace(mk.getElement(), labelFor?.(poi) ?? poi.name, opened, night);
      // At cruise scale only the notable and the opened are named; closer in, all.
      const named = opened || (poi.rank ?? 0) >= 8 || zoom >= 5.5;
      (mk.getElement().children[1] as HTMLElement).style.display = named ? 'block' : 'none';
    }
  }, [pois, seen, labelFor, night, zoom]);

  return (
    <View style={styles.fill}>
      <View {...decorative} style={styles.fill}>
        {createElement('div', { ref: host, style: { position: 'absolute', inset: 0 } })}
      </View>
      <View style={styles.controls} pointerEvents="box-none">
        <Pressable
          onPress={() => setOverride(!night)}
          accessibilityRole="button"
          accessibilityLabel={night ? t('map.toDay') : t('map.toNight')}
          style={styles.control}
        >
          <Label tone="muted">{night ? t('map.day') : t('map.night')}</Label>
        </Pressable>
        {onToggleExpand ? (
          <Pressable
            onPress={onToggleExpand}
            accessibilityRole="button"
            accessibilityLabel={expanded ? t('map.collapse') : t('map.expand')}
            style={styles.control}
          >
            <Label tone="muted">{expanded ? t('map.collapse') : t('map.expand')}</Label>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.void },
  controls: { position: 'absolute', right: space.x3, bottom: space.x3, flexDirection: 'row', gap: space.x2 },
  control: {
    minHeight: 32,
    paddingHorizontal: space.x3,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(11, 14, 17, 0.82)',
    borderWidth: line.hair,
    borderColor: palette.rule
  }
});
