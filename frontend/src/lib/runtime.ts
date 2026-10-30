import { useQuery } from '@tanstack/react-query'
import { api, type LogEvent, type RunStats } from './api'

export function useRunStats() {
  return useQuery({ queryKey: ['run-stats'], queryFn: api.runStats, staleTime: 10 * 60_000, retry: false })
}

/** "about 3 minutes", from measured runs; a range until there is a measurement. */
export function typicalRun(s: RunStats | undefined) {
  if (!s?.p50) return 'about 2 to 5 minutes'
  const m = Math.max(1, Math.round(s.p50 / 60))
  return `about ${m} ${m === 1 ? 'minute' : 'minutes'}`
}

/**
 * Seconds left in a run: the current step started at a known share of a typical run, so the run's
 * total is projected from when that step began. Early on (or with no measurement) it uses the typical total.
 */
export function secondsLeft(events: LogEvent[], elapsed: number, s: RunStats | undefined): number | null {
  if (!s?.p50) return null
  const steps = events.filter((e) => e.type === 'step' && e.t != null) as (LogEvent & { step?: string })[]
  const cur = steps.at(-1)
  const share = cur?.step ? s.steps[cur.step] : undefined
  const total = share && share >= 0.08 && cur!.t! > 3 ? cur!.t! / share : s.p50
  return Math.max(0, total - elapsed)
}

export function fmtLeft(sec: number) {
  if (sec < 20) return 'almost done'
  if (sec < 90) return `about ${Math.round(sec / 10) * 10} seconds left`
  return `about ${Math.round(sec / 60)} minutes left`
}
