import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { api, rgb, type CampaignDetail } from '../lib/api'
import { chosenConcept, colorOf, personaName, placeName } from '../lib/geists'
import { Mosaic } from '../components/Mosaic'
import { Wash } from '../components/Wash'
import { Poster } from '../components/Poster'
import { Card, EmptyState, LinkButton, Skeleton } from '../components/ui'
import { useTitle } from '../lib/title'

type Kind = 'audiences' | 'zones' | 'creatives' | 'plans' | 'insights'

const COPY: Record<Kind, { title: string; sub: string }> = {
  audiences: {
    title: 'Audiences',
    sub: 'Every geist across your campaigns: who they are and what they love.',
  },
  zones: {
    title: 'Taste Zones',
    sub: 'Every audience Tastegeist found, by zone and neighborhood: who they are and what they love.',
  },
  creatives: {
    title: 'Creatives',
    sub: 'Every concept, as the ad it would be. Chosen concepts are marked.',
  },
  plans: {
    title: 'Media Plans',
    sub: 'Budgets and flights for every generated campaign.',
  },
  insights: {
    title: 'Insights',
    sub: 'What each campaign learned, and how the tailored concepts compare to a generic one.',
  },
}

export function Library({ kind }: { kind: Kind }) {
  useTitle(COPY[kind].title)
  const list = useQuery({ queryKey: ['campaigns'], queryFn: api.campaigns })
  const ready = (list.data ?? []).filter((c) => c.status === 'ready')
  const details = useQueries({
    queries: ready.map((c) => ({
      queryKey: ['campaign', c.id],
      queryFn: () => api.campaign(c.id),
    })),
  })
  const campaigns = details.map((d) => d.data).filter((c): c is CampaignDetail => !!c?.result)
  const loading = list.isLoading || details.some((d) => d.isLoading)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="kicker">Library</div>
      <h1 className="mt-2 font-display text-statement leading-[1]">{COPY[kind].title}</h1>
      <p className="mt-2 max-w-2xl text-mute">{COPY[kind].sub}</p>

      <div className="mt-10">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : !campaigns.length ? (
          <EmptyState
            title="Nothing here yet"
            body="Generate a campaign and its geists, creatives and plans appear here."
            action={
              <LinkButton to="/app/new" variant="primary">
                <Plus size={16} /> New campaign
              </LinkButton>
            }
          />
        ) : (
          <div className="space-y-12">
            {campaigns.map((c) => (
              <section key={c.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {c.title} <span className="font-normal text-mute">· {c.product_name}</span>
                  </h2>
                  <Link
                    to={`/app/c/${c.id}/${kind === 'creatives' ? 'creatives' : kind === 'plans' ? 'plan' : kind === 'insights' ? 'results' : 'zones'}`}
                    className="inline-flex items-center gap-1 text-sm text-link"
                  >
                    Open campaign <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="mt-4">
                  <Section kind={kind} c={c} />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ kind, c }: { kind: Kind; c: CampaignDetail }) {
  const r = c.result!
  if (kind === 'audiences' || kind === 'zones')
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {r.groups.map((g) => (
          <Link
            key={g.key}
            to={`/app/c/${c.id}/zones?g=${encodeURIComponent(g.key)}`}
            className="card card-interactive group relative isolate overflow-hidden p-4"
          >
            <Wash
              images={g.ledger
                .filter((e) => e.image)
                .slice(1, 3)
                .map((e) => e.image)}
            />
            <Mosaic images={g.ledger.filter((e) => e.image && e.domain !== 'brand').map((e) => e.image!)} className="aspect-[4/3] w-full rounded-xl" />
            <div className="mt-3 flex items-center gap-2 text-xs text-mute">
              <span className="h-2 w-2 rounded-full" style={{ background: rgb(colorOf(r, g.key)) }} />
              {placeName(g)}
            </div>
            <div className="t-h2 mt-1">{personaName(g)}</div>
            <p className="mt-1 line-clamp-2 text-sm text-mute">{g.persona?.tagline || g.geist}</p>
          </Link>
        ))}
      </div>
    )
  if (kind === 'creatives')
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {r.groups.flatMap((g) =>
          (g.concepts ?? []).map((x, i) => (
            <Link key={`${g.key}-${x.id}`} to={`/app/c/${c.id}/creatives?g=${encodeURIComponent(g.key)}&c=${x.id}`} className="group">
              <Poster g={g} c={x} color={colorOf(r, g.key)} productName={c.product_name} size="thumb" className="transition group-hover:brightness-110" />
              <div className="mt-2 text-xs text-mute">
                {placeName(g)} · {x.direction}
                {i === (g.chosen ?? 0) && <span className="ml-2 font-medium text-mint">Chosen</span>}
              </div>
            </Link>
          )),
        )}
      </div>
    )
  if (kind === 'plans')
    return (
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-mute">
            <tr className="border-b border-line">
              <th className="px-5 py-3 font-medium">Zone</th>
              <th className="px-5 py-3 font-medium">Markets</th>
              <th className="px-5 py-3 font-medium">Budget</th>
              <th className="px-5 py-3 font-medium">Creative</th>
            </tr>
          </thead>
          <tbody>
            {r.plan.zones.map((z) => (
              <tr key={z.key} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-medium">{z.name}</td>
                <td className="px-5 py-3 text-ink-2">{z.markets.join(', ')}</td>
                <td className="px-5 py-3 tabular">
                  {r.plan.currency} {z.budget.toLocaleString()}
                </td>
                <td className="px-5 py-3">{z.creative?.headline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    )
  // insights
  const paired = r.groups.filter((g) => chosenConcept(g)?.panel && g.baseline_panel)
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {paired.map((g) => (
        <Card key={g.key} className="p-5">
          <div className="text-xs text-mute">{placeName(g)}</div>
          <div className="mt-1 font-semibold">{personaName(g)}</div>
          <div className="mt-4 text-3xl font-bold">
            {chosenConcept(g)!.panel!.stop_scrolling}
            <span className="text-lg text-mute"> vs {g.baseline_panel!.stop_scrolling}</span>
          </div>
          <div className="text-xs text-mute">would stop: tailored vs generic, of {g.baseline_panel!.size}</div>
        </Card>
      ))}
    </div>
  )
}
