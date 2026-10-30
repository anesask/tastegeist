import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Link2, Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { api, DOMAIN_LABEL, fetchHeatmap, fmtDate, rgb, type Geist, type HeatCell, type RunResult, type WorkspaceSettings } from '../lib/api'
import { chosenConcept, colorOf, mapGeists, personaName, placeName } from '../lib/geists'
import { MapView } from '../components/MapView'
import { GenericPoster, Poster } from '../components/Poster'
import { BudgetTreemap, LiftBars, OverlapBars } from '../components/Charts'
import { ImagePie } from '../components/ImagePie'
import { Mixtape } from '../components/Cassette'
import { ThemeToggle, Wordmark } from '../components/Brand'
import { LegalLine, SiteFooter } from '../components/Site'
import { Button, LinkButton, Skeleton, useToast } from '../components/ui'
import { NotFound } from './NotFound'
import { useTitle } from '../lib/title'
import { fisherGreater, pText, wilson } from '../lib/stats'

const money = (v: number, cur: string) => `${cur} ${Math.round(v).toLocaleString('en-GB')}`

function Kicker({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 kicker text-mute">
      {n && <span className="tabular text-sm normal-case tracking-normal text-coral">{n}</span>}
      {children}
    </div>
  )
}

/** One chapter per geist: who they are, what they over-index on, the concept made for them, how it tested. */
function Chapter({
  cid,
  g,
  n,
  result,
  productName,
  brand,
}: {
  cid: string
  g: Geist
  n: number
  result: RunResult
  productName: string
  brand?: WorkspaceSettings['brand']
}) {
  const color = colorOf(result, g.key)
  const c = chosenConcept(g)
  const zone = result.plan.zones.find((z) => z.key === g.key)
  const quote = c?.panel?.personas.find((p) => p.stop_scrolling && p.quote)
  // The place's own mixtape, from its culture profile (only for campaigns this browser may read)
  const prof = useQuery({ queryKey: ['profile', cid, g.key], queryFn: () => api.profile(cid, g.key), staleTime: Infinity, retry: false })
  const mix = (prof.data?.sections.find((s) => s.id === 'sound')?.entities ?? []).filter((e) => e.preview).slice(0, 6)
  return (
    <section className="report-chapter border-t border-line py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <Kicker n={String(n).padStart(2, '0')}>
            <span style={{ color: rgb(color) }}>{placeName(g)}</span>
          </Kicker>
          <h2 className="mt-4 font-display text-[clamp(2.6rem,1.8rem+2.6vw,4.5rem)] leading-[0.95]">{personaName(g)}</h2>
          <p className="measure mt-5 text-lg leading-relaxed text-ink-2">{g.persona?.tagline || g.geist}</p>
          <div className="mt-8 max-w-md">
            <ImagePie
              items={g.ledger
                .filter((e) => e.image)
                .slice(0, 9)
                .map((e) => ({
                  id: e.id,
                  name: e.name,
                  image: e.image,
                  value: (e.lift * Math.sqrt(e.popularity ?? 0.2)) ** 2,
                  sub: DOMAIN_LABEL[e.domain],
                }))}
              color={color}
              size={400}
              center={{ title: '', sub: 'What it over-indexes on' }}
              label={`What ${placeName(g)} over-indexes on, from Qloo`}
            />
          </div>
          <div className="mt-8">
            <div className="text-sm font-semibold">What over-indexes here</div>
            <div className="mt-2">
              <LiftBars g={g} color={color} result={result} n={6} />
            </div>
          </div>
          {g.places && g.places.length > 0 && (
            <p className="mt-6 text-sm text-ink-2">
              <span className="font-semibold text-ink">Where they go out: </span>
              {g.places.map((p) => p.name).join(', ')}.
            </p>
          )}
        </div>

        {c && (
          <div className="flex flex-col gap-6">
            <Poster g={g} c={c} color={color} productName={productName} brand={brand} />
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              {c.panel && (
                <div>
                  <div className="t-metric-lg">
                    {c.panel.stop_scrolling}
                    <span className="text-xl text-mute">/{c.panel.size}</span>
                  </div>
                  <div className="mt-1 text-xs text-mute">would stop scrolling</div>
                </div>
              )}
              {g.baseline_panel && (
                <div>
                  <div className="t-metric-lg text-mute">
                    {g.baseline_panel.stop_scrolling}
                    <span className="text-xl">/{g.baseline_panel.size}</span>
                  </div>
                  <div className="mt-1 text-xs text-mute">for the generic concept</div>
                </div>
              )}
              {zone && (
                <div>
                  <div className="t-metric-lg">{Math.round(zone.share * 100)}%</div>
                  <div className="mt-1 text-xs text-mute">of the budget, {money(zone.budget, result.plan.currency)}</div>
                </div>
              )}
            </div>
            {c.big_idea && <p className="text-[15px] leading-relaxed text-ink-2">{c.big_idea.text}</p>}
            {quote && (
              <figure className="border-l-2 pl-4" style={{ borderColor: rgb(color) }}>
                <blockquote className="text-lg leading-snug text-ink">"{quote.quote}"</blockquote>
                <figcaption className="mt-2 text-xs text-mute">
                  Synthetic persona, {quote.market}, {quote.age}
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </div>
      {mix.length > 0 && (
        <div className="mt-14 border-t border-line pt-12 print:hidden">
          <Kicker>The sound of {placeName(g)}</Kicker>
          <div className="mt-6">
            <Mixtape place={placeName(g)} title={personaName(g)} artists={mix} />
          </div>
        </div>
      )}
    </section>
  )
}

export function Report() {
  const { id = '' } = useParams()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.report(id),
    retry: false,
  })
  useTitle(q.data ? `${q.data.headline || q.data.title} (report)` : 'Report')
  const geists = useMemo(() => (q.data?.result ? mapGeists(q.data.result) : []), [q.data])
  // The cover opens on the strongest place: a neighborhood split at street zoom with its live
  // heatmap, or for a country campaign the national heatmap.
  const res = q.data?.result
  const hero = res ? (res.groups.find((g) => g.kind === 'neighborhood') ?? res.groups[0]) : undefined
  const national = !!res?.country_heat?.length && hero?.kind === 'zone' && hero.markets.length > 1
  const heroCity = hero ? (hero.kind === 'neighborhood' ? (hero.parent ?? hero.markets[0]) : hero.markets[0]) : ''
  const heroIds = hero ? hero.ledger.slice(0, 3).map((e) => e.id) : []
  const heatQ = useQuery({
    queryKey: ['heat', heroCity, heroIds.join()],
    queryFn: () => fetchHeatmap(heroCity, heroIds),
    enabled: !!hero && !national,
    staleTime: Infinity,
    retry: false,
  })
  const coverHeat = national ? ((res?.country_heat ?? []) as HeatCell[]) : (heatQ.data ?? [])
  const coverInset = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.28) : 0

  if (q.isError) return <NotFound />
  if (!q.data?.result || !hero)
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-16">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="h-[50vh] w-full" />
      </div>
    )

  const c = q.data
  const r = c.result!
  const [first, ...rest] = (c.headline || r.headline || c.title).split('. ')
  const hood = r.overlap?.neighborhoods[0]
  const closest = [...(r.overlap?.markets ?? [])].sort((a, b) => b.pct - a.pct)[0]
  const paired = r.groups.filter((g) => chosenConcept(g)?.panel && g.baseline_panel)
  const stops = paired.reduce((a, g) => a + chosenConcept(g)!.panel!.stop_scrolling, 0)
  const stopsBase = paired.reduce((a, g) => a + g.baseline_panel!.stop_scrolling, 0)
  const panelTotal = paired.reduce((a, g) => a + g.baseline_panel!.size, 0)
  const heroConcept = chosenConcept(hero)
  const b = c.branding
  const agency = b?.agency?.name || b?.agency?.logo ? b.agency : null

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Toolbar: on screen only */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          {agency ? (
            agency.logo ? (
              <img src={agency.logo} alt={agency.name || 'Agency'} className="h-8 max-w-[180px] object-contain object-left" />
            ) : (
              <span className="font-semibold">{agency.name}</span>
            )
          ) : (
            <Wordmark />
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href)
                toast('Report link copied. Anyone with the link can view it.')
              }}
            >
              <Link2 size={14} /> <span className="hidden sm:inline">Copy link</span>
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer size={14} /> <span className="hidden sm:inline">Save as PDF</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Cover */}
      <section className="relative h-[86vh] min-h-[560px] overflow-hidden bg-[#0b0a09] text-white print:h-auto print:min-h-0 print:bg-transparent print:text-ink">
        <div className="absolute inset-0 print:hidden">
          <MapView
            interactive={false}
            geists={geists}
            selected={hero.key}
            insetBottom={coverInset}
            heat={coverHeat}
            heatScale={national ? 30 : 1}
            heatColor={national ? [212, 164, 58] : colorOf(r, hero.key)}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a09] via-[#0b0a09]/40 to-transparent print:hidden" />
        <div className="absolute bottom-3 right-4 z-10 text-xs text-white/50 print:hidden">Map © OpenStreetMap contributors © CARTO · Heatmap © Qloo</div>
        <div className="pointer-events-none relative mx-auto flex h-full max-w-6xl flex-col justify-end px-4 pb-14 md:px-8 md:pb-20 print:pb-8 print:pt-4">
          <div className="kicker !text-white/60 print:!text-mute">
            Campaign report · {b?.brand?.name || c.product_name} · {fmtDate(c.updated ? c.updated * 1000 : Date.now())}
          </div>
          {(agency || b?.client) && (
            <div className="mt-2 text-sm text-white/70 print:text-ink-2">
              {[agency?.name && `Prepared by ${agency.name}`, b?.client && `for ${b.client}`].filter(Boolean).join(' ')}
            </div>
          )}
          <h1 className="mt-5 max-w-4xl font-display text-hero leading-[0.92]">
            {rest.length ? `${first}.` : first}
            {rest.length > 0 && <em className="block text-white/60 print:text-mute">{rest.join('. ')}</em>}
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/75 print:text-ink-2">
            {r.brief.title}. {r.groups.length} taste {r.groups.length === 1 ? 'zone' : 'zones'} across {r.markets.map((m) => m.name).join(', ')}, each with its
            own concept, tested on a synthetic panel and budgeted in one media plan.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 md:px-8">
        {/* The finding */}
        <section className="grid gap-10 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <Kicker>The finding</Kicker>
            {hood && closest ? (
              <h2 className="mt-4 font-display text-statement leading-[1]">
                {hood.a} and {hood.b} share {Math.round(hood.pct * 100)}% of their taste.{' '}
                <em className="text-mute">
                  {closest.a} and {closest.b} share {Math.round(closest.pct * 100)}%.
                </em>
              </h2>
            ) : (
              <h2 className="mt-4 font-display text-statement leading-[1]">
                {r.groups.length} audiences, <em className="text-mute">not one.</em>
              </h2>
            )}
            <p className="measure mt-6 text-ink-2">
              One campaign for every market talks past most of what makes each place itself. Tastegeist read each market's culture from Qloo, clustered the
              places with shared taste, and wrote for each group from what it over-indexes on.
            </p>
            {panelTotal > 0 && (
              <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-line pt-6">
                <div>
                  <div className="t-metric-lg">
                    {stops}
                    <span className="text-xl text-mute">/{panelTotal}</span>
                  </div>
                  <div className="mt-1 text-xs text-mute">personas stop for the tailored concepts</div>
                </div>
                <div>
                  <div className="t-metric-lg text-mute">
                    {stopsBase}
                    <span className="text-xl">/{panelTotal}</span>
                  </div>
                  <div className="mt-1 text-xs text-mute">for one generic concept</div>
                </div>
              </div>
            )}
          </div>
          {r.overlap && (r.overlap.markets.length > 1 || r.overlap.neighborhoods.length > 0) && (
            <div className="self-end">
              <div className="text-sm font-semibold">Taste in common, by pair of places</div>
              <div className="mt-1 text-xs text-mute">Share of top Qloo entities in common. Neighborhoods in coral.</div>
              <div className="mt-4">
                <OverlapBars overlap={r.overlap} />
              </div>
            </div>
          )}
        </section>

        {/* Chapters */}
        {r.groups.map((g, i) => (
          <Chapter key={g.key} cid={id} g={g} n={i + 1} result={r} productName={c.product_name} brand={b?.brand} />
        ))}

        {/* With and without Qloo */}
        {r.llm_only && heroConcept && (
          <section className="border-t border-line py-16 md:py-24">
            <Kicker>The control</Kicker>
            <h2 className="mt-4 max-w-3xl font-display text-statement leading-[1]">
              The same brief without the culture data <em className="text-mute">writes one ad for everyone.</em>
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              <div>
                <GenericPoster headline={r.llm_only.headline} />
                <div className="mt-3 text-sm text-mute">
                  LLM only, 0 Qloo references.{' '}
                  {hero.baseline_panel && `${hero.baseline_panel.stop_scrolling} of ${hero.baseline_panel.size} ${placeName(hero)} personas stop.`}
                </div>
              </div>
              <div>
                <Poster g={hero} c={heroConcept} color={colorOf(r, hero.key)} productName={c.product_name} size="thumb" />
                <div className="mt-3 text-sm text-mute">
                  Tastegeist, built from the {placeName(hero)} ledger.{' '}
                  {heroConcept.panel && `${heroConcept.panel.stop_scrolling} of ${heroConcept.panel.size} stop.`}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* The plan */}
        <section className="border-t border-line py-16 md:py-24">
          <Kicker>The plan</Kicker>
          <h2 className="mt-4 font-display text-statement leading-[1]">
            {money(r.plan.budget, r.plan.currency)},{' '}
            <em className="text-mute">
              {fmtDate(r.plan.start)} to {fmtDate(r.plan.end)}.
            </em>
          </h2>
          <div className="mt-10">
            <BudgetTreemap plan={r.plan} colors={Object.fromEntries(r.plan.zones.map((z) => [z.key, colorOf(r, z.key)]))} />
          </div>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-mute">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">Taste zone</th>
                  <th className="py-2 pr-4 font-medium">Where</th>
                  <th className="py-2 pr-4 font-medium">Concept</th>
                  <th className="py-2 pr-4 text-right font-medium">Budget</th>
                </tr>
              </thead>
              <tbody>
                {r.plan.zones
                  .filter((z) => z.budget > 0)
                  .map((z) => (
                    <tr key={z.key} className="border-b border-line align-top">
                      <td className="py-3 pr-4 font-medium">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: rgb(colorOf(r, z.key)) }} />
                        {z.name}
                      </td>
                      <td className="py-3 pr-4 text-ink-2">{z.label}</td>
                      <td className="py-3 pr-4 text-ink-2">{z.creative?.headline ?? '-'}</td>
                      <td className="tabular py-3 pr-4 text-right">{money(z.budget, r.plan.currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How sure we are */}
        <section className="border-t border-line py-16 md:py-24">
          <Kicker>How sure we are</Kicker>
          <h2 className="mt-4 max-w-3xl font-display text-statement leading-[1]">
            Strong on who they are, <em className="text-mute">directional on what they'll do.</em>
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {(() => {
              const all = r.groups.flatMap((g) => g.ledger)
              const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
              const here = avg(all.map((e) => e.lift))
              const there = avg(all.map((e) => e.lift_outside ?? 1))
              const w = wilson(stops, panelTotal)
              const p = panelTotal ? fisherGreater(stops, panelTotal, stopsBase, panelTotal) : 1
              return [
                {
                  level: 'Strong',
                  claim: 'The places really differ',
                  evidence: hood
                    ? `${hood.a} and ${hood.b} share ${Math.round(hood.pct * 100)}% of their top titles${closest ? `; the closest pair of cities, ${closest.a} and ${closest.b}, ${Math.round(closest.pct * 100)}%` : ''}. Measured on Qloo's raw lists, before any of our math.`
                    : closest
                      ? `The closest pair of places, ${closest.a} and ${closest.b}, share ${Math.round(closest.pct * 100)}% of their top titles. Measured on Qloo's raw lists.`
                      : 'Measured on Qloo’s raw lists for each place.',
                },
                {
                  level: 'Strong',
                  claim: 'The references are local',
                  evidence: `The ${all.length} titles the concepts are built from average ${here.toFixed(1)}× in their own zone and ${there.toFixed(1)}× in the others. Aggregate Qloo affinities, not individuals.`,
                },
                {
                  level: 'Directional',
                  claim: 'Tailored beats generic',
                  evidence: panelTotal
                    ? `${stops} of ${panelTotal} synthetic personas stop for the tailored concepts (95% range ${w.loN} to ${w.hiN}), ${stopsBase} for the generic one; ${pText(p)}. Personas are AI built from Qloo data, so this is a hypothesis, not a survey.`
                    : 'Not tested in this campaign.',
                },
                {
                  level: 'Not measured',
                  claim: 'It sells more',
                  evidence: 'Nothing here measures sales. The media plan carries an A/B test per zone, tailored against runner-up, to measure it in market.',
                },
              ].map((x) => (
                <div key={x.claim} className="bg-bg p-6">
                  <div className={`text-xs font-medium ${x.level === 'Strong' ? 'text-mint' : x.level === 'Directional' ? 'text-amber' : 'text-mute'}`}>
                    {x.level}
                  </div>
                  <div className="t-h3 mt-1">{x.claim}</div>
                  <p className="mt-2 text-sm text-ink-2">{x.evidence}</p>
                </div>
              ))
            })()}
          </div>
        </section>

        {/* Method */}
        <section className="border-t border-line py-12 text-sm text-mute">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="font-semibold text-ink">Data</div>
              <p className="mt-1">
                Taste data from Qloo: culture maps per market across music, TV, film, podcasts and brands; heatmaps; places; demographics. Group affinities,
                never individuals.
              </p>
            </div>
            <div>
              <div className="font-semibold text-ink">Creative</div>
              <p className="mt-1">
                Concepts written by Claude from each zone's Qloo ledger only; every element cites the entities behind it. Imagery shown is the Qloo references
                themselves.
              </p>
            </div>
            <div>
              <div className="font-semibold text-ink">Testing</div>
              <p className="mt-1">
                The séance is a synthetic panel of 8 personas per zone built from Qloo data. Directional, not a survey: validate with the A/B tests in the media
                plan. Personas are composites; nothing is inferred about sensitive traits (
                <Link to="/methodology#responsible-use" className="text-link">
                  responsible use
                </Link>
                ).
              </p>
            </div>
          </div>
        </section>
      </main>

      {agency ? (
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-mute md:px-8">
            <span>Made with Tastegeist. Taste data from Qloo; concepts and personas written by AI.</span>
            <LegalLine />
          </div>
        </footer>
      ) : (
        <>
          <section className="border-t border-line print:hidden">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-8">
              <span className="text-sm text-mute">Every neighborhood has a geist. Made with Tastegeist.</span>
              <LinkButton to="/app/new" variant="primary">
                Make one for your brand <ArrowRight size={16} />
              </LinkButton>
            </div>
          </section>
          <SiteFooter />
        </>
      )}
    </div>
  )
}
