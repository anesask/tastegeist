import { useMemo } from 'react'
import { ZONE_COLORS, rgb, type LogEvent, type PartialGroup } from '../lib/api'
import { MapView, type MapGeist } from './MapView'
import { Skeleton } from './ui'

type Live = PartialGroup & {
  headlines?: (string | null)[]
  seance?: { headline?: string | null; stops?: number | null; size?: number | null; base?: number | null }
}

/** Fold the streamed partial events into one card per geist, in the order they appeared. */
function fold(events: LogEvent[]): Live[] {
  const by = new Map<string, Live>()
  for (const e of events) {
    if (e.type !== 'partial') continue
    if (e.stage === 'zones' || e.stage === 'geists') for (const g of e.groups ?? []) by.set(g.key, { ...by.get(g.key), ...g })
    if (e.stage === 'concepts' && e.key) by.set(e.key, { ...by.get(e.key), key: e.key, headlines: e.headlines })
    if (e.stage === 'seance' && e.key)
      by.set(e.key, { ...by.get(e.key), key: e.key, seance: { headline: e.headline, stops: e.stops, size: e.size, base: e.base_stops } })
  }
  return [...by.values()].filter((g) => g.label)
}

/**
 * The result, building itself while the run goes: the zones on the map first, then the geist names,
 * the concept headlines and the séance verdicts as each one lands.
 */
export function LiveResults({ events }: { events: LogEvent[] }) {
  const groups = useMemo(() => fold(events), [events])
  // Zones take the palette in order; neighborhoods follow, as in the finished workspace.
  const ordered = [...groups.filter((g) => g.kind === 'zone'), ...groups.filter((g) => g.kind !== 'zone')]
  const color = (g: Live) => ZONE_COLORS[Math.max(0, ordered.indexOf(g)) % ZONE_COLORS.length]
  const geists: MapGeist[] = ordered
    .filter((g) => g.points?.length)
    .map((g) => ({ key: g.key, label: g.name ?? g.label!, color: color(g), kind: g.kind ?? 'zone', parent: g.parent, points: g.points! }))
  if (!groups.length) return null

  return (
    <section aria-label="Results so far" className="mt-6 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-h2">So far</h3>
        <span className="t-caption">Results appear as they are ready; nothing here is final until the run ends.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="h-72 overflow-hidden rounded-2xl ring-1 ring-line lg:h-auto lg:min-h-[320px]">
          <MapView interactive={false} geists={geists} selected={null} />
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ordered.map((g) => (
            <li key={g.key} className="card rise p-4">
              <div className="flex items-center gap-2 text-xs text-mute">
                <span className="h-2 w-2 rounded-full" style={{ background: rgb(color(g)) }} />
                {g.label}
              </div>
              {g.name ? (
                <div key={g.name} className="rise mt-1 font-medium">
                  {g.name}
                </div>
              ) : (
                <Skeleton className="mt-2 h-4 w-32" />
              )}
              {g.top && g.top.length > 0 && (
                <div className="mt-3 flex gap-1">
                  {g.top
                    .filter((e) => e.image)
                    .map((e) => (
                      <img key={e.id} src={e.image!} alt={e.name} title={`${e.name} · ${e.lift.toFixed(1)}×`} className="h-10 w-10 rounded-md object-cover" />
                    ))}
                </div>
              )}
              {g.headlines ? (
                <ul className="rise mt-3 space-y-1 text-sm">
                  {g.headlines.filter(Boolean).map((h) => (
                    <li key={h} className={g.seance?.headline === h ? 'font-medium text-ink' : 'text-ink-2'}>
                      &ldquo;{h}&rdquo;
                    </li>
                  ))}
                </ul>
              ) : (
                g.name && <p className="mt-3 text-xs text-mute">Writing three concepts from its ledger…</p>
              )}
              {g.seance?.stops != null ? (
                <p className="rise mt-3 text-xs text-ink-2">
                  Séance:{' '}
                  <b className="text-ink">
                    {g.seance.stops} of {g.seance.size}
                  </b>{' '}
                  stop for the best concept
                  {g.seance.base != null ? `, ${g.seance.base} for the generic one` : ''}.
                </p>
              ) : (
                g.headlines && <p className="mt-3 text-xs text-mute">Testing them on synthetic locals…</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
