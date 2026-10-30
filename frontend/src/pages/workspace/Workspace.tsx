import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, Download, FileText, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router'
import { api, fmtDate, followRun, type CampaignDetail, type LogEvent, type RunResult } from '../../lib/api'
import { Button, Pill, Skeleton, STATUS_LABEL, useToast, buttonClass } from '../../components/ui'
import { RunProgress } from '../../components/RunProgress'
import { LiveResults } from '../../components/LiveResults'
import { RunVersions } from '../../components/RunCompare'
import { NextStep, TabIntro } from '../../components/Journey'
import { NotFound } from '../NotFound'
import { useTitle } from '../../lib/title'
import { askToNotify, notifyDone } from '../../lib/notify'

const TABS = [
  { to: 'brief', n: '01', label: 'Brief' },
  { to: 'zones', n: '02', label: 'Taste Zones' },
  { to: 'culture', n: '03', label: 'Culture' },
  { to: 'creatives', n: '04', label: 'Creatives' },
  { to: 'plan', n: '05', label: 'Media Plan' },
  { to: 'results', n: '06', label: 'Results' },
  { to: 'trace', n: '07', label: 'How it was made' },
]

export type WorkspaceCtx = { campaign: CampaignDetail; result: RunResult }
export const useWorkspace = () => useOutletContext<WorkspaceCtx>()

/** Splits "One Amsterdam. Two tastes, two campaigns." into a two-tone headline. */
function Headline({ text }: { text: string }) {
  const [first, ...rest] = text.split('. ')
  return (
    <h1 className="font-display text-statement leading-[0.98]">
      {rest.length ? `${first}.` : first}
      {rest.length > 0 && <em className="block text-mute">{rest.join('. ')}</em>}
    </h1>
  )
}

/** On every sample campaign: what this is, and the one next step (make it yours). */
function SampleBar({ id }: { id: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <span className="text-ink-2">
        <b className="text-ink">Sample campaign</b> · a finished example, read-only. Your own campaigns live under Campaigns.
      </span>
      <span className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await api.duplicateCampaign(id)
              nav(`/app/c/${r.id}`)
            } catch {
              toast('Could not copy the sample')
            } finally {
              setBusy(false)
            }
          }}
        >
          <Copy size={14} /> Use this brief
        </Button>
        <Link to="/app/new" className={buttonClass('primary', 'sm')}>
          Start your own
        </Link>
      </span>
    </div>
  )
}

export function Workspace() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.campaign(id),
    retry: false,
  })
  useTitle(q.data ? q.data.headline || q.data.title : undefined)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const status = q.data?.status
  const generating = q.data?.running || status === 'running'

  // Follow a run in progress (also after a reload), then refresh the campaign.
  useEffect(() => {
    if (!generating) return
    let alive = true
    followRun(id, (e) => alive && setEvents((l) => [...l, e]))
      .then(() => notifyDone('Your campaign is ready', q.data?.title ?? 'Tastegeist'))
      .catch((e) => alive && setFailed(String(e.message ?? e)))
      .finally(() => alive && qc.invalidateQueries({ queryKey: ['campaign', id] }))
    return () => {
      alive = false
    }
  }, [generating, id, qc])

  async function generate() {
    askToNotify()
    setEvents([])
    setFailed(null)
    try {
      await api.run(id)
      await qc.invalidateQueries({ queryKey: ['campaign', id] })
    } catch (e) {
      setFailed(String((e as Error).message))
    }
  }

  if (q.isError) return <NotFound inline />
  if (q.isLoading || !q.data)
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    )

  const c = q.data

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-8">
      {c.demo && <SampleBar id={c.id} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <nav className="flex items-center gap-1 text-sm text-mute" aria-label="Breadcrumb">
            <Link to="/app" className="hover:text-ink">
              Campaigns
            </Link>
            <ChevronRight size={14} aria-hidden />
            <span className="truncate text-ink-2">{c.title}</span>
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Headline text={c.headline || c.title} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone={generating ? 'running' : status} dot>
              {generating ? 'Generating' : STATUS_LABEL[status ?? 'draft']}
            </Pill>
            {c.demo && <Pill tone="demo">Sample</Pill>}
            <span className="text-sm text-mute">{c.markets.join(' · ')}</span>
            {c.result && <span className="text-sm text-mute">· Qloo data as of {fmtDate((c.result.trace?.finished ?? c.updated) * 1000)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              // A finished campaign shares as its read-only report, which opens for anyone with the link.
              navigator.clipboard?.writeText(c.result ? `${window.location.origin}/report/${c.id}` : window.location.href)
              toast(c.result ? 'Report link copied. Anyone with the link can view it.' : 'Link copied')
            }}
          >
            <Share2 size={16} /> Share
          </Button>
          {c.result && !c.demo && <RunVersions campaignId={c.id} updated={c.updated} />}
          {c.result && (
            <>
              <Link to="plan#export" className={buttonClass('secondary', 'md', 'hidden sm:inline-flex')}>
                <Download size={16} /> Export
              </Link>
              <Link to={`/report/${c.id}`} className={buttonClass('primary', 'md')}>
                <FileText size={16} /> Client report
              </Link>
            </>
          )}
        </div>
      </div>

      {generating || (!c.result && failed) ? (
        <div className="mt-8">
          <RunProgress events={events} failed={failed} onRetry={generate} />
          {!failed && <LiveResults events={events} />}
        </div>
      ) : !c.result ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-16 text-center">
          <h2 className="font-display text-title">Ready to map {c.markets.join(', ')}.</h2>
          <p className="mt-2 max-w-md text-sm text-mute">
            Qloo reads what each place over-indexes on. Tastegeist groups places that share a taste, writes three concepts for each and tests them on synthetic
            locals. Takes a few minutes.
          </p>
          <Button variant="primary" size="lg" className="mt-6" onClick={generate}>
            Generate campaign
          </Button>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-4 mt-6 overflow-x-auto border-b border-line bg-bg/90 px-4 backdrop-blur md:-mx-8 md:px-8">
            <nav className="flex min-w-max gap-6" aria-label="Campaign sections">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition ${
                      isActive ? 'border-brand text-brand-ink' : 'border-transparent text-mute hover:text-ink'
                    }`
                  }
                >
                  <span className="tabular text-xs opacity-70">{t.n}</span>
                  {t.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="mt-6">
            <TabIntro />
            <Outlet context={{ campaign: c, result: c.result } satisfies WorkspaceCtx} />
            <NextStep reportId={c.id} />
          </div>
        </>
      )}
    </div>
  )
}
