import { useQuery } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { ArrowRightLeft, ChevronRight, ExternalLink, Pause, Play, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, fetchHeatmap, rgb, type Geist, type HeatCell, type PlaceProfile, type ProfileEntity, type RunResult, previewUrl } from '../../lib/api'
import { chosenConcept, colorOf, mapGeists, personaName, placeName, type RGB } from '../../lib/geists'
import { MapView } from '../../components/MapView'
import { Chart, axisStyle, tokens } from '../../components/Chart'
import { ImagePie } from '../../components/ImagePie'
import { Chip, Skeleton, Source } from '../../components/ui'
import { useTheme } from '../../theme'
import { useWorkspace } from './Workspace'

const DOMAIN: Record<string, string> = {
  artist: 'Music',
  tv_show: 'TV',
  movie: 'Film',
  podcast: 'Podcast',
  brand: 'Brand',
  book: 'Book',
  destination: 'Destination',
}
const SECTION_SHORT: Record<string, string> = {
  sound: 'Music',
  screen: 'Screen',
  style: 'Style',
  listens: 'Podcasts',
  reads: 'Books',
  travels: 'Travel',
}
// Each axis runs from 0 (first word) to 100 (second word); the chart labels the 100 end.
const AXES: [keyof NonNullable<PlaceProfile['mood']>['axes'], string, string][] = [
  ['energy', 'Calm', 'Energy'],
  ['warmth', 'Cool', 'Warmth'],
  ['time', 'Nostalgic', 'Now'],
  ['intimacy', 'Social', 'Intimacy'],
  ['tone', 'Earnest', 'Irony'],
]

function useProfile(id: string, key: string | null) {
  return useQuery({
    queryKey: ['profile', id, key],
    queryFn: () => api.profile(id, key!),
    enabled: !!key,
    staleTime: Infinity,
    retry: 1,
  })
}

// ---------- charts ----------

/** What the taste is made of: a pie of the place's strongest titles across every domain, each slice its own cover. */
function TastePie({ p, color, onPick }: { p: PlaceProfile; color: RGB; onPick: (e: ProfileEntity) => void }) {
  const ents = p.sections.flatMap((s) => s.entities.filter((e) => e.image).slice(0, s.id === 'sound' || s.id === 'screen' ? 3 : 2))
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]))
  const items = ents.map((e) => ({
    id: e.id,
    name: e.name,
    image: e.image,
    value: e.lift,
    sub: `${DOMAIN[e.domain]} · ${e.lift.toFixed(1)}×`,
  }))
  return (
    <ImagePie
      items={items}
      color={color}
      size={420}
      center={{ title: '', sub: 'Hover a slice, click to open it' }}
      onPick={(it) => byId[it.id] && onPick(byId[it.id])}
      label={`What ${p.label}'s taste is made of: its strongest titles across music, screen, style, podcasts, books and travel`}
    />
  )
}

/** Mood on five axes; two places overlay when comparing. */
function MoodRadar({
  items,
}: {
  items: {
    label: string
    color: RGB
    mood: NonNullable<PlaceProfile['mood']>
  }[]
}) {
  const { theme } = useTheme()
  const option = useMemo(() => {
    const t = tokens()
    return {
      legend:
        items.length > 1
          ? {
              bottom: 0,
              textStyle: { color: t.mute, fontSize: 12 },
              icon: 'circle',
              itemWidth: 10,
              itemHeight: 10,
            }
          : undefined,
      tooltip: {
        formatter: (x: unknown) => {
          const d = x as { name: string; value: number[] }
          return `<b>${d.name}</b><br/>` + AXES.map(([, lo, hi], i) => `${lo} to ${hi}: ${d.value[i]}`).join('<br/>')
        },
      },
      radar: {
        radius: '66%',
        center: ['50%', items.length > 1 ? '46%' : '50%'],
        indicator: AXES.map(([, , hi]) => ({ name: hi, max: 100 })),
        axisName: { color: t.ink2, fontSize: 12 },
        splitLine: { lineStyle: { color: t.line } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: t.line } },
      },
      series: [
        {
          type: 'radar' as const,
          data: items.map((x) => ({
            name: x.label,
            value: AXES.map(([k]) => x.mood.axes[k]),
            lineStyle: { color: rgb(x.color), width: 2 },
            itemStyle: { color: rgb(x.color) },
            areaStyle: { color: rgb(x.color, 0.22) },
            symbolSize: 5,
          })),
        },
      ],
    } as unknown as EChartsOption
  }, [items, theme])
  return <Chart option={option} height={300} theme={theme} label="Mood profile on five axes, an AI interpretation of the Qloo genres and titles" />
}

