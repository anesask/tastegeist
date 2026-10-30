import { Check, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LogEvent } from '../lib/api'
import { fmtLeft, secondsLeft, useRunStats } from '../lib/runtime'
import { Button } from './ui'
import { Logo } from './Brand'

const SECTIONS: { step: string; label: string }[] = [
  { step: 'anchors', label: 'Resolve anchors on Qloo' },
  { step: 'culture_map', label: 'Culture maps per market' },
  { step: 'zones', label: 'Taste zones' },
  { step: 'neighborhoods', label: 'Neighborhoods' },
  { step: 'concepts', label: 'Creative concepts' },
  { step: 'seance', label: 'The séance' },
  { step: 'done', label: 'Media plan' },
]

/** Shown while a campaign generates: the current step as an editorial statement plus a checklist. */
export function RunProgress({ events, failed, onRetry }: { events: LogEvent[]; failed?: string | null; onRetry?: () => void }) {
  const steps = events.filter((e) => e.type === 'step') as (LogEvent & {
    step?: string
  })[]
  const seen = new Set(steps.map((s) => s.step))
  const currentIdx = Math.max(-1, ...SECTIONS.map((s, i) => (seen.has(s.step) ? i : -1)))
  const current = steps.at(-1)
  // Live estimate (C3): the server stamps each event with seconds since the start; between events the clock runs on.
  const stats = useRunStats()
  const lastT = Math.max(0, ...events.map((e) => e.t ?? 0))
  const seenAt = useRef(Date.now())
  useEffect(() => {
    seenAt.current = Date.now()
  }, [lastT])
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = lastT + (Date.now() - seenAt.current) / 1000
  const left = seen.has('done') || failed ? null : secondsLeft(events, elapsed, stats.data)
  const qloo = events.filter((e) => e.type === 'qloo').length
  const llm = events.filter((e) => e.type === 'llm').length

  return (
    <div className="card grid gap-10 p-6 md:grid-cols-[1.4fr_1fr] md:p-10">
      <div>
        <Logo className="h-12 w-12 animate-[pulse_2.4s_ease-in-out_infinite]" />
        {failed ? (
          <>
            <h2 className="mt-8 font-display text-statement leading-[1]">The geist went quiet.</h2>
            <p className="mt-3 text-sm text-coral">{failed}</p>
            {onRetry && (
              <Button variant="primary" className="mt-6" onClick={onRetry}>
                Try again
              </Button>
            )}
          </>
        ) : (
          <h2 key={current?.text} className="rise mt-8 font-display text-statement leading-[1.05] tracking-tight">
            {current?.text ?? 'Reading the brief…'}
          </h2>
        )}
        {left != null && (
          <p className="mt-6 text-sm text-ink-2" aria-live="polite">
            <b className="text-ink">{fmtLeft(left)}</b>
            <span className="text-mute">
              {' '}
              · a typical run takes {Math.round((stats.data!.p50 ?? 0) / 6) / 10} minutes, measured on {stats.data!.runs}{' '}
              {stats.data!.runs === 1 ? 'run' : 'runs'}
              {stats.data!.p95 ? `, 95% finish within ${Math.ceil(stats.data!.p95 / 60)} minutes` : ''}
            </span>
          </p>
        )}
        <p className="mt-2 text-sm text-mute">
          {qloo} Qloo calls · {llm} Claude calls · you can leave this page, generation continues
        </p>
      </div>
      <ol className="space-y-3">
        {SECTIONS.map((s, i) => {
          const done = i < currentIdx || seen.has('done')
          const active = i === currentIdx && !seen.has('done') && !failed
          return (
            <li key={s.step} className={`flex items-center gap-3 text-sm ${done ? 'text-ink' : active ? 'text-brand-ink' : 'text-mute'}`}>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border ${done ? 'border-mint bg-mint-soft text-mint' : active ? 'border-brand' : 'border-line'}`}
              >
                {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : null}
              </span>
              {s.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
