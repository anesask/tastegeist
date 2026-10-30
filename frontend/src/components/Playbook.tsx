import { useQuery } from '@tanstack/react-query'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, fetchHeatmap, fmtDate, rgb, type HeatCell, type ProfileEntity, type RunResult } from '../lib/api'
import { colorOf, mapGeists, personaName, placeName } from '../lib/geists'
import { MapView } from './MapView'
import { Chip, Skeleton, Source } from './ui'

const money = (v: number, cur: string) => `${cur} ${Math.round(v).toLocaleString('en-GB')}`

function Column({ icon, title, sub, children }: { icon: ReactNode; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center gap-2 text-ink-2">{icon}</div>
      <h4 className="t-h2 mt-2">{title}</h4>
      <p className="mt-1 text-sm text-mute">{sub}</p>
      <div className="mt-5 flex flex-1 flex-col gap-5">{children}</div>
    </div>
  )
}

function Who({ e, role, why }: { e: Pick<ProfileEntity, 'id' | 'name' | 'image' | 'lift'>; role: string; why: string }) {
  return (
    <li className="flex gap-3">
      {e.image ? (
        <img src={e.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-[#f3efe7] object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-surface-2" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{e.name}</div>
        <div className="text-xs text-ink-2">{role}</div>
        <div className="t-caption">{why}</div>
      </div>
    </li>
  )
}

/**
 * The plan, drilled down: for each zone, where to place it, who to bring in and what to do each week.
 * Built from the campaign's own data (the plan, the ledger, the culture profile); no extra model spend.
 */
export function Playbook({ campaignId, result }: { campaignId: string; result: RunResult }) {
  const plan = result.plan
  const zones = plan.zones.filter((z) => z.budget > 0)
  const [key, setKey] = useState(zones[0]?.key)
  const z = zones.find((x) => x.key === key) ?? zones[0]
  const g = result.groups.find((x) => x.key === z?.key)
  const color = g ? colorOf(result, g.key) : ([217, 102, 63] as [number, number, number])
  const prof = useQuery({ queryKey: ['profile', campaignId, z?.key], queryFn: () => api.profile(campaignId, z!.key), enabled: !!z, staleTime: Infinity })
  const city = g ? (g.kind === 'neighborhood' ? (g.parent ?? g.markets[0]) : g.markets[0]) : ''
  const ids = g?.ledger.slice(0, 3).map((e) => e.id) ?? []
  const heat = useQuery({ queryKey: ['heat', city, ids.join()], queryFn: () => fetchHeatmap(city, ids), enabled: !!g, staleTime: Infinity, retry: false })
  if (!z || !g) return null

  const p = prof.data
  const sec = (id: string) => p?.sections.find((s) => s.id === id)?.entities ?? []
  const artists = sec('sound').slice(0, 3)
  const brands = sec('style').slice(0, 2)
  const podcasts = sec('listens').slice(0, 2)
  const screen = sec('screen').slice(0, 3)
  const venues = (p?.venues ?? g.places ?? []).slice(0, 4)
  const ch = (c: string) => z.channels.find((x) => x.channel === c)?.budget ?? 0
  const phases = ['Tease', 'Launch', 'Sustain'].map((phase) => {
    const f = plan.flighting.filter((x) => x.phase === phase)
    return { phase, start: f[0]?.start, end: f[0]?.end, channels: f.map((x) => x.label) }
  })
  // Headlines are quoted inline, so drop their own closing period.
  const bare = (t?: string | null) => (t ?? '').replace(/[.]$/, '')
  const head = bare(z.creative?.headline ?? g.concepts?.[0]?.headline?.text)
  const geists = mapGeists(result).filter((m) => m.key === g.key)
  const hotspots = (heat.data ?? []).filter((c) => c.lift >= 1.15).length

  const steps: Record<string, string> = {
    Tease: `Seed it with "${head}": social teasers and creator posts aimed at fans of ${[screen[0]?.name, artists[0]?.name].filter(Boolean).join(' and ') || 'the zone’s top titles'}. Social ${money(ch('social') / 3, plan.currency)}, creators ${money(ch('influencers') / 2, plan.currency)}.`,
    Launch: `Go big where the taste lives: out-of-home in the ${hotspots || 'top'} hotspot blocks, a launch night at ${venues[0]?.name ?? 'a local venue'}${artists[0] ? ` with a set inspired by ${artists[0].name}` : ''}, pre-roll around ${screen[0]?.name ?? 'the top shows'}${podcasts[0] ? `, audio around ${podcasts[0].name}` : ''}.`,
    Sustain: `Keep what works: run "${bare(z.ab_test?.a.headline) || head}" against "${bare(z.ab_test?.b.headline) || 'the runner-up'}" (${z.ab_test?.split ?? '50/50'}), and move spend to the winner after ${z.ab_test?.impressions_per_arm?.toLocaleString('en-GB') ?? 'enough'} impressions per arm.`,
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {zones.map((x) => {
          const gx = result.groups.find((y) => y.key === x.key)
          return (
            <Chip key={x.key} selected={x.key === z.key} onClick={() => setKey(x.key)}>
              <span className="h-2 w-2 rounded-full" style={{ background: rgb(gx ? colorOf(result, gx.key) : color) }} />
              {gx ? placeName(gx) : x.label}
              <span className="opacity-60">{money(x.budget, plan.currency)}</span>
            </Chip>
          )
        })}
      </div>
      <p className="text-sm text-ink-2">
        <b className="text-ink">{personaName(g)}</b>, {placeName(g)}: {money(z.budget, plan.currency)} from {fmtDate(plan.start)} to {fmtDate(plan.end)},
        running &ldquo;{head}&rdquo;.
      </p>

      <div className="grid gap-5 lg:grid-cols-3">
        <Column icon={<MapPin size={18} />} title="Where to place it" sub="The blocks, venues and media where this taste is strongest.">
          <div className="h-44 overflow-hidden rounded-xl">
            <MapView interactive={false} geists={geists} selected={g.key} heat={(heat.data ?? []) as HeatCell[]} heatColor={color} />
          </div>
          <div>
            <div className="kicker">Out of home and activations</div>
            <p className="mt-1 text-sm text-ink-2">
              {hotspots ? `${hotspots} blocks in ${city} where the taste over-indexes (the towers). ` : ''}Geo target:{' '}
              {z.geo.map((x) => `${x.name}, ${x.radius_km} km`).join('; ')}.
            </p>
            {venues.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {venues.map((v) => (
                  <figure key={v.id}>
                    {v.image ? (
                      <img src={v.image} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="aspect-[4/3] rounded-lg bg-surface-2" />
                    )}
                    <figcaption className="mt-1 truncate text-xs text-ink-2">{v.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
          {(screen.length > 0 || podcasts.length > 0) && (
            <div>
              <div className="kicker">Buy media around</div>
              <ul className="mt-1 space-y-1 text-sm text-ink-2">
                {screen.slice(0, 2).map((e) => (
                  <li key={e.id}>
                    Pre-roll and CTV around <b className="text-ink">{e.name}</b>
                  </li>
                ))}
                {podcasts.map((e) => (
                  <li key={e.id}>
                    Host-read spots in <b className="text-ink">{e.name}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Column>

        <Column icon={<Users size={18} />} title="Who to bring in" sub="Partners the zone already over-indexes on, from its Qloo ledger.">
          {prof.isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <ul className="space-y-4">
              {artists.slice(0, 2).map((e) => (
                <Who key={e.id} e={e} role="Sound: a launch set, a playlist or a track brief" why={`${e.lift.toFixed(1)}× more played here than elsewhere`} />
              ))}
              {brands.map((e) => (
                <Who key={e.id} e={e} role="Co-branded drop or shared shelf" why={`${e.lift.toFixed(1)}× more loved here`} />
              ))}
              {venues[0] && (
                <Who
                  e={{ id: venues[0].id, name: venues[0].name, image: venues[0].image, lift: 0 }}
                  role="Host the launch night"
                  why="A Qloo place near the zone, matched to its tastes"
                />
              )}
              <li className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
                <b className="text-ink">Creators, {money(ch('influencers'), plan.currency)}:</b> brief local creators whose audiences already post about{' '}
                {[screen[0]?.name, artists[0]?.name].filter(Boolean).join(' and ') || 'these titles'}. Qloo doesn't list creators; use these titles as the
                search terms.
              </li>
            </ul>
          )}
        </Column>

        <Column icon={<CalendarDays size={18} />} title="How to run it" sub="Three phases, each with what to do and what it costs here.">
          <ol className="relative space-y-5 border-l border-line pl-5">
            {phases.map((ph) => (
              <li key={ph.phase} className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full" style={{ background: rgb(color) }} />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="t-h3">{ph.phase}</span>
                  {ph.start && (
                    <span className="tabular text-xs text-mute">
                      {fmtDate(ph.start)} to {fmtDate(ph.end!)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-2">{steps[ph.phase]}</p>
                <p className="t-caption mt-1">{ph.channels.join(', ')}</p>
              </li>
            ))}
            <li className="relative">
              <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border border-line bg-bg" />
              <span className="t-h3">Measure</span>
              <p className="mt-1 text-sm text-ink-2">
                {z.ab_test?.metric ?? 'Click-through rate'} per arm; {z.ab_test?.assumption ?? ''}. Compare against the séance's prediction to calibrate the
                next brief.
              </p>
            </li>
          </ol>
        </Column>
      </div>
      <Source>From this campaign's plan, Qloo ledger, culture profile and heatmap. Partners are suggestions to approach, not existing deals.</Source>
    </div>
  )
}