function GenreBars({ tags, color }: { tags: PlaceProfile['tags']; color: RGB }) {
  const { theme } = useTheme()
  const rows = tags.slice(0, 8)
  const option = useMemo(() => {
    const t = tokens()
    const max = Math.max(...rows.map((r) => r.affinity), 0.01)
    return {
      grid: { left: 150, right: 16, top: 4, bottom: 4, containLabel: false },
      xAxis: { type: 'value' as const, show: false, max: max * 1.05 },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rows.map((r) => r.name),
        ...axisStyle(),
        axisLine: { show: false },
        axisLabel: {
          color: t.ink2,
          fontSize: 12,
          width: 140,
          overflow: 'truncate' as const,
          align: 'right' as const,
        },
      },
      tooltip: {
        formatter: (x: unknown) =>
          `<b>${(x as { name: string }).name}</b><br/>${rows[(x as { dataIndex: number }).dataIndex].kind === 'music' ? 'Music' : 'Film and TV'} genre`,
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: 12,
          data: rows.map((r) => ({
            value: r.affinity,
            itemStyle: {
              color: r.kind === 'music' ? rgb(color) : rgb(color, 0.5),
              borderRadius: [0, 6, 6, 0],
            },
          })),
          showBackground: true,
          backgroundStyle: {
            color: t.line,
            opacity: 0.35,
            borderRadius: [0, 6, 6, 0],
          },
        },
      ],
    } as unknown as EChartsOption
  }, [rows, color, theme])
  return <Chart option={option} height={rows.length * 30 + 12} theme={theme} label="Top genres, Qloo genre tags" />
}

const AGE_LABEL: Record<string, string> = {
  '24_and_younger': '24 and under',
  '25_to_29': '25-29',
  '30_to_34': '30-34',
  '35_to_44': '35-44',
  '45_to_54': '45-54',
  '55_and_older': '55+',
}

/** Age and sex skew of the place's audience: the average Qloo skew of its strongest titles. */
function Who({ p, color, names }: { p: PlaceProfile; color: RGB; names: Record<string, string> }) {
  const { theme } = useTheme()
  const avg = useMemo(() => {
    const n = Math.max(p.demographics.length, 1)
    const age: Record<string, number> = {}
    const gender: Record<string, number> = {}
    for (const d of p.demographics) {
      for (const [k, v] of Object.entries(d.query.age ?? {})) age[k] = (age[k] ?? 0) + v / n
      for (const [k, v] of Object.entries(d.query.gender ?? {})) gender[k] = (gender[k] ?? 0) + v / n
    }
    return { age, gender }
  }, [p])
  const option = useMemo(() => {
    const t = tokens()
    const rows = Object.keys(AGE_LABEL).map((k) => ({ k, v: avg.age[k] ?? 0 }))
    return {
      grid: { left: 96, right: 24, top: 4, bottom: 20, containLabel: false },
      xAxis: {
        type: 'value' as const,
        min: -1,
        max: 1,
        ...axisStyle(),
        axisLabel: {
          color: t.mute,
          fontSize: 12,
          formatter: (v: number) => (v === 0 ? 'avg' : ''),
        },
      },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rows.map((r) => AGE_LABEL[r.k]),
        ...axisStyle(),
        axisLine: { show: false },
        axisLabel: { color: t.ink2, fontSize: 12 },
      },
      tooltip: {
        formatter: (x: unknown) => `${(x as { name: string }).name}: ${Number((x as { value: number }).value) >= 0 ? 'over' : 'under'}-indexes`,
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: 12,
          data: rows.map((r) => ({
            value: Number(r.v.toFixed(2)),
            itemStyle: {
              color: r.v >= 0 ? rgb(color) : t.line,
              borderRadius: r.v >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6],
            },
          })),
        },
      ],
    } as unknown as EChartsOption
  }, [avg, color, theme])
  const female = avg.gender.female ?? 0
  const lean = Math.abs(female) < 0.05 ? 'No clear lean by sex' : female > 0 ? 'Leans female' : 'Leans male'
  const drivers = p.demographics
    .slice(0, 3)
    .map((d) => names[d.entity_id])
    .filter(Boolean)
  return (
    <div>
      <Chart option={option} height={230} theme={theme} label="Age skew of this place's audience, Qloo demographics" />
      <div className="mt-3 flex items-center gap-3 text-sm">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              background: rgb(color),
              left: female >= 0 ? '50%' : `${50 + female * 50}%`,
              width: `${Math.abs(female) * 50}%`,
            }}
          />
        </div>
        <span className="shrink-0 text-ink-2">{lean}</span>
      </div>
      {drivers.length > 0 && <p className="t-caption mt-3">Driven by {drivers.join(', ')}. Group skew, never a profile of a person.</p>}
    </div>
  )
}

