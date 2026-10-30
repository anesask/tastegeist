import { ColumnLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import * as maplibregl from 'maplibre-gl'
// MapLibre 6 finds its worker next to its own module, which a production bundle doesn't copy:
// ship the (self-contained) worker as an asset and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
maplibregl.setWorkerUrl(workerUrl)
import { useEffect, useRef, useState } from 'react'
import type { HeatCell } from '../lib/api'

// The map is a dark stage in both themes: the taste data carries the color, the city recedes.
const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
// A pale, paper-toned map for flat views on light pages.
const BASEMAP_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'

type RGB = [number, number, number]

export interface MapGeist {
  key: string
  label: string
  color: RGB
  kind: 'zone' | 'neighborhood'
  parent?: string | null
  /** Draw the points as neighborhood areas (city-in-depth scope) instead of city pins. */
  area?: boolean
  points: { name: string; center: [number, number] }[]
}

/** A place drawn as a disc of its own cover art, ringed in its color and named. */
export interface CoverMarker {
  key: string
  center: [number, number]
  images: string[]
  color: RGB
  label: string
  sub?: string
}

/** A layer of heat drawn on top of the main one, in its own color (e.g. two neighborhoods at once). */
export interface HeatLayer {
  key: string
  color: RGB
  cells: HeatCell[]
  /** Pushed back: drawn faint while another layer has the attention. */
  dim?: boolean
}

/**
 * Heat as slender pillars of light: height and brightness both follow strength `t` (0 to 1), the
 * color lightens toward the strongest, and each pillar stands on a soft glow on the ground.
 */
function pillars(id: string, cells: HeatCell[], color: RGB, t: (c: HeatCell) => number, dim = false, k = 1, ms = 1200) {
  const lit = (k: number) => color.map((v) => Math.round(v + (255 - v) * 0.4 * k)) as RGB
  return [
    new ScatterplotLayer<HeatCell>({
      id: `${id}-glow`,
      data: cells,
      getPosition: (c) => [c.lon, c.lat],
      radiusUnits: 'meters',
      getRadius: (c) => (160 + 300 * t(c)) * k,
      getFillColor: (c) => [...color, Math.round(dim ? 3 : 14 + 46 * t(c))] as [number, number, number, number],
      stroked: false,
      transitions: { getFillColor: { duration: ms }, getRadius: { duration: ms } },
      updateTriggers: { getFillColor: [color.join(), dim], getRadius: [cells.length, k] },
    }),
    new ColumnLayer<HeatCell>({
      id,
      data: cells,
      diskResolution: 20,
      radius: 70 * k,
      coverage: 1,
      extruded: true,
      getPosition: (c) => [c.lon, c.lat],
      getElevation: (c) => (80 + Math.pow(t(c), 1.6) * 1900) * k,
      getFillColor: (c) => [...lit(t(c)), dim ? 22 : Math.round(165 + 90 * t(c))] as [number, number, number, number],
      material: { ambient: 0.62, diffuse: 0.5, shininess: 64, specularColor: [255, 255, 255] },
      transitions: { getElevation: { duration: ms }, getFillColor: { duration: ms / 2 } },
      updateTriggers: { getFillColor: [color.join(), dim], getElevation: [cells.length, k] },
    }),
  ]
}

/**
 * Heat for a flat map: each block a wide faint halo, a tighter glow and a crisp dot, all sized by
 * strength `t`. Overlapping halos blend, so two tastes that share ground mix their colors.
 */
function glow(id: string, cells: HeatCell[], color: RGB, t: (c: HeatCell) => number, dim = false, zk = 1, ms = 900) {
  // Glows grow more gently than pillars as the camera pulls back, so they stay points, not blobs.
  const k = Math.sqrt(zk)
  const lit = (x: number) => color.map((v) => Math.round(v + (255 - v) * 0.3 * x)) as RGB
  const at = (c: HeatCell) => [c.lon, c.lat] as [number, number]
  const tr = { getFillColor: { duration: ms }, getRadius: { duration: ms } }
  const trig = { getFillColor: [color.join(), dim], getRadius: [cells.length, k] }
  return [
    new ScatterplotLayer<HeatCell>({
      id: `${id}-halo`,
      data: cells,
      getPosition: at,
      radiusUnits: 'meters',
      getRadius: (c) => (260 + 520 * t(c)) * k,
      getFillColor: (c) => [...color, dim ? 0 : Math.round(8 + 16 * t(c))] as [number, number, number, number],
      stroked: false,
      transitions: tr,
      updateTriggers: trig,
    }),
    new ScatterplotLayer<HeatCell>({
      id: `${id}-glow`,
      data: cells,
      getPosition: at,
      radiusUnits: 'meters',
      getRadius: (c) => (90 + 200 * t(c)) * k,
      getFillColor: (c) => [...color, dim ? 4 : Math.round(36 + 60 * t(c))] as [number, number, number, number],
      stroked: false,
      transitions: tr,
      updateTriggers: trig,
    }),
    new ScatterplotLayer<HeatCell>({
      id: `${id}-dot`,
      data: cells,
      getPosition: at,
      radiusUnits: 'pixels',
      getRadius: (c) => 1.8 + 3.2 * t(c),
      getFillColor: (c) => [...lit(t(c)), dim ? 40 : 255] as [number, number, number, number],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      getLineColor: [255, 255, 255, dim ? 0 : 160],
      transitions: tr,
      updateTriggers: { ...trig, getLineColor: dim },
    }),
  ]
}

/** Strength within one layer by rank: the best cell 1, the weakest 0. Fair across layers of any scale. */
function byRank(cells: HeatCell[]) {
  const order = new Map(cells.map((c, i) => [c.geohash, cells.length > 1 ? 1 - i / (cells.length - 1) : 1]))
  return (c: HeatCell) => order.get(c.geohash) ?? 0
}

function bounds(points: [number, number][]): maplibregl.LngLatBoundsLike {
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}

export function MapView({
  geists,
  selected,
  heat = [],
  heatColor = [217, 102, 63],
  onSelect,
  className = 'h-full w-full',
  heatScale = 1,
  interactive = true,
  insetLeft = 0,
  insetBottom = 0,
  heats = [],
  orbit = false,
  flat = false,
  basemap = 'dark',
  markers = [],
  frame = [],
}: {
  geists: MapGeist[]
  selected: string | null
  heat?: HeatCell[]
  heatColor?: RGB
  onSelect?: (key: string) => void
  className?: string
  /** 1 for a city heatmap; larger for a national one (coarser cells, viewed from further out). */
  heatScale?: number
  /** false: a still backdrop (no controls, no gestures), e.g. a report cover */
  interactive?: boolean
  /** Width in px of an overlay covering the map's left edge; the camera frames around it. */
  insetLeft?: number
  /** Height in px of an overlay covering the bottom edge (e.g. a cover headline). */
  insetBottom?: number
  /** More heat, each in its own color: the strongest cells of each, ranked within their own layer. */
  heats?: HeatLayer[]
  /** Turn the camera slowly while nobody touches the map (not under reduced motion). */
  orbit?: boolean
  /** Top-down, no tilt: heat as soft glows and dots instead of pillars. */
  flat?: boolean
  /** The basemap: dark (default) or a pale paper tone for light pages. */
  basemap?: 'dark' | 'light'
  /** Places as cover-art discs; when given, they replace the drawn circles and labels. */
  markers?: CoverMarker[]
  /** Extra points the camera must keep in view (e.g. the strongest heat cells), with all the places. */
  frame?: [number, number][]
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const [zoom, setZoom] = useState(0)
  const allPoints = geists.flatMap((g) => g.points.map((p) => p.center))
  const geistKey = geists.map((g) => g.key).join()

  // Camera moves are instant for people who ask for reduced motion.
  const dur = (ms: number) => (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms)
  const pad = (p: number) => ({
    top: p,
    right: p,
    bottom: p + 40 + insetBottom,
    left: p + insetLeft,
  })

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: basemap === 'light' ? BASEMAP_LIGHT : BASEMAP,
      bounds: bounds(allPoints),
      fitBoundsOptions: { padding: pad(60), maxZoom: 11 },
      attributionControl: { compact: true },
      cooperativeGestures: interactive && window.matchMedia('(max-width: 640px)').matches,
      interactive,
    })
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('zoomend', () => setZoom(m.getZoom()))
    m.once('load', () => setZoom(m.getZoom()))
    const o = new MapboxOverlay({ interleaved: false, layers: [] })
    m.addControl(o)
    map.current = m
    overlay.current = o
    return () => {
      m.remove()
      map.current = null
      overlay.current = null
    }
    // The map is created once per set of geists; the selection is applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geistKey, basemap])

  // Fly to the selection: a neighborhood up close and tilted, a zone framed around its markets.
  const frameKey = frame.length ? `${frame.length}:${frame[0].join()}:${frame[frame.length - 1].join()}` : ''
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (frame.length) {
      m.fitBounds(bounds([...frame, ...allPoints]), { padding: pad(70), maxZoom: 12.5, pitch: flat ? 0 : 40, bearing: 0, duration: dur(1200) })
      return
    }
    const g = geists.find((x) => x.key === selected)
    if (!g) {
      m.fitBounds(bounds(allPoints), {
        padding: pad(60),
        maxZoom: 11,
        pitch: 0,
        bearing: 0,
        duration: dur(1200),
      })
    } else if (g.kind === 'neighborhood') {
      // Frame every neighborhood of the same city, so the split is visible side by side.
      const siblings = geists.filter((x) => x.kind === 'neighborhood' && x.parent === g.parent).flatMap((x) => x.points.map((p) => p.center))
      if (siblings.length > 1)
        m.fitBounds(bounds(siblings), {
          padding: pad(70),
          maxZoom: 13.2,
          pitch: flat ? 0 : 52,
          bearing: flat ? 0 : -14,
          duration: dur(2000),
        })
      else
        m.flyTo({
          center: g.points[0].center,
          zoom: 12.4,
          pitch: flat ? 0 : 52,
          bearing: flat ? 0 : -14,
          duration: dur(2000),
          padding: pad(0),
        })
    } else if (g.points.length === 1) {
      m.flyTo({
        center: g.points[0].center,
        zoom: g.area ? 12.8 : 11.2,
        pitch: flat ? 0 : 52,
        bearing: flat ? 0 : -14,
        duration: dur(2000),
        padding: pad(0),
      })
    } else {
      m.fitBounds(bounds(g.points.map((p) => p.center)), {
        padding: pad(90),
        maxZoom: g.area ? 13 : 9,
        pitch: 0,
        bearing: 0,
        duration: dur(1200),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, geistKey, frameKey, basemap])

  // A slow orbit while nobody is touching the map; it pauses on any interaction.
  useEffect(() => {
    const m = map.current
    if (!m || !orbit || flat || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let held = false
    const hold = () => (held = true)
    const free = () => (held = false)
    const spin = () => {
      if (!held && !m.isMoving()) m.setBearing(m.getBearing() + 0.035)
      raf = requestAnimationFrame(spin)
    }
    m.on('mousedown', hold)
    m.on('touchstart', hold)
    m.on('mouseup', free)
    m.on('touchend', free)
    raf = requestAnimationFrame(spin)
    return () => {
      cancelAnimationFrame(raf)
      m.off('mousedown', hold)
      m.off('touchstart', hold)
      m.off('mouseup', free)
      m.off('touchend', free)
    }
  }, [orbit, flat, geistKey])

  // Cover-art discs as real DOM markers: sharp photos, anchored to the map.
  const markerKey = markers.map((mk) => `${mk.key}:${mk.images.join()}:${mk.sub ?? ''}`).join('|')
  useEffect(() => {
    const m = map.current
    if (!m) return
    const made = markers.map((mk) => {
      const el = document.createElement('div')
      el.className = 'tg-cover'
      el.style.setProperty('--ring', `rgb(${mk.color.join(',')})`)
      const disc = document.createElement('div')
      disc.className = `tg-cover-disc tg-cover-n${Math.min(mk.images.length, 3)}`
      for (const src of mk.images.slice(0, 3)) {
        const img = document.createElement('img')
        img.src = src
        img.alt = ''
        img.draggable = false
        disc.appendChild(img)
      }
      const label = document.createElement('div')
      label.className = 'tg-cover-label'
      label.textContent = mk.label
      if (mk.sub) {
        const sub = document.createElement('span')
        sub.textContent = mk.sub
        label.appendChild(sub)
      }
      el.append(disc, label)
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mk.center).addTo(m)
    })
    return () => made.forEach((x) => x.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, geistKey, basemap])

  const points = geists.flatMap((g) => g.points.map((p) => ({ ...p, g })))
  const areas = points.filter((p) => p.g.kind === 'neighborhood' || p.g.area)
  // The basemap carries no labels, so every market and neighborhood is named here.
  // Neighborhood names only once the city is close enough to tell them apart.
  const labelled = points.filter((p) => zoom >= 10 || !(p.g.kind === 'neighborhood' || p.g.area))
  // Uppercase: Arial's lowercase j and g have bearings deck.gl lays out with visible gaps.
  const labelText = (p: (typeof points)[number]) => (p.g.kind === 'neighborhood' ? `${p.name} · ${p.g.label}` : p.name).toUpperCase()
  // deck.gl builds its glyph atlas once: give it every character it will draw.
  const charset = Array.from(new Set(labelled.map(labelText).join('') + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-+'))
  const tower = heatScale === 1
  // A city heatmap keeps only the cells that clearly over-index, so the towers read as a skyline, not noise.
  const cells = tower
    ? heat
        .filter((c) => c.lift >= 1.15)
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 90)
    : heat
  const maxLift = Math.max(1.5, ...cells.map((c) => c.lift))

  const extra = heats.map((h) => {
    const top = h.cells
      .slice()
      .sort((a, b) => b.rank * Math.min(b.lift, 3) - a.rank * Math.min(a.lift, 3))
      .slice(0, 60)
    return { ...h, top }
  })
  // Pillars are sized in meters: grow them as the camera pulls back, so a whole city doesn't read as needles.
  const k = Math.min(4, Math.max(1, Math.pow(2, 12.6 - (zoom || 12.6))))
  const layers = [
    ...(tower
      ? (flat ? glow : pillars)('heat', cells, heatColor, (c) => (c.lift - 1) / (maxLift - 1), false, k)
      : [
          new ColumnLayer<HeatCell>({
            id: 'heat',
            data: cells,
            diskResolution: 6,
            radius: 55 * heatScale,
            coverage: 0.9,
            // A national heatmap is read from far out: flat cells, shaded by rank.
            extruded: false,
            getPosition: (c) => [c.lon, c.lat],
            getFillColor: (c) => [...heatColor, 50 + Math.round(Math.pow(c.rank, 1.4) * 205)] as [number, number, number, number],
            transitions: { getFillColor: { duration: 600 } },
            updateTriggers: { getFillColor: heatColor.join() },
          }),
        ]),
    ...extra.flatMap((h) => (flat ? glow : pillars)(`heat-${h.key}`, h.top, h.color, byRank(h.top), h.dim, k)),
    // A soft halo under every neighborhood, so the areas glow instead of reading as outlines.
    new ScatterplotLayer({
      id: 'hood-halo',
      data: areas,
      radiusUnits: 'meters',
      getRadius: (p) => (p.g.key === selected ? 1500 : 1250),
      getPosition: (p) => p.center,
      getFillColor: (p) => [...p.g.color, p.g.key === selected ? 34 : 18] as [number, number, number, number],
      updateTriggers: { getRadius: selected, getFillColor: selected },
      transitions: { getRadius: 600 },
    }),
    new ScatterplotLayer({
      id: 'hood-areas',
      data: areas,
      radiusUnits: 'meters',
      getRadius: 900,
      getPosition: (p) => p.center,
      getFillColor: (p) => [...p.g.color, p.g.key === selected ? 70 : 38] as [number, number, number, number],
      getLineColor: (p) => [...p.g.color, p.g.key === selected ? 255 : 150] as [number, number, number, number],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (p) => (p.g.key === selected ? 2 : 1),
      pickable: true,
      onClick: ({ object }) => object && onSelect?.(object.g.key),
      updateTriggers: {
        getFillColor: selected,
        getLineColor: selected,
        getLineWidth: selected,
      },
    }),
    new ScatterplotLayer({
      id: 'city-glow',
      data: points.filter((p) => p.g.kind === 'zone' && !p.g.area),
      radiusUnits: 'pixels',
      getRadius: (p) => (p.g.key === selected ? 34 : 22),
      getPosition: (p) => p.center,
      getFillColor: (p) => [...p.g.color, p.g.key === selected ? 60 : 36] as [number, number, number, number],
      updateTriggers: { getRadius: selected, getFillColor: selected },
    }),
    new ScatterplotLayer({
      id: 'city-pins',
      data: points.filter((p) => p.g.kind === 'zone' && !p.g.area),
      radiusUnits: 'pixels',
      getRadius: (p) => (p.g.key === selected ? 9 : 6),
      getPosition: (p) => p.center,
      getFillColor: (p) => [...p.g.color, 255] as [number, number, number, number],
      getLineColor: [11, 10, 9, 255],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
      pickable: true,
      onClick: ({ object }) => object && onSelect?.(object.g.key),
      updateTriggers: { getRadius: selected },
    }),
    new TextLayer({
      id: 'labels',
      data: labelled,
      // Lifted off the ground plane and drawn last, so the text never depth-fights with circles or towers.
      getPosition: (p) => (p.g.kind === 'neighborhood' || p.g.area ? [p.center[0], p.center[1] + 0.0092, 60] : [p.center[0], p.center[1], 60]),
      getText: labelText,
      getColor: (p) =>
        basemap === 'light' ? [22, 19, 15, p.g.key === selected ? 255 : 200] : p.g.key === selected ? [255, 255, 255, 255] : [226, 220, 210, 220],
      getSize: (p) => (p.g.kind === 'neighborhood' || p.g.area ? 12 : 11),
      getAlignmentBaseline: (p) => (p.g.kind === 'neighborhood' || p.g.area ? 'bottom' : 'center'),
      getPixelOffset: (p) => (p.g.kind === 'neighborhood' || p.g.area ? [0, -6] : [0, -24]),
      // A font that is always present: the atlas is built before web fonts load.
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 700,
      characterSet: charset,
      getTextAnchor: 'middle',
      parameters: { depthCompare: 'always' },
      fontSettings: { sdf: true, fontSize: 96, buffer: 12, radius: 12 },
      outlineWidth: 3,
      outlineColor: basemap === 'light' ? [246, 243, 238, 255] : [11, 10, 9, 255],
      updateTriggers: { getColor: selected },
    }),
  ]

  useEffect(() => {
    overlay.current?.setProps({
      // With cover-art markers, the places are the covers: only the heat is drawn underneath.
      layers: markers.length ? layers.filter((l) => String(l.id).startsWith('heat')) : layers,
      getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
    })
  })

  const summary = `Map of ${geists.length} ${geists.length === 1 ? 'audience' : 'audiences'}: ${geists.map((g) => g.label).join(', ')}`
  return (
    // MapLibre sets position: relative on its container, so the sized box is the wrapper.
    <div className={`relative isolate ${basemap === 'light' ? 'bg-[#f2efe9]' : 'bg-[#0b0a09]'} ${className}`}>
      <div className="absolute inset-0" role="img" aria-label={summary}>
        <div ref={container} className="h-full w-full" aria-hidden="true" />
      </div>
      {/* The map as text, for screen readers: every geist and its places. */}
      <ul className="sr-only">
        {geists.map((g) => (
          <li key={g.key}>
            {g.label}: {g.points.map((pt) => pt.name).join(', ')}
            {g.key === selected ? ' (selected)' : ''}
          </li>
        ))}
        {heat && heat.length > 0 && <li>Heatmap of {heat.length} blocks where this taste over-indexes; taller and brighter means stronger.</li>}
      </ul>
    </div>
  )
}
