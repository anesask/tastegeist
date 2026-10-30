import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowRight, Building2, Copy, FileText, Globe2, MapPin, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api, type CampaignSummary } from '../lib/api'
import { Mosaic } from '../components/Mosaic'
import { Wash } from '../components/Wash'
import { startTour } from '../components/Tour'
import { Button, EmptyState, LinkButton, Pill, Skeleton, STATUS_LABEL, useToast } from '../components/ui'
import { useTitle } from '../lib/title'

const SCOPE = {
  country: { label: 'Whole country', icon: <Globe2 size={14} /> },
  cities: { label: 'Several cities', icon: <MapPin size={14} /> },
  city: { label: 'One city in depth', icon: <Building2 size={14} /> },
}

/** "One Amsterdam. Two tastes, two campaigns." as a two-tone serif line. */
function Statement({ text, className = '', display = true }: { text: string; className?: string; display?: boolean }) {
  const [first, ...rest] = text.split('. ')
  // The serif only at display size; on cards the same line is set in Inter, the second half muted.
  return (
    <p className={`${display ? 'font-display leading-[1]' : 't-h2'} ${className}`}>
      {rest.length ? `${first}.` : first}{' '}
      {rest.length > 0 && (display ? <em className="text-mute">{rest.join('. ')}</em> : <span className="text-mute">{rest.join('. ')}</span>)}
    </p>
  )
}

function Meta({ c }: { c: CampaignSummary }) {
  const scope = SCOPE[c.scope] ?? SCOPE.cities
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1">
        {scope.icon}
        {scope.label}
      </span>
      <span>{c.markets.join(', ')}</span>
      {c.zones > 0 && <span>{c.zones} taste zones</span>}
    </div>
  )
}

/** Rename, duplicate and delete for your own campaigns; a demo can be copied as a template. */
function CardActions({ c }: { c: CampaignSummary }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle')
  const [title, setTitle] = useState(c.title)
  const done = () => qc.invalidateQueries({ queryKey: ['campaigns'] })
  const rename = useMutation({
    mutationFn: () => api.renameCampaign(c.id, title),
    onSuccess: () => (setMode('idle'), done(), toast('Renamed')),
  })
  const dup = useMutation({
    mutationFn: () => api.duplicateCampaign(c.id),
    onSuccess: (r) => (done(), nav(`/app/c/${r.id}/brief`)),
  })
  const del = useMutation({
    mutationFn: () => api.deleteCampaign(c.id),
    onSuccess: () => (done(), toast('Campaign deleted')),
  })

  if (mode === 'rename')
    return (
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          rename.mutate()
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Campaign name"
          className="h-8 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
        />
        <Button size="sm" variant="primary" type="submit" disabled={!title.trim() || rename.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setMode('idle')}>
          Cancel
        </Button>
      </form>
    )
  if (mode === 'delete')
    return (
      <div className="flex items-center gap-2 border-t border-line p-3 text-sm">
        <span className="min-w-0 flex-1 text-ink-2">Delete this campaign for good?</span>
        <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => del.mutate()}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    )
  return (
    <div className="flex gap-1 border-t border-line p-2">
      {c.demo ? (
        <Button size="sm" variant="ghost" disabled={dup.isPending} onClick={() => dup.mutate()}>
          <Copy size={14} /> Use as template
        </Button>
      ) : (
        <>
          <Button size="sm" variant="ghost" onClick={() => setMode('rename')}>
            <Pencil size={14} /> Rename
          </Button>
          <Button size="sm" variant="ghost" disabled={dup.isPending || c.status === 'running'} onClick={() => dup.mutate()}>
            <Copy size={14} /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={c.status === 'running'}
            onClick={() => setMode('delete')}
            aria-label={`Delete ${c.title}`}
          >
            <Trash2 size={14} />
          </Button>
        </>
      )}
    </div>
  )
}

function CampaignCard({ c }: { c: CampaignSummary }) {
  return (
    <div className="card card-interactive flex flex-col overflow-hidden">
      <Link to={`/app/c/${c.id}`} className="group flex flex-1 flex-col">
        <Mosaic images={c.thumbs} className="aspect-[16/9] w-full" />
        {/* The covers continue as a soft wash under the text. */}
        <div className="relative isolate flex flex-1 flex-col overflow-hidden p-5">
          <Wash images={c.thumbs.slice(-2)} />
          <div className="flex items-center justify-between gap-2 text-xs text-mute">
            <span className="truncate">
              {c.product_name} · {c.title}
            </span>
            <span className="flex shrink-0 gap-1.5">
              {c.status !== 'ready' && (
                <Pill tone={c.status} dot>
                  {STATUS_LABEL[c.status]}
                </Pill>
              )}
              {c.demo && <Pill tone="demo">Sample</Pill>}
            </span>
          </div>
          <Statement display={false} text={c.headline || c.title} className="mt-3" />
          <div className="mt-auto pt-5">
            <Meta c={c} />
          </div>
        </div>
      </Link>
      <CardActions c={c} />
    </div>
  )
}

