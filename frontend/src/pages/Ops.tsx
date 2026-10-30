import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTitle } from '../lib/title'
import { Button, Card, Skeleton } from '../components/ui'

interface OpsSummary {
  cap: number
  spent_today: number
  alert_at: number
  spend: { day: string; usd: number }[]
  views: { day: string; path: string; n: number }[]
  errors: { at: number; source: string; message: string; path: string; stack: string }[]
  campaigns: { id: string; title: string; usd: number; qloo_calls: number; llm_calls: number; finished: number | null }[]
  providers: { name: string; unit: string; value: number; note: string }[]
  alerts: { day: string; kind: string }[]
}

const KEY = 'tg-admin-token'
const usd = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`

function readToken() {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The operator's view: spend against the cap, cost per campaign, page counts and errors. Behind ADMIN_TOKEN. */
export function Ops() {
  useTitle('Operations')
  const [token, setToken] = useState(readToken)
  const [draft, setDraft] = useState('')
  const q = useQuery({
    queryKey: ['ops', token],
    enabled: !!token,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await fetch('/api/ops/summary', { headers: { 'x-admin-token': token } })
      if (!r.ok) throw new Error(r.status === 404 ? 'Wrong token, or ADMIN_TOKEN is not set on the server' : r.statusText)
      return (await r.json()) as OpsSummary
    },
  })
  const save = (t: string) => {
    try {
      sessionStorage.setItem(KEY, t)
    } catch {
      // kept for this page only
    }
    setToken(t)
  }

  if (!token || q.isError)
    return (
      <div className="mx-auto max-w-md px-6 py-24">
        <h1 className="font-display text-title">Operations</h1>
        <p className="mt-2 text-sm text-ink-2">For the operator of this Tastegeist server. Enter the ADMIN_TOKEN from the server's environment.</p>
        {q.isError && <p className="mt-3 text-sm text-coral">{(q.error as Error).message}</p>}
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save(draft.trim())
          }}
        >
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Admin token"
            autoComplete="off"
            className="h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            <KeyRound size={16} /> Open
          </Button>
        </form>
        <Link to="/" className="text-link mt-8 inline-block text-sm">
          Back to Tastegeist
        </Link>
      </div>
    )
  if (!q.data)
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-12">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )

  const d = q.data
  const share = d.cap ? d.spent_today / d.cap : 0
  const maxDay = Math.max(...d.spend.map((s) => s.usd), d.alert_at, 0.01)
  const byPath = new Map<string, number>()
  const byDay = new Map<string, number>()
  for (const v of d.views) {
    byPath.set(v.path, (byPath.get(v.path) ?? 0) + v.n)
    byDay.set(v.day, (byDay.get(v.day) ?? 0) + v.n)
  }
  const paths = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  const totalViews = [...byPath.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-title leading-[1]">Operations</h1>
          <p className="mt-2 text-sm text-ink-2">Last 30 days. Refreshes every minute. No personal data: page counts carry no ids, errors no request data.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => save('')}>
          <LogOut size={14} /> Lock
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="t-metric-lg">{usd(d.spent_today)}</div>
          <div className="t-caption mt-1">model spend today, of the {usd(d.cap)} cap</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full rounded-full ${share >= 0.8 ? 'bg-coral' : 'bg-ink'}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
          </div>
          <div className="t-caption mt-1">Alert at {usd(d.alert_at)} (80%)</div>
        </Card>
        {d.providers.map((p) => (
          <Card key={p.name} className="p-5">
            <div className="t-metric-lg">{p.unit === 'USD' ? usd(p.value) : p.value.toLocaleString('en-GB')}</div>
            <div className="t-caption mt-1">
              {p.name}: {p.note}
            </div>
          </Card>
        ))}
        <Card className="p-5">
          <div className="t-metric-lg">{totalViews.toLocaleString('en-GB')}</div>
          <div className="t-caption mt-1">page views, {d.errors.length} recent errors</div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="t-h3">Model spend per day</h2>
        <div className="mt-4 flex h-40 items-end gap-1" role="img" aria-label="Model spend per day for the last 30 days">
          {d.spend.map((s) => (
            <div key={s.day} className="group relative flex-1">
              <div
                className={`rounded-t ${s.usd >= d.alert_at ? 'bg-coral' : 'bg-ink-2'}`}
                style={{ height: `${(s.usd / maxDay) * 150}px` }}
                title={`${s.day}: ${usd(s.usd)}`}
              />
            </div>
          ))}
          {!d.spend.length && <p className="text-sm text-mute">No spend recorded yet.</p>}
        </div>
        <div className="sr-only">
          <table>
            <tbody>
              {d.spend.map((s) => (
                <tr key={s.day}>
                  <td>{s.day}</td>
                  <td>{usd(s.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.alerts.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm text-coral">
            <AlertTriangle size={14} /> Alerts: {d.alerts.map((a) => `${a.day} ${a.kind === 'spend100' ? 'cap reached' : '80% of cap'}`).join(', ')}
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="t-h3">Cost per campaign</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-mute">
              <tr>
                <th className="py-1 font-normal">Campaign</th>
                <th className="py-1 text-right font-normal">Model</th>
                <th className="py-1 text-right font-normal">Qloo calls</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {d.campaigns.slice(0, 15).map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="max-w-[240px] truncate py-1.5 pr-2">{c.title || c.id}</td>
                  <td className="py-1.5 text-right">{usd(c.usd || 0)}</td>
                  <td className="py-1.5 text-right">{c.qloo_calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="t-caption mt-2">From each run's trace; a re-run served from cache costs $0.</p>
        </Card>
        <Card className="p-5">
          <h2 className="t-h3">Pages</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {paths.map(([p, n]) => (
              <li key={p} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="relative min-w-0">
                  <span className="absolute inset-y-0 left-0 rounded bg-surface-2" style={{ width: `${(n / paths[0][1]) * 100}%` }} />
                  <span className="relative block truncate px-2 py-0.5">{p}</span>
                </span>
                <span className="tabular text-ink-2">{n}</span>
              </li>
            ))}
            {!paths.length && <li className="text-mute">No views yet.</li>}
          </ul>
          <p className="t-caption mt-2">Cookieless: one counter per page and day; ids in paths are collapsed. Do Not Track is respected.</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="t-h3">Recent errors</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {d.errors.map((e, i) => (
            <li key={i} className="py-2">
              <details>
                <summary className="cursor-pointer">
                  <span className="tabular text-xs text-mute">{new Date(e.at * 1000).toLocaleString('en-GB')}</span>{' '}
                  <span className="text-xs uppercase text-mute">{e.source}</span> {e.message} <span className="text-mute">{e.path}</span>
                </summary>
                {e.stack && <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-2 p-3 text-xs">{e.stack}</pre>}
              </details>
            </li>
          ))}
          {!d.errors.length && <li className="py-2 text-mute">No errors recorded.</li>}
        </ul>
      </Card>
    </div>
  )
}