// ---------- entity views ----------

function Mixtape({ entities, color, onPick }: { entities: ProfileEntity[]; color: RGB; onPick: (e: ProfileEntity) => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [queue, setQueue] = useState(false)
  const playable = entities.filter((e) => e.preview)

  function play(e: ProfileEntity, continueQueue = false) {
    const a = audio.current
    if (!a || !e.preview) return
    if (playing === e.id && !a.paused) {
      a.pause()
      setPlaying(null)
      setQueue(false)
      return
    }
    a.src = previewUrl(e.name)
    a.play().catch(() => setPlaying(null))
    setPlaying(e.id)
    setQueue(continueQueue)
  }
  function next() {
    if (!queue) return setPlaying(null)
    const i = playable.findIndex((e) => e.id === playing)
    const n = playable[i + 1]
    if (n) play(n, true)
    else {
      setPlaying(null)
      setQueue(false)
    }
  }
  useEffect(() => () => audio.current?.pause(), [])

  return (
    <div>
      <audio ref={audio} onEnded={next} preload="none" />
      {playable.length > 0 && (
        <button
          type="button"
          onClick={() => (queue ? (audio.current?.pause(), setQueue(false), setPlaying(null)) : play(playable[0], true))}
          className="mb-4 inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-medium text-on-brand transition hover:opacity-90 active:scale-[0.98]"
        >
          {queue ? <Pause size={16} /> : <Play size={16} />} {queue ? 'Pause the mixtape' : `Play the mixtape, ${playable.length} tracks`}
        </button>
      )}
      <ol className="divide-y divide-line">
        {entities.slice(0, 10).map((e, i) => {
          const on = playing === e.id
          return (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <span className="tabular w-5 text-right text-xs text-mute">{i + 1}</span>
              <button
                type="button"
                onClick={() => play(e)}
                disabled={!e.preview}
                className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2 disabled:cursor-default"
                aria-label={e.preview ? `${on ? 'Pause' : 'Play'} ${e.name}` : e.name}
              >
                {(e.preview?.cover || e.image) && <img src={e.preview?.cover || e.image!} alt="" loading="lazy" className="h-full w-full object-cover" />}
                {e.preview && (
                  <span
                    className={`absolute inset-0 grid place-items-center bg-black/45 text-white transition ${on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    {on ? <Pause size={18} /> : <Play size={18} />}
                  </span>
                )}
              </button>
              <button type="button" onClick={() => onPick(e)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{e.name}</div>
                <div className="truncate text-xs text-mute">{e.preview ? e.preview.track : 'No preview available'}</div>
              </button>
              <div className="hidden w-24 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (e.lift / entities[0].lift) * 100)}%`,
                      background: rgb(color),
                    }}
                  />
                </div>
              </div>
              <span className="tabular w-12 text-right text-xs text-ink-2">{e.lift.toFixed(1)}×</span>
            </li>
          )
        })}
      </ol>
      <p className="t-caption mt-3">
        30-second previews from Deezer. Ranked by Qloo lift: how much more this place plays them than the campaign's other places.
      </p>
    </div>
  )
}

/** Cover art sized by lift: the strongest titles take the big tiles. */
function CoverGrid({ entities, onPick }: { entities: ProfileEntity[]; onPick: (e: ProfileEntity) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {entities.slice(0, 10).map((e, i) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onPick(e)}
          className={`group relative overflow-hidden rounded-lg bg-surface-2 text-left ${i < 2 ? 'col-span-2 row-span-2' : ''}`}
        >
          {e.image ? (
            <img
              src={e.image}
              alt=""
              loading="lazy"
              className={`w-full object-cover transition duration-500 group-hover:scale-[1.03] ${i < 2 ? 'aspect-[4/5]' : 'aspect-[3/4]'}`}
            />
          ) : (
            <div className={`grid w-full place-items-center p-3 text-center text-sm font-medium ${i < 2 ? 'aspect-[4/5]' : 'aspect-[3/4]'}`}>{e.name}</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
            <div className={`truncate font-medium ${i < 2 ? 'text-sm' : 'text-xs'}`}>{e.name}</div>
            <div className="tabular text-xs text-white/70">
              {DOMAIN[e.domain]} · {e.lift.toFixed(1)}×
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Pareto view of a section: titles sorted by how strongly this place leans to them (bars), and the
 * running share of that lift (line), so the few titles that carry most of the taste stand out.
 */
function Pareto({ entities, color, onPick }: { entities: ProfileEntity[]; color: RGB; onPick: (e: ProfileEntity) => void }) {
  const { theme } = useTheme()
  const list = entities
    .slice(0, 10)
    .slice()
    .sort((a, b) => b.lift - a.lift)
  const option = useMemo(() => {
    const t = tokens()
    const total = list.reduce((a, e) => a + e.lift, 0) || 1
    let run = 0
    const cum = list.map((e) => Math.round(((run += e.lift) / total) * 100))
    const vital = cum.findIndex((c) => c >= 80)
    return {
      grid: { left: 8, right: 44, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: list.map((e) => e.name),
        ...axisStyle(),
        axisLabel: { color: t.ink2, fontSize: 11, interval: 0, rotate: 30, width: 90, overflow: 'truncate' as const },
      },
      yAxis: [
        { type: 'value' as const, name: 'Lift', nameTextStyle: { color: t.mute, fontSize: 11 }, ...axisStyle() },
        {
          type: 'value' as const,
          max: 100,
          name: 'Cumulative %',
          nameTextStyle: { color: t.mute, fontSize: 11 },
          axisLabel: { color: t.mute, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 34,
          data: list.map((e, i) => ({ value: Number(e.lift.toFixed(2)), itemStyle: { color: i <= vital ? rgb(color) : t.line, borderRadius: [6, 6, 0, 0] } })),
        },
        {
          type: 'line' as const,
          yAxisIndex: 1,
          data: cum,
          smooth: true,
          symbolSize: 6,
          lineStyle: { color: t.ink2, width: 2 },
          itemStyle: { color: t.ink2 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [{ yAxis: 80 }],
            lineStyle: { color: t.mute, type: 'dashed' as const },
            label: { show: false },
          },
        },
      ],
    } as unknown as EChartsOption
  }, [list, color, theme])
  const vitalCount = (() => {
    const total = list.reduce((a, e) => a + e.lift, 0) || 1
    let run = 0
    return list.findIndex((e) => (run += e.lift) / total >= 0.8) + 1
  })()
  return (
    <div>
      <Chart
        option={option}
        height={280}
        theme={theme}
        label={`Pareto: lift per title and cumulative share`}
        onClick={(p) => typeof p.dataIndex === 'number' && list[p.dataIndex] && onPick(list[p.dataIndex])}
      />
      <p className="t-caption mt-1">
        {vitalCount} of {list.length} titles carry 80% of this place's lift here (colored). Click a bar to drill in.
      </p>
    </div>
  )
}

/** Covers or a Pareto chart, the reader's choice. */
function TileOrPareto({ entities, color, onPick }: { entities: ProfileEntity[]; color: RGB; onPick: (e: ProfileEntity) => void }) {
  const [view, setView] = useState<'covers' | 'pareto'>('covers')
  return (
    <div>
      <div className="mb-3 flex gap-1.5" role="group" aria-label="View">
        {(['covers', 'pareto'] as const).map((v) => (
          <Chip key={v} selected={view === v} onClick={() => setView(v)} className="!h-8 !text-xs">
            {v === 'covers' ? 'Covers' : 'Pareto'}
          </Chip>
        ))}
      </div>
      {view === 'covers' ? <TileRow entities={entities} onPick={onPick} /> : <Pareto entities={entities} color={color} onPick={onPick} />}
    </div>
  )
}

function TileRow({ entities, onPick }: { entities: ProfileEntity[]; onPick: (e: ProfileEntity) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {entities.slice(0, 10).map((e) => (
        <button key={e.id} type="button" onClick={() => onPick(e)} className="group w-32 shrink-0 text-left">
          <div className="aspect-square overflow-hidden rounded-lg bg-surface-2">
            {e.image ? (
              <img
                src={e.image}
                alt=""
                loading="lazy"
                className={`h-full w-full transition duration-500 group-hover:scale-[1.04] ${e.domain === 'brand' ? 'bg-[#f3efe7] object-contain p-3' : 'object-cover'}`}
              />
            ) : (
              <div className="grid h-full place-items-center p-2 text-center text-xs font-medium text-ink-2">{e.name}</div>
            )}
          </div>
          <div className="mt-1.5 truncate text-sm font-medium" title={e.name}>
            {e.name}
          </div>
          <div className="tabular text-xs text-mute">{e.lift.toFixed(1)}× here</div>
        </button>
      ))}
    </div>
  )
}

/** Who one title skews to: Qloo's age and sex skew for its fans, as a group. */
function EntityWho({ d, color }: { d: { age: Record<string, number>; gender: Record<string, number> }; color: RGB }) {
  const rows = Object.keys(AGE_LABEL).map((k) => ({ k, v: d.age?.[k] ?? 0 }))
  if (!rows.some((r) => r.v)) return null
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 0.01)
  const female = d.gender?.female ?? 0
  return (
    <div className="mt-6">
      <div className="t-h3">Who it skews to</div>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.k} className="grid grid-cols-[84px_1fr_1fr] items-center gap-1 text-xs">
            <span className="text-ink-2">{AGE_LABEL[r.k]}</span>
            <span className="flex justify-end">{r.v < 0 && <span className="h-2 rounded-l-full bg-line" style={{ width: `${(-r.v / max) * 100}%` }} />}</span>
            <span>{r.v > 0 && <span className="block h-2 rounded-r-full" style={{ width: `${(r.v / max) * 100}%`, background: rgb(color) }} />}</span>
          </li>
        ))}
      </ul>
      <p className="t-caption mt-2">
        {Math.abs(female) < 0.1 ? 'No clear lean by sex' : female > 0 ? 'Leans female' : 'Leans male'}. Qloo demographics for fans of this title: a group skew
        against average, never individuals.
      </p>
    </div>
  )
}

/** The arithmetic behind one lift, place by place: rank, score, and score over the average. */
function LiftWorking({ e }: { e: ProfileEntity }) {
  const rows = Object.entries(e.ranks ?? {}).map(([name, [r, k]]) => ({ name, r, k, score: r ? 1 - (r - 1) / Math.max(k, 1) : 0 }))
  const mean = rows.reduce((a, x) => a + x.score, 0) / Math.max(rows.length, 1)
  const EPS = 0.05 // backend/app/profile.py
  const lift = (v: number) => (v + EPS) / (mean + EPS)
  // The row this profile's lift comes from: the place of this zone where the title is strongest.
  const best = rows.reduce((a, x) => (Math.abs(lift(x.score) - e.lift) < Math.abs(lift(a.score) - e.lift) ? x : a), rows[0])
  if (!rows.length) return null
  return (
    <div className="mt-6">
      <div className="t-h3">How the lift is worked out</div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-mute">
            <th className="py-1 font-normal">Place</th>
            <th className="py-1 text-right font-normal">Rank</th>
            <th className="py-1 text-right font-normal">Score</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows
            .sort((a, b) => b.score - a.score)
            .map((x) => (
              <tr key={x.name} className="border-t border-line">
                <td className="py-1.5 pr-2">{x.name}</td>
                <td className="py-1.5 text-right text-ink-2">{x.r ? `#${x.r} of ${x.k}` : `not in top ${x.k}`}</td>
                <td className="py-1.5 text-right text-ink-2">{x.score.toFixed(2)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="t-caption mt-2">
        Score: #1 scores 1.0, lower ranks less, absent 0. Lift: a place's score over the average of all {rows.length} places, plus a small constant ({EPS}) so
        rare titles don't explode. {best.name}: ({best.score.toFixed(2)} + {EPS}) / ({mean.toFixed(2)} + {EPS}) = {lift(best.score).toFixed(1)}×. Each list is
        Qloo's top {best.k} for your references in that place.
      </p>
    </div>
  )
}

/** Drill-down: one title, how strongly each place in the campaign leans to it, and the concepts that use it. */
function EntityDrawer({ e, g, color, result, onClose }: { e: ProfileEntity; g: Geist; color: RGB; result: RunResult; onClose: () => void }) {
  const groups = result.groups
  const here = placeName(g)
  const city = g.kind === 'neighborhood' ? (g.parent ?? g.markets[0]) : g.markets[0]
  const detail = useQuery({ queryKey: ['entity', e.id, e.domain], queryFn: () => api.entity(e.id, e.domain), staleTime: Infinity, retry: false })
  const heat = useQuery({ queryKey: ['heat', city, e.id], queryFn: () => fetchHeatmap(city, [e.id]), staleTime: Infinity, retry: false })
  const { theme } = useTheme()
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const rows = useMemo(
    () =>
      [
        { name: here, v: e.lift, me: true },
        ...Object.entries(e.elsewhere).map(([name, v]) => ({
          name,
          v,
          me: false,
        })),
      ].sort((a, b) => b.v - a.v),
    [e, here],
  )
  const option = useMemo(() => {
    const t = tokens()
    return {
      grid: { left: 110, right: 40, top: 4, bottom: 4, containLabel: false },
      xAxis: { type: 'value' as const, show: false },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rows.map((r) => r.name),
        ...axisStyle(),
        axisLine: { show: false },
        axisLabel: {
          color: t.ink2,
          fontSize: 12,
          width: 100,
          overflow: 'truncate' as const,
          align: 'right' as const,
        },
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: 12,
          data: rows.map((r) => ({
            value: Number(r.v.toFixed(2)),
            itemStyle: {
              color: r.me ? rgb(color) : t.mute,
              opacity: r.me ? 1 : 0.5,
              borderRadius: [0, 6, 6, 0],
            },
          })),
          label: {
            show: true,
            position: 'right' as const,
            color: t.mute,
            fontSize: 12,
            formatter: (x: { value: number }) => `${x.value.toFixed(1)}×`,
          },
        },
      ],
    } as unknown as EChartsOption
  }, [rows, color, theme])
  const uses = groups.flatMap((g) =>
    (g.concepts ?? [])
      .filter((c) => [c.big_idea, c.headline, c.body, c.music, ...c.moodboard, ...c.partners, ...c.channels].some((x) => x?.because?.includes(e.id)))
      .map((c) => ({ g, c })),
  )
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="rise h-full w-full max-w-md overflow-y-auto bg-bg p-6 shadow-2xl" onClick={(ev) => ev.stopPropagation()} aria-label={e.name}>
        <div className="flex items-start justify-between gap-4">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-mute">
            {g.kind === 'neighborhood' && (
              <>
                <span>{city}</span>
                <ChevronRight size={12} aria-hidden />
              </>
            )}
            <span>{here}</span>
            <ChevronRight size={12} aria-hidden />
            <span>{DOMAIN[e.domain]}</span>
            <ChevronRight size={12} aria-hidden />
            <span className="text-ink-2">{e.name}</span>
          </nav>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface-2"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {e.image && <img src={e.image} alt="" className="mt-4 aspect-[4/3] w-full rounded-xl object-cover" />}
        <h2 className="t-h1 mt-5">{e.name}</h2>
        <p className="mt-1 text-sm text-ink-2">
          <b className="tabular" style={{ color: rgb(color) }}>
            {e.lift.toFixed(1)}×
          </b>{' '}
          in {here} compared with the campaign's other places.
        </p>
        {e.preview && (
          <a href={e.preview.link} target="_blank" rel="noreferrer" className="text-link mt-3 inline-flex items-center gap-1 text-sm">
            {e.preview.track} on Deezer <ExternalLink size={13} />
          </a>
        )}
        <div className="mt-6 t-h3">Where it over-indexes</div>
        <div className="mt-2">
          <Chart option={option} height={rows.length * 30 + 12} theme={theme} label={`Lift of ${e.name} in each place of the campaign`} />
        </div>
        {e.ranks && <LiftWorking e={e} />}
        <div className="mt-6 t-h3">Where it lives in {city}</div>
        <div className="mt-2 h-48 overflow-hidden rounded-xl">
          {heat.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <MapView
              interactive={false}
              geists={mapGeists(result).filter((m) => m.key === g.key)}
              selected={g.key}
              heat={(heat.data ?? []) as HeatCell[]}
              heatColor={color}
            />
          )}
        </div>
        <p className="t-caption mt-2">
          {heat.data?.length
            ? `${heat.data.filter((c) => c.lift >= 1.15).length} blocks of ${city} over-index on ${e.name} alone.`
            : 'Qloo heatmap for this title.'}{' '}
          <Link to={`../zones?g=${encodeURIComponent(g.key)}&e=${encodeURIComponent(e.id)}&n=${encodeURIComponent(e.name)}`} className="text-link">
            Show it on the zone map
          </Link>
        </p>
        {detail.data && <EntityWho d={detail.data.demographics} color={color} />}
        {detail.data && detail.data.related.length > 0 && (
          <div className="mt-6">
            <div className="t-h3">Goes with</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {detail.data.related.map((x) => (
                <figure key={x.id}>
                  {x.image ? (
                    <img src={x.image} alt="" loading="lazy" className="aspect-square w-full rounded-lg bg-[#f3efe7] object-cover" />
                  ) : (
                    <div className="aspect-square rounded-lg bg-surface-2" />
                  )}
                  <figcaption className="mt-1 truncate text-xs text-ink-2" title={x.name}>
                    {x.name}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="t-caption mt-2">What fans of {e.name} also love, from Qloo. Worth testing in the moodboard.</p>
          </div>
        )}
        <div className="mt-6 t-h3">Used in {uses.length === 1 ? '1 concept' : `${uses.length} concepts`}</div>
        {uses.length ? (
          <ul className="mt-2 space-y-2">
            {uses.map(({ g, c }) => (
              <li key={g.key + c.id}>
                <Link
                  to={`../creatives?g=${encodeURIComponent(g.key)}&c=${c.id}&hl=${encodeURIComponent(e.id)}#data-to-line`}
                  className="card-interactive block rounded-xl border border-line p-3 text-sm"
                >
                  <div className="font-medium">{c.headline?.text ?? c.direction}</div>
                  <div className="text-xs text-mute">
                    {personaName(g)}, {placeName(g)}
                    {chosenConcept(g)?.id === c.id ? ' · in the plan' : ''} · see the lines that cite it
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-mute">No concept cites it yet: a reference the creative team could still use.</p>
        )}
        <div className="mt-6">
          <Source>Qloo entity {e.id}</Source>
        </div>
      </aside>
    </div>
  )
}

// ---------- page ----------

function Section({ title, sub, children, source }: { title: string; sub?: string; children: React.ReactNode; source?: string }) {
  return (
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="t-h2">{title}</h3>
          {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
        </div>
        {source && <Source>{source}</Source>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function SideBySide({ a, b, ca, cb }: { a: PlaceProfile; b: PlaceProfile; ca: RGB; cb: RGB }) {
  return (
    <Section title={`${a.label} and ${b.label}, side by side`} sub="The strongest titles in each domain. Shared ones are outlined." source="Qloo Insights">
      <div className="space-y-6">
        {a.sections.map((sa) => {
          const sb = b.sections.find((x) => x.id === sa.id)
          if (!sb || (!sa.entities.length && !sb.entities.length)) return null
          const shared = new Set(
            sa.entities
              .slice(0, 6)
              .map((e) => e.id)
              .filter((id) => sb.entities.slice(0, 6).some((x) => x.id === id)),
          )
          const col = (p: PlaceProfile, s: typeof sa, c: RGB) => (
            <div className="grid grid-cols-6 gap-1.5">
              {s.entities.slice(0, 6).map((e) => (
                <div
                  key={e.id}
                  title={`${e.name} · ${e.lift.toFixed(1)}× in ${p.label}`}
                  className={`aspect-square overflow-hidden rounded-md bg-surface-2 ${shared.has(e.id) ? 'ring-2 ring-ink' : ''}`}
                >
                  {e.image ? (
                    <img src={e.image} alt={e.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center p-1 text-center text-[0.75rem] leading-tight">{e.name}</div>
                  )}
                </div>
              ))}
              <div className="col-span-6 mt-1 h-1 rounded-full" style={{ background: rgb(c) }} />
            </div>
          )
          return (
            <div key={sa.id}>
              <div className="kicker mb-2">
                {SECTION_SHORT[sa.id]} {shared.size ? `· ${shared.size} shared` : '· nothing shared'}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {col(a, sa, ca)}
                {col(b, sb, cb)}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function CultureTab() {
  const { campaign, result } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const fallback = result.groups.find((g) => g.kind === 'neighborhood')?.key ?? result.groups[0]?.key
  const key = params.get('g') ?? fallback
  const vs = params.get('vs')
  const g = result.groups.find((x) => x.key === key) ?? result.groups[0]
  const other = vs ? result.groups.find((x) => x.key === vs) : undefined
  const color = colorOf(result, g.key)
  const pq = useProfile(campaign.id, g.key)
  const vq = useProfile(campaign.id, other?.key ?? null)
  const [picked, setPicked] = useState<ProfileEntity | null>(null)
  const p = pq.data

  const set = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v)
      else sp.delete(k)
    }
    setParams(sp, { replace: true })
  }
  const names = useMemo(() => Object.fromEntries((p?.sections ?? []).flatMap((s) => s.entities.map((e) => [e.id, e.name]))), [p])
  const section = (id: string) => p?.sections.find((s) => s.id === id)

  return (
    <div className="flex flex-col gap-6">
      {/* Place picker and compare */}
      <div className="flex flex-wrap items-center gap-2">
        {result.groups.map((x) => (
          <Chip key={x.key} selected={x.key === g.key} onClick={() => set({ g: x.key, vs: vs === x.key ? null : vs })}>
            <span className="h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, x.key)) }} />
            {placeName(x)}
          </Chip>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <label className="inline-flex items-center gap-2 text-sm text-ink-2">
          <ArrowRightLeft size={15} aria-hidden /> Compare with
          <select
            value={vs ?? ''}
            onChange={(e) => set({ vs: e.target.value || null })}
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="">nobody</option>
            {result.groups
              .filter((x) => x.key !== g.key)
              .map((x) => (
                <option key={x.key} value={x.key}>
                  {placeName(x)}
                </option>
              ))}
          </select>
        </label>
      </div>

      {pq.isLoading || !p ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <p className="t-caption">Reading {placeName(g)}'s culture from Qloo: music, screen, style, podcasts, books and travel.</p>
        </div>
      ) : pq.isError ? (
        <div className="card p-6 text-sm text-ink-2">The culture profile couldn't load right now. Try again in a moment.</div>
      ) : (
        <>
          {/* Portrait */}
          <section className="card grid gap-6 overflow-hidden p-6 md:p-8 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="kicker" style={{ color: rgb(color) }}>
                The culture of {placeName(g)}
              </div>
              <h2 className="mt-3 font-display text-statement leading-[1]">{personaName(g)}</h2>
              {p.mood && (
                <dl className="mt-6 space-y-4">
                  {(
                    [
                      ['Sounds like', p.mood.sounds_like],
                      ['Looks like', p.mood.looks_like],
                      ['Feels like', p.mood.feels_like],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="grid gap-1 sm:grid-cols-[110px_1fr]">
                      <dt className="kicker pt-1">{k}</dt>
                      <dd className="text-lg leading-snug text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.palette.length > 0 && (
                <div className="mt-6">
                  <div className="flex h-14 overflow-hidden rounded-xl ring-1 ring-line">
                    {p.palette.map((c) => (
                      <div key={c} className="flex-1" style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between">
                    {p.palette.map((c) => (
                      <span key={c} className="tabular text-xs text-mute">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="t-caption mt-4">
                The three lines and the mood are AI interpretation of Qloo genres and titles. The palette is computed from this place's Qloo imagery.
              </p>
            </div>
            <div>
              {p.mood && (
                <MoodRadar
                  items={[
                    { label: placeName(g), color, mood: p.mood },
                    ...(other && vq.data?.mood
                      ? [
                          {
                            label: placeName(other),
                            color: colorOf(result, other.key),
                            mood: vq.data.mood,
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            </div>
          </section>

          {other && vq.data && <SideBySide a={p} b={vq.data} ca={color} cb={colorOf(result, other.key)} />}

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="What the taste is made of" sub="Its strongest titles across every domain. Hover a slice, click to drill in." source="Qloo lift">
              <TastePie p={p} color={color} onPick={setPicked} />
            </Section>
            <Section title={`What ${placeName(g)} listens to`} source="Qloo artists and genres">
              {section('sound') && <Mixtape entities={section('sound')!.entities} color={color} onPick={setPicked} />}
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Section title="What it watches" sub="Cover art sized by lift. Click any title to drill in." source="Qloo TV and film">
              {section('screen') && <CoverGrid entities={section('screen')!.entities} onPick={setPicked} />}
            </Section>
            <div className="flex flex-col gap-6">
              <Section title="Genres" source="Qloo genre tags">
                <GenreBars tags={p.tags} color={color} />
              </Section>
              <Section title="Who it is" source="Qloo demographics">
                <Who p={p} color={color} names={names} />
              </Section>
            </div>
          </div>

          {(
            [
              ['style', 'What it wears and buys'],
              ['listens', 'What it tunes into'],
              ['reads', 'What it reads'],
              ['travels', 'Where it travels'],
            ] as const
          ).map(([id, title]) =>
            section(id)?.entities.length ? (
              <Section key={id} title={title} source={`Qloo ${SECTION_SHORT[id].toLowerCase()}`}>
                <TileOrPareto entities={section(id)!.entities} color={color} onPick={setPicked} />
              </Section>
            ) : null,
          )}

          {p.day && p.day.length > 0 && (
            <Section
              title={`A day in ${placeName(g)}`}
              sub="Built from the places and titles above. Every name is a Qloo entity."
              source="Written by AI from Qloo data"
            >
              <ol className="grid gap-6 md:grid-cols-4">
                {p.day.map((m) => {
                  const img = p.venues.find((v) => m.refs.includes(v.name) && v.image)?.image
                  return (
                    <li key={m.time}>
                      {img ? (
                        <img src={img} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
                      ) : (
                        <div className="aspect-[4/3] rounded-lg bg-surface-2" />
                      )}
                      <div className="kicker mt-3">{m.time}</div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{m.text}</p>
                    </li>
                  )
                })}
              </ol>
            </Section>
          )}

          {p.venues.length > 0 && (
            <Section title="Where it eats, drinks and goes out" source="Qloo places nearby">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {p.venues.slice(0, 12).map((v) => (
                  <figure key={v.id}>
                    {v.image ? (
                      <img src={v.image} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div className="aspect-square rounded-lg bg-surface-2" />
                    )}
                    <figcaption className="mt-1.5 truncate text-sm" title={v.name}>
                      {v.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {picked && p && <EntityDrawer e={picked} g={g} color={color} result={result} onClose={() => setPicked(null)} />}
    </div>
  )
}
