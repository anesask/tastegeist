import { useQuery } from '@tanstack/react-query'
import { ArrowRight, History, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, fmtDate, type RunVersion } from '../lib/api'
import { Button, Chip } from './ui'

const money = (v: number) => Math.round(v).toLocaleString('en-GB')

function Delta({ was, now }: { was: string | number | null | undefined; now: string | number | null | undefined }) {
  if (was === now || was == null) return <span>{now ?? '-'}</span>
  return (
    <span>
      <span className="text-mute line-through decoration-mute/50">{was}</span> <ArrowRight size={11} className="inline text-mute" aria-hidden />{' '}
      <b>{now ?? '-'}</b>
    </span>
  )
}

/** Earlier runs of a campaign, compared with the current one: geists, headlines, séance and budget per zone. */
function Compare({ versions, onClose }: { versions: RunVersion[]; onClose: () => void }) {
  const current = versions[versions.length - 1]
  const earlier = versions.slice(0, -1)
  const [n, setN] = useState(earlier[earlier.length - 1]?.n)
  const was = earlier.find((v) => v.n === n) ?? earlier[0]
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const keys = [...new Set([...current.groups.map((g) => g.key), ...was.groups.map((g) => g.key)])]

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="rise h-full w-full max-w-2xl overflow-y-auto bg-bg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Compare runs">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="kicker">Versions</div>
            <h2 className="t-h1 mt-1">Compare runs</h2>
            <p className="mt-1 text-sm text-ink-2">Each generation is kept. Pick an earlier run to see what changed in the current one.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-surface-2"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {earlier.map((v) => (
            <Chip key={v.n} selected={v.n === was.n} onClick={() => setN(v.n)}>
              Run {v.n} · {fmtDate(v.created * 1000)}
            </Chip>
          ))}
          <span className="self-center text-sm text-mute">against run {current.n} (current)</span>
        </div>
        {was.headline !== current.headline && (
          <p className="mt-5 text-sm">
            <Delta was={was.headline} now={current.headline} />
          </p>
        )}
        <ul className="mt-5 space-y-4">
          {keys.map((k) => {
            const a = was.groups.find((g) => g.key === k)
            const b = current.groups.find((g) => g.key === k)
            const added = b?.ledger.filter((x) => !a?.ledger.includes(x)) ?? []
            const dropped = a?.ledger.filter((x) => !b?.ledger.includes(x)) ?? []
            return (
              <li key={k} className="card p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    <Delta was={a?.name} now={b?.name ?? 'Not in this run'} />
                  </span>
                  <span className="text-xs text-mute">{(b ?? a)?.label}</span>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
                  <dt className="text-xs text-mute">Chosen headline</dt>
                  <dd>
                    <Delta was={a?.headline} now={b?.headline} />
                  </dd>
                  <dt className="text-xs text-mute">Séance</dt>
                  <dd className="tabular">
                    <Delta was={a?.stops != null ? `${a.stops} of ${a.size}` : null} now={b?.stops != null ? `${b.stops} of ${b.size}` : null} />
                    {b?.base_stops != null && <span className="text-mute"> (generic {b.base_stops})</span>}
                  </dd>
                  <dt className="text-xs text-mute">Budget</dt>
                  <dd className="tabular">
                    <Delta was={was.budget[k] != null ? money(was.budget[k]) : null} now={current.budget[k] != null ? money(current.budget[k]) : null} />
                  </dd>
                  {(added.length > 0 || dropped.length > 0) && (
                    <>
                      <dt className="text-xs text-mute">Top titles</dt>
                      <dd className="text-xs">
                        {added.length > 0 && <span className="text-ink">New: {added.join(', ')}. </span>}
                        {dropped.length > 0 && <span className="text-mute">Gone: {dropped.join(', ')}.</span>}
                      </dd>
                    </>
                  )}
                </dl>
              </li>
            )
          })}
        </ul>
      </aside>
    </div>
  )
}

/** The header button: only shown once a campaign has been generated more than once. */
export function RunVersions({ campaignId, updated }: { campaignId: string; updated: number }) {
  const q = useQuery({ queryKey: ['versions', campaignId, updated], queryFn: () => api.versions(campaignId), retry: false })
  const [open, setOpen] = useState(false)
  if (!q.data || q.data.length < 2) return null
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <History size={16} />{' '}
        <span className="hidden sm:inline">
          Run {q.data.length} of {q.data.length}
        </span>
      </Button>
      {open && <Compare versions={q.data} onClose={() => setOpen(false)} />}
    </>
  )
}