/** The first thing a new visitor sees: one finished campaign, big, with a way straight in. */
function Featured({ c }: { c: CampaignSummary }) {
  const nav = useNavigate()
  return (
    <div className="card grid overflow-hidden lg:grid-cols-[1.25fr_1fr]">
      <Link to={`/app/c/${c.id}`} className="group relative block min-h-[260px]">
        <Mosaic images={c.thumbs} className="absolute inset-0 h-full w-full transition group-hover:brightness-105" />
      </Link>
      <div className="group relative isolate flex flex-col overflow-hidden p-6 md:p-8">
        <Wash images={c.thumbs.slice(-2)} />
        <div className="kicker">Sample · {c.product_name}</div>
        <Statement text={c.headline || c.title} className="mt-4 text-title" />
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          {c.title}: taste zones from Qloo, three concepts per zone with every line cited, a synthetic audience test and a media plan you can export.
        </p>
        {c.id === 'eu' && (
          <p className="mt-3 text-sm text-ink">
            What the tour proves: two Amsterdam neighborhoods ten minutes apart love different things, so one ad can't serve both, and every line of the
            concepts traces back to the Qloo data.
          </p>
        )}
        <div className="mt-4">
          <Meta c={c} />
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          {c.id === 'eu' ? (
            <Button variant="primary" onClick={() => startTour(nav)}>
              <Play size={16} /> Take the 1-minute tour
            </Button>
          ) : (
            <LinkButton to={`/app/c/${c.id}`} variant="primary">
              Open the campaign <ArrowRight size={16} />
            </LinkButton>
          )}
          <LinkButton to={`/report/${c.id}`}>
            <FileText size={16} /> Client report
          </LinkButton>
        </div>
      </div>
    </div>
  )
}

export function Campaigns() {
  useTitle('Campaigns')
  const q = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns })
  const mine = q.data?.filter((c) => !c.demo) ?? []
  const demos = q.data?.filter((c) => c.demo) ?? []
  // Lead with the Amsterdam demo: it carries the clearest "one city, two campaigns" story.
  const featured = demos.find((c) => c.id === 'eu') ?? demos[0]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="kicker">Campaigns</div>
          <h1 className="mt-2 font-display text-statement leading-[1]">
            Every neighborhood has a geist. <em className="text-mute">Find yours.</em>
          </h1>
        </div>
        <LinkButton to="/app/new" variant="primary" size="lg">
          <Plus size={18} /> New campaign
        </LinkButton>
      </div>

      {q.isLoading && (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      )}
      {q.isError && (
        <div className="mt-10">
          <EmptyState
            title="Couldn't load campaigns"
            body="The server didn't answer."
            action={
              <button className="text-sm text-link" onClick={() => q.refetch()}>
                Try again
              </button>
            }
          />
        </div>
      )}

      {q.data && (
        <>
          {/* Yours first, always: real campaigns you made, saved in this browser. */}
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-ink-2">Your campaigns</h2>
            {mine.length > 0 ? (
              <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {mine.map((c) => (
                  <CampaignCard key={c.id} c={c} />
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-line p-6">
                <div>
                  <div className="font-medium">Nothing here yet.</div>
                  <p className="mt-1 text-sm text-ink-2">Describe a product and pick where to sell it: your first campaign takes about two minutes.</p>
                </div>
                <Link to="/app/new" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-bg">
                  Start your own <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </section>

          <div className="mt-14 border-t border-line pt-10">
            <h2 className="text-sm font-semibold text-ink-2">Sample campaigns</h2>
            <p className="mt-1 text-sm text-mute">Finished examples to explore, read-only. Use one as a template to make it yours.</p>
          </div>

          {!mine.length && featured && (
            <section className="mt-5">
              <Featured c={featured} />
            </section>
          )}

          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {!mine.length && <h3 className="text-sm font-semibold text-ink-2">More samples</h3>}
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {demos
                .filter((c) => mine.length || c !== featured)
                .map((c) => (
                  <CampaignCard key={c.id} c={c} />
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
