import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { fetchHeatmap, rgb, type Geist, type HeatCell, type LedgerEntity, type RunResult } from '../lib/api'
import { colorOf, mapGeists, personaName } from '../lib/geists'
import { MapView, type CoverMarker, type HeatLayer } from './MapView'
import { useTheme } from '../theme'

const IDLE_MS = 4500
const PER_SIDE = 4

/**
 * Two neighborhoods' tastes across their whole city, at once: each side's heat in its own color,
 * ranked within itself. Point at a title to see only where that title over-indexes; left alone it
 * walks through the titles by itself. Qloo heatmaps, cached on the server.
 */
export function TasteMap({ result, hoods, titles }: { result: RunResult; hoods: Geist[]; titles: LedgerEntity[][] }) {
  const { theme } = useTheme()
  const city = hoods[0].parent ?? hoods[0].markets[0]
  const sides = hoods.map((g, si) => ({ g, color: colorOf(result, g.key), titles: titles[si].slice(0, PER_SIDE) }))
  const base = useQueries({
    queries: sides.map((s) => ({
      queryKey: [
        'heat',
        city,
        s.g.ledger
          .slice(0, 3)
          .map((e) => e.id)
          .join(),
      ],
      queryFn: () =>
        fetchHeatmap(
          city,
          s.g.ledger.slice(0, 3).map((e) => e.id),
        ),
      staleTime: Infinity,
      retry: false,
    })),
  })

  // The tour it takes when idle: both sides, then title by title, alternating sides.
  const tour: (null | { si: number; e: LedgerEntity })[] = [null]
  for (let i = 0; i < PER_SIDE; i++) for (let si = 0; si < sides.length; si++) if (sides[si].titles[i]) tour.push({ si, e: sides[si].titles[i] })
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<null | { si: number; e: LedgerEntity }>(null)
  const [user, setUser] = useState(false)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (user) return
    const id = setTimeout(() => setStep((n) => (n + 1) % tour.length), step === 0 ? 6000 : 4200)
    return () => clearTimeout(id)
  }, [user, step, tour.length])
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current)
    },
    [],
  )
  const focus = user ? picked : tour[step]
  const one = useQuery({
    queryKey: ['heat', city, focus?.e.id],
    queryFn: () => fetchHeatmap(city, [focus!.e.id]),
    enabled: !!focus,
    staleTime: Infinity,
    retry: false,
  })

  const heats: HeatLayer[] = sides.map((s, si) => ({
    key: s.g.key,
    color: s.color,
    cells: (base[si].data ?? []) as HeatCell[],
    dim: !!focus,
  }))
  if (focus && one.data) heats.push({ key: `title-${focus.e.id}`, color: sides[focus.si].color, cells: one.data as HeatCell[] })

  const geists = mapGeists(result).filter((m) => hoods.some((h) => h.key === m.key))
  // Frame where the strongest blocks of both sides cluster: the middle 80%, so a few outliers don't zoom the
  // camera out to the whole county. Fixed per page, so the camera doesn't jump per title.
  const strong = sides.flatMap((_, si) =>
    ((base[si].data ?? []) as HeatCell[])
      .slice()
      .sort((a, b) => b.rank * Math.min(b.lift, 3) - a.rank * Math.min(a.lift, 3))
      .slice(0, 40),
  )
  const q = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))]
  const frame: [number, number][] = strong.length
    ? [
        [
          q(
            strong.map((c) => c.lon),
            0.1,
          ),
          q(
            strong.map((c) => c.lat),
            0.1,
          ),
        ],
        [
          q(
            strong.map((c) => c.lon),
            0.9,
          ),
          q(
            strong.map((c) => c.lat),
            0.9,
          ),
        ],
      ]
    : []
  // Each neighborhood drawn as its own covers; the one being explored shows the title in focus.
  const markers: CoverMarker[] = sides.map((s, si) => ({
    key: s.g.key,
    center: geists.find((m) => m.key === s.g.key)?.points[0]?.center ?? [0, 0],
    images: focus?.si === si ? [focus.e.image!] : s.titles.slice(0, 3).map((e) => e.image!),
    color: s.color,
    label: s.g.label,
    sub: focus?.si === si ? focus.e.name : personaName(s.g),
  }))
  const take = (si: number, e: LedgerEntity) => {
    if (idle.current) clearTimeout(idle.current)
    setUser(true)
    setPicked({ si, e })
  }
  const letGo = () => {
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => {
      setUser(false)
      setPicked(null)
    }, IDLE_MS)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative h-[460px] overflow-hidden rounded-3xl ring-1 ring-line md:h-[580px]">
        <MapView
          interactive={false}
          flat
          basemap={theme === 'dark' ? 'dark' : 'light'}
          geists={geists}
          selected={hoods[0].key}
          heats={heats}
          markers={markers}
          frame={frame}
        />
        {/* What is lit right now, in one line. */}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[80%] rounded-full bg-[#0b0a09]/75 px-3.5 py-1.5 text-xs text-white/85 backdrop-blur">
          {focus ? (
            <>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: rgb(sides[focus.si].color) }} />
              Where <b className="text-white">{focus.e.name}</b> over-indexes in {city}
            </>
          ) : (
            <>Both neighborhoods' tastes across {city}: bigger and brighter means stronger</>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5" onPointerLeave={letGo}>
        {sides.map((s, si) => (
          <div key={s.g.key}>
            <div className="kicker flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: rgb(s.color) }} />
              {s.g.label}
            </div>
            <div className="mt-0.5 text-sm font-medium">{personaName(s.g)}</div>
            <ul className="mt-3 space-y-1.5">
              {s.titles.map((e) => {
                const on = focus?.e.id === e.id
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onPointerEnter={() => take(si, e)}
                      onFocus={() => take(si, e)}
                      onClick={() => take(si, e)}
                      className={`flex w-full items-center gap-3 rounded-xl p-1.5 pr-3 text-left text-sm transition ${on ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
                      aria-pressed={on}
                    >
                      <img
                        src={e.image!}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        style={{ boxShadow: on ? `0 0 0 2px ${rgb(s.color)}` : undefined }}
                      />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <p className="t-caption mt-auto">
          Qloo heatmap of {city}: the blocks where each neighborhood's titles over-index, ranked within each side. Point at a title to see only its map.
        </p>
      </div>
    </div>
  )
}
