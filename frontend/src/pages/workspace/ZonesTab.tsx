import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Disc3, Film, Mic, Music, ShoppingBag, Tv, BookOpen, ArrowRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Term } from '../../components/Term'
import { fetchHeatmap, rgb, type Domain, type HeatCell } from '../../lib/api'
import { chosenConcept, colorOf, mapGeists, personaName, placeName } from '../../lib/geists'
import { MapView } from '../../components/MapView'
import { Poster } from '../../components/Poster'
import { LiftBars, SimilarityMatrix } from '../../components/Charts'
import { Button, LinkButton, Source } from '../../components/ui'
import { Dossier } from '../../components/Dossier'
import { CultureMap } from '../../components/CultureMap'
import { useWorkspace } from './Workspace'
import { wilson } from '../../lib/stats'

export const DOMAIN_ICON: Record<Domain, ReactNode> = {
  artist: <Music size={15} />,
  tv_show: <Tv size={15} />,
  movie: <Film size={15} />,
  podcast: <Mic size={15} />,
  brand: <ShoppingBag size={15} />,
}

export function ZonesTab() {
  const { campaign, result } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const geists = useMemo(() => mapGeists(result), [result])
  // Open on the strongest story: a neighborhood split if there is one ("two campaigns"), else the
  // zone where tailoring beats the generic concept by the most.
  const gain = (x: (typeof result.groups)[number]) => (chosenConcept(x)?.panel?.stop_scrolling ?? 0) - (x.baseline_panel?.stop_scrolling ?? 0)
  const fallback = result.groups.find((g) => g.kind === 'neighborhood')?.key ?? [...result.groups].sort((a, b) => gain(b) - gain(a))[0]?.key
  const selectedKey = params.get('g') ?? fallback
  const idx = Math.max(
    0,
    result.groups.findIndex((g) => g.key === selectedKey),
  )
  const g = result.groups[idx]
  const color = colorOf(result, g.key)
  const dossier = params.get('dossier') === '1'

  const select = (key: string) => setParams({ g: key }, { replace: true })
  const step = (d: number) => select(result.groups[(idx + d + result.groups.length) % result.groups.length].key)

  // The selected geist's own Qloo heatmap, live (cached server-side). A zone spanning several
  // cities of a country campaign shows the national heatmap instead.
  // A title picked elsewhere (the culture drill-down) narrows the heatmap to that one title.
  const focus = params.get('e')
  const focusName = params.get('n') ?? g.ledger.find((e) => e.id === focus)?.name ?? 'one title'
  const national = !focus && !!result.country_heat?.length && g.kind === 'zone' && g.markets.length > 1
  const heatCity = g.kind === 'neighborhood' ? (g.parent ?? g.markets[0]) : g.markets[0]
  const ids = focus ? [focus] : g.ledger.slice(0, 3).map((e) => e.id)
  const heatQ = useQuery({
    queryKey: ['heat', heatCity, ids.join()],
    queryFn: () => fetchHeatmap(heatCity, ids),
    enabled: !national,
    staleTime: Infinity,
    retry: false,
  })
  const heat = national ? ((result.country_heat ?? []) as HeatCell[]) : (heatQ.data ?? [])

  // On desktop the title card covers the map's left edge; the camera frames the places beside it.
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  const concept = chosenConcept(g)
  const maxLift = Math.max(...g.ledger.map((e) => e.lift))
  const split = result.splits.find((s) => s.neighborhoods.some((n) => n.key === g.key))

  const titleCard = (dark: boolean) => (
    <>
      <div className="flex items-center justify-between gap-3">
        <span
          className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: rgb(color) }}
          title={placeName(g)}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: rgb(color) }} />
          <span className="truncate">{placeName(g)}</span>
        </span>
        <div className={`flex shrink-0 items-center gap-1.5 text-xs ${dark ? 'text-white/60' : 'text-mute'}`}>
          <span className="tabular whitespace-nowrap">
            {idx + 1} / {result.groups.length}
          </span>
          {[-1, 1].map((d) => (
            <button
              key={d}
              onClick={() => step(d)}
              className={`grid h-7 w-7 place-items-center rounded-lg border transition ${dark ? 'border-white/15 hover:bg-white/10' : 'border-line hover:bg-surface-2'}`}
              aria-label={d < 0 ? 'Previous zone' : 'Next zone'}
            >
              {d < 0 ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          ))}
        </div>
      </div>
      <h2 className="mt-3 font-display text-title leading-[0.98]">{personaName(g)}</h2>
      <p className={`mt-3 text-sm leading-relaxed ${dark ? 'text-white/70' : 'text-ink-2'}`}>{g.persona?.tagline || g.geist}</p>
      {g.ledger.length < 5 && (
        <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs text-ink">
          Thin data: Qloo found only {g.ledger.length} distinctive {g.ledger.length === 1 ? 'title' : 'titles'} here. Treat this audience as a lead, not a
          finding.
        </p>
      )}
      <dl className={`mt-4 grid grid-cols-3 gap-3 border-t pt-4 ${dark ? 'border-white/10' : 'border-line'}`}>
        {(
          [
            [
              `${maxLift.toFixed(1)}×`,
              <>
                Strongest <Term k="lift" />
              </>,
            ],
            [
              g.ledger.length,
              <>
                <Term k="ledger">Ledger</Term> entities
              </>,
            ],
            [concept?.panel ? `${concept.panel.stop_scrolling}/${concept.panel.size}` : '-', 'Would stop'],
          ] as const
        ).map(([v, l], i) => (
          <div key={i} className="flex flex-col-reverse">
            <dt className={`text-xs ${dark ? 'text-white/55' : 'text-mute'}`}>{l}</dt>
            <dd className="t-metric" style={i === 0 ? { color: rgb(color) } : undefined}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className={`mt-4 flex items-center gap-2 text-xs ${dark ? 'text-white/55' : 'text-mute'}`}>
        <span className="flex shrink-0 items-center gap-1.5">
          <span>low</span>
          <span
            className="h-1.5 w-12 rounded-full"
            style={{
              background: `linear-gradient(to right, ${rgb(color, 0.15)}, ${rgb(color)})`,
            }}
          />
          <span>high lift</span>
        </span>
        {national
          ? 'Qloo national heatmap'
          : heatQ.isFetching
            ? 'Asking Qloo for the heatmap…'
            : heat.length
              ? focus
                ? `Qloo heatmap of ${heatCity} for ${focusName} only`
                : `Qloo heatmap of ${heatCity}: where this taste over-indexes`
              : 'Heatmap unavailable right now'}
      </div>
      {focus && (
        <button type="button" onClick={() => select(g.key)} className={`text-link mt-2 text-xs ${dark ? 'text-white' : ''}`}>
          Show the whole taste again
        </button>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      {split && (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h2 className="font-display text-statement leading-[1]">
            {split.neighborhoods.length === 2 ? 'Two neighborhoods.' : `${split.neighborhoods.length} neighborhoods.`}{' '}
            <em className="text-mute">Completely different tastes.</em>
          </h2>
        </div>
      )}

      {/* The stage: the map, with the selected geist as a title card */}
      <div data-shot="stage" className="relative h-[70vh] min-h-[460px] overflow-hidden rounded-2xl ring-1 ring-line md:h-[72vh] md:max-h-[780px]">
        <MapView
          insetLeft={wide ? 380 : 0}
          geists={geists}
          selected={g.key}
          heat={heat}
          heatColor={national ? [212, 164, 58] : color}
          heatScale={national ? 30 : 1}
          onSelect={select}
        />
        <div className="pointer-events-none absolute left-4 top-4 z-10 hidden w-[360px] md:block">
          <div className="pointer-events-auto rounded-2xl bg-[#0b0a09]/80 p-5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
            {titleCard(true)}
          </div>
        </div>
        <div className="no-scrollbar chip-fade pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex gap-1.5 overflow-x-auto pr-8">
          {result.groups.map((x) => (
            <button
              key={x.key}
              onClick={() => select(x.key)}
              className={`pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-md transition ${
                x.key === g.key ? 'bg-[#f3efe7] text-[#0b0a09]' : 'bg-[#0b0a09]/70 text-white/80 ring-1 ring-white/10 hover:text-white'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, x.key)) }} />
              {placeName(x)}
              <span className={x.key === g.key ? 'text-[#0b0a09]/55' : 'text-white/45'}>· {personaName(x)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card p-5 md:hidden">{titleCard(false)}</div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="t-h3">What sets {placeName(g)} apart</h3>
            <Source>Lift vs the brief's other markets, Qloo</Source>
          </div>
          <div className="mt-3">
            <LiftBars g={g} color={color} result={result} />
          </div>
          {g.places && g.places.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="t-h3">Where they go out</div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {g.places.map((p) => (
                  <figure key={p.id}>
                    <img src={p.image!} alt={p.name} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                    <figcaption className="mt-1 truncate text-xs text-ink-2" title={p.name}>
                      {p.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {concept?.panel && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="t-h3">How {concept.panel.size} synthetic locals react</h3>
                <Link to={`../creatives?g=${encodeURIComponent(g.key)}&c=${concept.id}#seance`} className="text-sm text-link">
                  View details
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <div className="t-metric-xl">
                    {concept.panel.stop_scrolling}
                    <span className="text-2xl text-mute"> of {concept.panel.size}</span>
                  </div>
                  <div className="mt-1 text-xs text-mute">
                    would stop scrolling · 95% interval {wilson(concept.panel.stop_scrolling, concept.panel.size).loN} to{' '}
                    {wilson(concept.panel.stop_scrolling, concept.panel.size).hiN}
                  </div>
                </div>
                {g.baseline_panel && (
                  <div className="pb-1 text-sm text-ink-2">
                    vs{' '}
                    <b className="tabular">
                      {g.baseline_panel.stop_scrolling} of {g.baseline_panel.size}
                    </b>
                    <div className="text-xs text-mute">for the generic LLM-only concept</div>
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {(
                  [
                    ['Attention', concept.panel.avg.attention],
                    ['Resonance', concept.panel.avg.resonance],
                    ['Intent', concept.panel.avg.interest],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-mute">{label}</span>
                      <span className="tabular font-semibold">{v.toFixed(1)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(v / 5) * 100}%`,
                          background: rgb(color),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {g.baseline_panel && g.baseline_panel.stop_scrolling >= concept.panel.stop_scrolling && (
                <p className="mt-4 rounded-xl bg-amber-soft p-3 text-sm text-ink">
                  <b>Here a broad message holds up.</b> The generic concept does as well with these personas, so this zone can run a cheaper, wider creative and
                  move the tailoring budget to zones where taste changes the answer (Media Plan).
                </p>
              )}
              <div className="mt-3">
                <Source>The séance: personas built from Qloo data for this place, voiced by AI. Directional, not a survey.</Source>
              </div>
            </div>
          )}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <div className="t-h3">Get to know {personaName(g)}</div>
              <div className="text-sm text-mute">What they listen to, watch, wear and read; how they sound and look.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton to={`../culture?g=${encodeURIComponent(g.key)}`} variant="primary">
                <Disc3 size={16} /> Culture profile
              </LinkButton>
              <Button onClick={() => setParams({ g: g.key, dossier: '1' })}>
                <BookOpen size={16} /> Dossier
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* The evidence for the grouping */}
      {result.markets.length > 2 && result.overlap && (
        <div className="card grid gap-6 p-5 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h3 className="t-h3">Why these zones</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Each place gets a culture map from Qloo: 50 titles in each of five domains. Places are grouped when their lift profiles point the same way (cosine
              similarity, average linkage; the number of zones is the one that separates them best, by silhouette score). The matrix shows the plain overlap
              behind it: the share of top titles two places have in common.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {result.groups
                .filter((x) => x.kind === 'zone')
                .map((z) => {
                  const [a, b] = z.markets
                  const o = b ? result.overlap!.markets.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) : undefined
                  return (
                    <li key={z.key} className="flex items-baseline gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: rgb(colorOf(result, z.key)) }} />
                      <span>
                        <b>{z.markets.join(' + ')}</b>
                        {o ? `: ${Math.round(o.pct * 100)}% in common, grouped as ${personaName(z)}` : `: its own audience, ${personaName(z)}`}
                      </span>
                    </li>
                  )
                })}
              {result.overlap.neighborhoods[0] && (
                <li className="flex items-baseline gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-coral" />
                  <span>
                    <b>
                      {result.overlap.neighborhoods[0].a} and {result.overlap.neighborhoods[0].b}
                    </b>
                    : {Math.round(result.overlap.neighborhoods[0].pct * 100)}% in common, less than any two cities, so they get separate campaigns
                  </span>
                </li>
              )}
            </ul>
          </div>
          <SimilarityMatrix result={result} />
        </div>
      )}

      {/* Creative concepts for this zone */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-h3">Three ways to talk to {personaName(g)}</h3>
          <Link to={`../creatives?g=${encodeURIComponent(g.key)}`} className="inline-flex items-center gap-1 text-sm text-link">
            See all concepts <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(g.concepts ?? []).map((c, i) => (
            <Link key={c.id} to={`../creatives?g=${encodeURIComponent(g.key)}&c=${c.id}`} className="group">
              <Poster g={g} c={c} color={color} productName={campaign.product_name} size="thumb" className="transition group-hover:brightness-110" />
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{c.direction}</span>
                {c.panel && (
                  <span className={`tabular shrink-0 text-xs ${i === (g.chosen ?? 0) ? 'font-semibold text-mint' : 'text-mute'}`}>
                    {c.panel.stop_scrolling}/{c.panel.size} stop
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Culture Map: the geist's Qloo entities as a constellation (spec decision 6) */}
      <div className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="t-h3">Their culture, mapped</h3>
          <Source>Qloo entities, sized by lift. Drag to explore.</Source>
        </div>
        <CultureMap g={g} color={color} extra={result.markets.filter((m) => g.markets.includes(m.name)).flatMap((m) => m.top)} />
      </div>

      {dossier && <Dossier g={g} color={color} productName={campaign.product_name} onClose={() => setParams({ g: g.key })} />}
    </div>
  )
}
