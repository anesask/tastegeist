import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { api, ZONE_COLORS, rgb, type HeatCell } from '../lib/api'
import { MapView, type MapGeist } from './MapView'
import { typicalRun, useRunStats } from '../lib/runtime'
import { Skeleton } from './ui'

type Place = { id: string; name: string; center: [number, number] }
type Anchor = { id: string; name: string; type: string; image: string | null }

function useDebounced<T>(v: T, ms = 600) {
  const [x, setX] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return x
}

function Block({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-xs text-mute">{n}</span>
        <h3 className="t-h3">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** How alike two places look, said in words a planner can act on. */
function verdict(pct: number) {
  if (pct >= 0.75) return { text: 'Very alike: likely one zone', tone: 'text-ink-2' }
  if (pct >= 0.55) return { text: 'Related, with real differences', tone: 'text-ink-2' }
  return { text: 'Different audiences: separate campaigns', tone: 'text-coral' }
}

/**
 * The right-hand side of the brief studio: what Qloo sees while the brief is still being written.
 * The anchors resolve after step 1; places show their top titles and how alike they already look;
 * one city or a country shows where the taste concentrates. Qloo only, cached, no model spend.
 */
export function BriefPreview({ anchors, cardPending, places, scope }: { anchors: Anchor[]; cardPending: boolean; places: Place[]; scope: string }) {
  const ids = anchors.map((a) => a.id).filter(Boolean)
  const key = useDebounced(JSON.stringify({ ids, places: places.map((p) => [p.name, p.center]), scope }))
  const q = useQuery({
    queryKey: ['preview', key],
    queryFn: () => {
      const k = JSON.parse(key) as { ids: string[]; places: [string, [number, number]][]; scope: string }
      return api.preview({ anchors: k.ids, places: k.places.map(([name, center]) => ({ name, center })), scope: k.scope })
    },
    enabled: ids.length > 0 && places.length > 0,
    staleTime: Infinity,
    retry: false,
  })
  const geists: MapGeist[] = places.map((p, i) => ({
    key: p.name,
    label: p.name,
    color: ZONE_COLORS[i % ZONE_COLORS.length],
    kind: 'zone',
    points: [{ name: p.name, center: p.center }],
  }))
  const single = scope === 'city' || scope === 'country'
  const runStats = useRunStats()

  return (
    <aside className="card space-y-6 p-5" aria-label="What Qloo sees">
      <div>
        <div className="kicker">What Qloo sees</div>
        <p className="mt-1 text-sm text-ink-2">Live, while you write the brief. Nothing is spent until you generate.</p>
      </div>

      <Block n="1" title="Your product, as tastes">
        {cardPending ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Loader2 size={14} className="animate-spin" /> Reading your product, finding what its audience already loves…
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          </div>
        ) : anchors.length ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {anchors.slice(0, 6).map((a) => (
                <figure key={a.id || a.name} className="min-w-0">
                  {a.image ? (
                    <img src={a.image} alt="" className="aspect-square w-full rounded-lg bg-[#f3efe7] object-cover" />
                  ) : (
                    <div className="aspect-square rounded-lg bg-surface-2" />
                  )}
                  <figcaption className="mt-1 truncate text-xs text-ink-2" title={a.name}>
                    {a.name}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="t-caption mt-3">
              A new product has no taste history, so Qloo reads it through these references. They're weighted at 0.2, so the place, not the product, shapes what
              comes back.
            </p>
          </>
        ) : (
          <p className="text-sm text-mute">
            Describe the product: Claude proposes the brands, artists and shows its audience already loves, and Qloo resolves them.
          </p>
        )}
      </Block>

      <Block n="2" title={single ? 'Where the taste concentrates' : 'How your places differ'}>
        {!places.length ? (
          <p className="text-sm text-mute">
            Pick {scope === 'country' ? 'a country' : scope === 'city' ? 'a city' : 'two or more cities'} to see how their tastes differ before you spend a run.
          </p>
        ) : !ids.length ? (
          <p className="text-sm text-mute">Waiting for the references from step 1.</p>
        ) : q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-40 w-full" />
            <p className="t-caption">Asking Qloo about {places.map((p) => p.name).join(', ')}…</p>
          </div>
        ) : q.isError || !q.data ? (
          <p className="text-sm text-mute">Qloo didn't answer for these places. Try another spelling.</p>
        ) : (
          <div className="space-y-4">
            {single && (
              <div className="h-48 overflow-hidden rounded-xl">
                <MapView
                  interactive={false}
                  geists={geists}
                  selected={scope === 'city' ? geists[0]?.key : null}
                  heat={q.data.heat as HeatCell[]}
                  heatColor={[217, 102, 63]}
                  heatScale={scope === 'country' ? 30 : 1}
                />
              </div>
            )}
            {single && q.data.heat.length > 0 && (
              <p className="text-sm text-ink-2">
                Your references concentrate in {q.data.heat.length} {scope === 'country' ? 'areas' : 'blocks'}. Tastegeist will find the{' '}
                {scope === 'country' ? 'cities' : 'neighborhoods'} behind them and read each one.
              </p>
            )}
            {q.data.places.map((p, i) => (
              <div key={p.name}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ background: rgb(ZONE_COLORS[i % ZONE_COLORS.length]) }} />
                    {p.name}
                  </span>
                  {p.coverage !== 'none' && (
                    <span className="tabular text-xs text-mute">
                      {p.distinct} of {p.read} titles only here
                    </span>
                  )}
                </div>
                {p.coverage === 'none' ? (
                  <p role="alert" className="mt-1.5 flex gap-2 rounded-lg bg-coral-soft p-2.5 text-xs text-ink">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-coral" aria-hidden />
                    Qloo has no taste data for {p.name}. Remove it or pick the nearest larger city, or the run will have nothing to read there.
                  </p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-6 gap-1">
                    {p.top.map((t) => (
                      <img key={t.id} src={t.image!} alt={t.name} title={t.name} className="aspect-square w-full rounded-md object-cover" />
                    ))}
                  </div>
                )}
                {p.coverage === 'thin' && (
                  <p className="mt-1.5 flex gap-2 text-xs text-ink-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden />
                    Thin data: Qloo returned {p.read} of 60 titles here. Expect a weaker, less distinctive zone.
                  </p>
                )}
              </div>
            ))}
            {q.data.overlap.length > 0 && (
              <ul className="space-y-1.5 border-t border-line pt-3">
                {q.data.overlap
                  .slice()
                  .sort((a, b) => a.pct - b.pct)
                  .map((o) => {
                    const v = verdict(o.pct)
                    return (
                      <li key={o.a + o.b} className="text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0">
                            {o.a} and {o.b}
                          </span>
                          <b className="tabular shrink-0">{Math.round(o.pct * 100)}% alike</b>
                        </div>
                        <div className={`text-xs ${v.tone}`}>{v.text}</div>
                      </li>
                    )
                  })}
              </ul>
            )}
            <p className="t-caption">From the top 60 titles Qloo returns per place for your references (music, TV, film). The full run reads 250 per place.</p>
          </div>
        )}
      </Block>

      <Block n="3" title="What one run makes">
        <p className="text-sm text-ink-2">
          Taste zones, a culture profile per place, three cited concepts per zone, a test against a generic control, a media plan and a client report.{' '}
          {typicalRun(runStats.data).replace(/^a/, 'A')}
          {runStats.data?.runs ? `, measured on ${runStats.data.runs} ${runStats.data.runs === 1 ? 'run' : 'runs'}` : ''}.
        </p>
      </Block>
    </aside>
  )
}
