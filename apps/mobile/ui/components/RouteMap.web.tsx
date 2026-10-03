import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import maplibregl, { type Map as GLMap, type Marker as GLMarker, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { POI } from '@skyatlas/shared';
import type { RouteMapProps } from './RouteMap';
import { PLANE_PATH } from './planeGlyph';
import { palette, line, s as space } from '../design/tokens';
import { decorative } from '../design/layout';
import { Label } from '../design/type';
import { t, getLocale } from '../../src/i18n';
import { getCountries, getPlaces } from '../../src/core/data/datasets';
import { countryName } from '../../src/core/places/names';
import { viewSector } from '../../src/core/flight/telemetry';
import { addDemProtocol, BASE } from '../../src/core/map/demPack.web';

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

type Lang = 'ru' | 'de' | 'fr' | 'es' | 'ja';
const lang = (): string => getLocale().slice(0, 2);
const localName = (n: string, l?: Partial<Record<string, string>>) => (lang() !== 'en' ? l?.[lang() as Lang] : undefined) ?? n;

/** A point inside a country's largest part, for its name. */
function countryLabels(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  try {
    for (const c of getCountries()) {
      let best: { area: number; x: number; y: number } | null = null;
      for (const poly of c.g as unknown as number[][][][]) {
        const ring = poly[0]!;
        let a = 0;
        let cx = 0;
        let cy = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const f = ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
          a += f;
          cx += (ring[j]![0]! + ring[i]![0]!) * f;
          cy += (ring[j]![1]! + ring[i]![1]!) * f;
        }
        if (Math.abs(a) < 1e-9) continue;
        const area = Math.abs(a / 2);
        if (!best || area > best.area) best = { area, x: cx / (3 * a), y: cy / (3 * a) };
      }
      if (!best || best.area < 0.3) continue;
      features.push({
        type: 'Feature',
        properties: { name: countryName(c.cc, getLocale()), size: best.area },
        geometry: { type: 'Point', coordinates: [best.x, best.y] }
      });
    }
  } catch {
    // No countries loaded: no country names.
  }
  return { type: 'FeatureCollection', features };
}

/** Every named place the app knows, in the reader's language, except those drawn as route marks. */
function placeLabels(skip: Set<string>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  try {
    for (const p of getPlaces()) {
      if (skip.has(p.id) || (p.wd && skip.has(p.wd))) continue;
      features.push({
        type: 'Feature',
        properties: { name: localName(p.n, p.l), k: p.k, r: p.r },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
      });
    }
  } catch {
    // No places loaded.
  }
  return { type: 'FeatureCollection', features };
}

/** Colours that change between the day atlas and the night chart. */
function themePaints(night: boolean): Array<[string, string, unknown]> {
  const ink = night ? NIGHT : DAY;
  const water = night ? '#0d141c' : '#a9cfee';
  const waterInk = night ? '#5d7590' : '#2f5f9a';
  const reliefInk = night ? '#8a7f70' : '#7a5a3a';
  return [
    ['ocean', 'background-color', ink.ocean],
    ['land', 'fill-color', ink.land],
    ['relief', 'color-relief-color', night ? RELIEF_NIGHT : RELIEF_DAY],
    ...Object.entries(night ? SHADE_NIGHT : SHADE_DAY).map(([k, v]) => ['shade', k, v] as [string, string, unknown]),
    ['glaciers', 'fill-color', night ? '#3a4452' : '#f4f7fa'],
    ['lakes', 'fill-color', water],
    ['rivers', 'line-color', night ? '#2b3b4f' : '#5b93cf'],
    ['urban', 'fill-color', night ? 'rgba(255, 196, 107, 0.16)' : 'rgba(120, 100, 90, 0.22)'],
    ['borders', 'line-color', ink.border],
    ['sectors', 'fill-color', ['case', ['==', ['get', 'mine'], 1], ink.flown, night ? '#9AA5B4' : '#3A4656']],
    ['sectors', 'fill-opacity', ['case', ['==', ['get', 'mine'], 1], night ? 0.14 : 0.16, night ? 0.05 : 0.07]],
    ['leg', 'line-color', ink.leg],
    ['flown', 'line-color', ink.flown],
    ['label-sea', 'text-color', waterInk],
    ['label-sea', 'text-halo-color', night ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.5)'],
    ['label-lake', 'text-color', waterInk],
    ['label-lake', 'text-halo-color', ink.halo],
    ['label-river', 'text-color', waterInk],
    ['label-river', 'text-halo-color', ink.halo],
    ['label-relief', 'text-color', reliefInk],
    ['label-relief', 'text-halo-color', ink.halo],
    ['label-city', 'text-color', night ? '#e8dcc6' : '#26303b'],
    ['label-city', 'text-halo-color', ink.halo],
    ['city-dot', 'circle-color', night ? '#FFC46B' : '#26303b'],
    ['city-dot', 'circle-blur', night ? 0.6 : 0],
    ['label-country', 'text-color', night ? 'rgba(200, 208, 220, 0.55)' : 'rgba(40, 46, 56, 0.55)'],
    ['label-country', 'text-halo-color', ink.halo]
  ];
}

