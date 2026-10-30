import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Film } from 'lucide-react'
import { api, fmtDate, rgb, type RunResult } from '../lib/api'
import { colorOf } from '../lib/geists'
import { Skeleton, Source } from './ui'

const DAY = 86_400_000

/**
 * The flight on a timeline with the local moments inside it: public holidays per country and
 * release anniversaries of each zone's own Qloo titles, each placed in the phase it falls in.
 */
export function CultureCalendar({ campaignId, result }: { campaignId: string; result: RunResult }) {
  const q = useQuery({ queryKey: ['calendar', campaignId, result.plan.start], queryFn: () => api.calendar(campaignId), staleTime: Infinity, retry: false })
  const plan = result.plan
  const t0 = new Date(plan.start).getTime()
  const span = Math.max(DAY, new Date(plan.end).getTime() - t0)
  const x = (d: string) => `${Math.min(100, Math.max(0, ((new Date(d).getTime() - t0) / span) * 100))}%`
  const phases = ['Tease', 'Launch', 'Sustain']
    .map((p) => plan.flighting.find((f) => f.phase === p))
    .filter(Boolean)
    .map((f) => ({ phase: f!.phase, start: f!.start, end: f!.end }))
  const phaseOf = (d: string) => phases.find((p) => d >= p.start && d <= p.end)?.phase

  if (q.isLoading) return <Skeleton className="h-40 w-full" />
  if (q.isError || !q.data) return <p className="text-sm text-mute">The calendar couldn't load right now.</p>
  // One row per date and title: the same holiday in three countries is one moment with three places.
  const merged = new Map<string, (typeof q.data.moments)[number] & { places: string[] }>()
  for (const m of q.data.moments) {
    const k = `${m.date}|${m.title}`
    const prev = merged.get(k)
    merged.set(k, prev ? { ...prev, places: [...prev.places, ...(m.markets ?? [])] } : { ...m, places: [...(m.markets ?? [])] })
  }
  const moments = [...merged.values()]

  return (
    <div>
      <div className="relative mt-2 h-24">
        <div className="absolute inset-x-0 top-8 flex h-8 overflow-hidden rounded-lg">
          {phases.map((p, i) => (
            <div
              key={p.phase}
              className={`flex items-center px-2 text-xs ${i === 1 ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
              style={{ width: `calc(${x(p.end)} - ${x(p.start)})`, marginLeft: i === 0 ? x(p.start) : undefined }}
            >
              {p.phase}
            </div>
          ))}
        </div>
        {moments.map((m) => (
          <div key={m.date + m.title} className="absolute top-0 -translate-x-1/2" style={{ left: x(m.date) }} title={`${fmtDate(m.date)}: ${m.title}`}>
            <span
              className={`block h-3 w-3 rounded-full ring-2 ring-bg ${m.kind === 'holiday' ? 'bg-mute' : ''}`}
              style={m.kind === 'anniversary' && m.zone ? { background: rgb(colorOf(result, m.zone)) } : undefined}
            />
            <span className="mx-auto mt-0.5 block h-14 w-px bg-line" />
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-xs text-mute tabular">
          <span>{fmtDate(plan.start)}</span>
          <span>{fmtDate(plan.end)}</span>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {moments.map((m) => (
          <li key={m.date + m.title} className="flex gap-3 py-3 text-sm">
            <span className="w-24 shrink-0 whitespace-nowrap tabular text-ink-2">{fmtDate(m.date)}</span>
            <span className="mt-0.5 shrink-0 text-mute">{m.kind === 'holiday' ? <CalendarDays size={15} /> : <Film size={15} />}</span>
            <span className="min-w-0">
              <span className="font-medium">{m.title}</span>{' '}
              <span className="text-mute">
                {m.kind === 'holiday' ? m.places.join(', ') : m.zone_label}
                {phaseOf(m.date) ? ` · ${phaseOf(m.date)} phase` : ''}
              </span>
              <span className="block text-xs text-ink-2">{m.why}</span>
            </span>
          </li>
        ))}
        {!moments.length && <li className="py-3 text-sm text-mute">No holidays or title anniversaries fall inside this flight.</li>}
      </ul>
      <Source>
        Public holidays from the open-source holidays dataset per country; anniversaries from Qloo release dates of the zones' own titles. School holidays,
        festivals and sports fixtures aren't included yet.
      </Source>
    </div>
  )
}