const NAME = ['get', 'name'];
const ATLAS = (layer: string) => `${BASE}atlas/${layer}.json`;
/** Rivers and lakes carry their names per language; English is `n`. */
const atlasName = () => (lang() === 'en' ? ['get', 'n'] : ['coalesce', ['get', lang()], ['get', 'n']]);

function styleFor(night: boolean, skip: Set<string>): StyleSpecification {
  const paint = new Map<string, Record<string, unknown>>();
  for (const [layer, prop, value] of themePaints(night)) paint.set(layer, { ...(paint.get(layer) ?? {}), [prop]: value });
  const p = (id: string, extra: Record<string, unknown> = {}) => ({ ...extra, ...(paint.get(id) ?? {}) }) as never;
  const italic = ['Noto Sans Italic'];
  const regular = ['Noto Sans Regular'];
  const medium = ['Noto Sans Medium'];
  return {
    version: 8,
    glyphs: 'glyphs://{fontstack}/{range}',
    sources: {
      dem: { type: 'raster-dem', tiles: ['dem://{z}/{x}/{y}'], tileSize: 256, maxzoom: 6, encoding: 'terrarium' },
      // Country outlines are the heaviest source: tiled only to zoom 6 and
      // overzoomed beyond, so a newly revealed area gets its land at once
      // instead of showing the ocean underneath while it is cut.
      countries: { type: 'geojson', data: bordersGeoJSON(), maxzoom: 6, tolerance: 0.6 },
      glaciers: { type: 'geojson', data: ATLAS('glaciers') },
      lakes: { type: 'geojson', data: ATLAS('lakes') },
      rivers: { type: 'geojson', data: ATLAS('rivers') },
      urban: { type: 'geojson', data: ATLAS('urban') },
      places: { type: 'geojson', data: placeLabels(skip) },
      countryNames: { type: 'geojson', data: countryLabels() },
      leg: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      flown: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      sectors: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
    },
    layers: [
      { id: 'ocean', type: 'background', paint: p('ocean') },
      { id: 'land', type: 'fill', source: 'countries', paint: p('land') },
      { id: 'relief', type: 'color-relief', source: 'dem', paint: p('relief') },
      { id: 'shade', type: 'hillshade', source: 'dem', paint: p('shade') },
      { id: 'glaciers', type: 'fill', source: 'glaciers', paint: p('glaciers', { 'fill-opacity': 0.85 }) },
      { id: 'urban', type: 'fill', source: 'urban', minzoom: 4, paint: p('urban') },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: p('lakes') },
      {
        id: 'rivers',
        type: 'line',
        source: 'rivers',
        filter: ['<=', ['get', 'z'], ['+', ['zoom'], 2.2]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: p('rivers', { 'line-width': ['interpolate', ['linear'], ['zoom'], 2, ['-', 1.6, ['*', ['get', 'r'], 0.12]], 7, ['-', 3, ['*', ['get', 'r'], 0.2]]] })
      },
      { id: 'borders', type: 'line', source: 'countries', paint: p('borders', { 'line-width': 0.8 }) },
      { id: 'sectors', type: 'fill', source: 'sectors', paint: p('sectors') },
      {
        id: 'leg',
        type: 'line',
        source: 'leg',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: p('leg', { 'line-width': 1.5, 'line-dasharray': [3, 4] })
      },
      {
        id: 'flown',
        type: 'line',
        source: 'flown',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: p('flown', { 'line-width': 2.6 })
      },
      {
        id: 'label-country',
        type: 'symbol',
        source: 'countryNames',
        maxzoom: 6,
        layout: {
          'text-field': NAME,
          'text-font': medium,
          'text-size': ['interpolate', ['linear'], ['get', 'size'], 1, 10, 100, 13, 1000, 15],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.18,
          'text-max-width': 8,
          'symbol-sort-key': ['-', ['get', 'size']]
        } as never,
        paint: p('label-country', { 'text-halo-width': 1 })
      },
      {
        id: 'label-sea',
        type: 'symbol',
        source: 'places',
        filter: ['all', ['==', ['get', 'k'], 'sea'], ['>=', ['get', 'r'], ['-', 9, ['zoom']]]],
        layout: {
          'text-field': NAME,
          'text-font': italic,
          'text-size': ['interpolate', ['linear'], ['get', 'r'], 4, 11, 10, 15],
          'text-letter-spacing': 0.12,
          'text-max-width': 8,
          'symbol-sort-key': ['-', ['get', 'r']]
        } as never,
        paint: p('label-sea', { 'text-halo-width': 1 })
      },
      {
        id: 'label-lake',
        type: 'symbol',
        source: 'lakes',
        filter: ['<=', ['get', 'r'], ['+', ['zoom'], 1]],
        layout: { 'text-field': atlasName(), 'text-font': italic, 'text-size': 11, 'text-max-width': 7 } as never,
        paint: p('label-lake', { 'text-halo-width': 1.2 })
      },
      {
        id: 'label-river',
        type: 'symbol',
        source: 'rivers',
        minzoom: 4,
        filter: ['<=', ['get', 'z'], ['zoom']],
        layout: {
          'symbol-placement': 'line',
          'text-field': atlasName(),
          'text-font': italic,
          'text-size': 11,
          'symbol-spacing': 400,
          'text-letter-spacing': 0.06
        } as never,
        paint: p('label-river', { 'text-halo-width': 1.2 })
      },
      {
        id: 'label-relief',
        type: 'symbol',
        source: 'places',
        filter: [
          'all',
          ['match', ['get', 'k'], ['range', 'desert', 'plateau', 'peninsula', 'region', 'mountain', 'volcano', 'glacier', 'island'], true, false],
          ['>=', ['get', 'r'], ['-', 10.5, ['zoom']]]
        ],
        layout: {
          'text-field': NAME,
          'text-font': italic,
          'text-size': ['interpolate', ['linear'], ['get', 'r'], 3, 10, 10, 13],
          'text-letter-spacing': ['match', ['get', 'k'], ['range', 'desert', 'plateau', 'region'], 0.14, 0.04],
          'text-max-width': 8,
          'symbol-sort-key': ['-', ['get', 'r']]
        } as never,
        paint: p('label-relief', { 'text-halo-width': 1.2 })
      },
      {
        id: 'city-dot',
        type: 'circle',
        source: 'places',
        filter: ['all', ['==', ['get', 'k'], 'city'], ['>=', ['get', 'r'], ['-', 10.5, ['zoom']]]],
        paint: p('city-dot', { 'circle-radius': ['interpolate', ['linear'], ['get', 'r'], 3, 1.6, 10, 3.2] })
      },
      {
        id: 'label-city',
        type: 'symbol',
        source: 'places',
        filter: ['all', ['==', ['get', 'k'], 'city'], ['>=', ['get', 'r'], ['-', 10.5, ['zoom']]]],
        layout: {
          'text-field': NAME,
          'text-font': regular,
          'text-size': ['interpolate', ['linear'], ['get', 'r'], 3, 10, 10, 13],
          'text-anchor': 'left',
          'text-offset': [0.5, 0],
          'text-max-width': 8,
          'symbol-sort-key': ['-', ['get', 'r']]
        } as never,
        paint: p('label-city', { 'text-halo-width': 1.2 })
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

function paintPlace(el: HTMLElement, name: string, opened: boolean, night: boolean, city = false): void {
  const ink = night ? NIGHT : DAY;
  const [dot, label] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
  const color = opened ? ink.opened : ink.dot;
  // At night a city is its lights: a warm glow, as it looks from the window.
  dot.style.boxShadow = night && city ? '0 0 6px 3px rgba(255, 196, 107, 0.75), 0 0 16px 6px rgba(255, 170, 60, 0.35)' : 'none';
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
  onToggleExpand,
  heading = 0,
  seatSide = 'unknown',
  viewKm,
  previewing = false
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
      style: styleFor(night, new Set(pois.flatMap((p) => [p.id, p.wikidata ?? '']).filter(Boolean))),
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
    el.style.cssText = 'width:30px;height:30px;pointer-events:none';
    el.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24"><path d="${PLANE_PATH}" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
    // Rotation is the marker's own option: a CSS transform on the element
    // would be overwritten by the one that positions it.
    plane.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([position.lon, position.lat]).addTo(m);
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
    for (const [layer, prop, value] of themePaints(night)) if (m.getLayer(layer)) m.setPaintProperty(layer, prop, value as never);
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
    plane.current?.setLngLat([position.lon, position.lat]).setRotation(heading);
    if (follow && !interacting.current) {
      m.easeTo({ center: [position.lon, position.lat], zoom: expanded ? CRUISE_ZOOM + 0.8 : CRUISE_ZOOM, duration: 600 });
    }
  }, [route, path, position.elapsedS, position.lat, position.lon, heading, follow, expanded, ready]);

  // The aircraft's colours follow the theme; it dims while previewing another moment.
  useEffect(() => {
    const el = plane.current?.getElement();
    const path = el?.querySelector('path');
    if (!el || !path) return;
    path.setAttribute('fill', night ? palette.amber : '#E07A12');
    path.setAttribute('stroke', night ? palette.void : '#FFFFFF');
    el.style.opacity = previewing ? '0.75' : '1';
  }, [night, previewing, ready]);

  // What each window sees: a sector abeam, the passenger's own drawn stronger.
  useEffect(() => {
    const src = map.current?.getSource('sectors') as maplibregl.GeoJSONSource | undefined;
    if (!ready || !src) return;
    if (!viewKm) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const sector = (side: 'left' | 'right'): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { mine: seatSide === side ? 1 : 0 },
      geometry: { type: 'Polygon', coordinates: [viewSector(position.lat, position.lon, heading, side, viewKm)] }
    });
    src.setData({ type: 'FeatureCollection', features: [sector('left'), sector('right')] });
  }, [position.lat, position.lon, heading, seatSide, viewKm, ready]);

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
      const city = poi.category === 'city';
      paintPlace(mk.getElement(), labelFor?.(poi) ?? poi.name, opened, night, city);
    }

    // As many names as fit without covering each other, the most telling
    // first: the opened, then (at night) cities, whose lights are what the
    // window shows, then by rank. History is a story, not a sight: a
    // railway's name at the one point the route crosses it would only cover
    // a city's, so it is named once opened or close in.
    const priority = (poi: POI) => (seen?.has(poi.id) ? 100 : 0) + (night && poi.category === 'city' ? 20 : 0) + (poi.rank ?? 5);
    const placed: Array<[number, number, number, number]> = [];
    for (const poi of [...pois].sort((a, b) => priority(b) - priority(a))) {
      const label = marks.current.get(poi.id)?.getElement().children[1] as HTMLElement | undefined;
      if (!label) continue;
      if (poi.category === 'historic' && !seen?.has(poi.id) && zoom < 6.5) {
        label.style.display = 'none';
        continue;
      }
      label.style.display = 'block';
      const at = m.project([poi.lon, poi.lat]);
      const half = (label.offsetWidth || (label.textContent?.length ?? 8) * 6.5) / 2 + 3;
      const box: [number, number, number, number] = [at.x - half, at.y + 19, at.x + half, at.y + 35];
      const clash = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      if (clash) label.style.display = 'none';
      else placed.push(box);
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
