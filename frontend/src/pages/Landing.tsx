import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { api, DOMAIN_LABEL, heroFirst, rgb, type Geist, type RunResult } from '../lib/api'
import { chosenConcept, colorOf, personaName, type RGB } from '../lib/geists'
import { useRunStats } from '../lib/runtime'
import { ImagePie, type PieItem } from '../components/ImagePie'
import { TasteFan } from '../components/TasteFan'
import { TasteMap } from '../components/TasteMap'
import { HowItWorks } from '../components/HowItWorks'
import { ProductFilm } from '../components/ProductFilm'
import { Deliverables } from '../components/Deliverables'
import { Markets } from '../components/Markets'
import { SiteFooter, SiteHeader } from '../components/Site'
import { Button, LinkButton } from '../components/ui'
import { startTour } from '../components/Tour'
import { PricingTiers } from './Pricing'
import { useTitle } from '../lib/title'

function HoodColumn({ g, color }: { g: Geist; color: RGB }) {
  // The neighborhood as a pie of its own culture: each slice a title it over-indexes on.
  const items = g.ledger
    .filter((e) => e.image)
    .slice(0, 9)
    .map((e) => ({
      id: e.id,
      name: e.name,
      image: e.image,
      value: (e.lift * Math.sqrt(e.popularity ?? 0.2)) ** 2,
      sub: DOMAIN_LABEL[e.domain],
    }))
  const strongest = items.slice().sort((a, b) => b.value - a.value)[0]
  const [focus, setFocus] = useState<PieItem | null>(null)
  const bg = focus ?? strongest
  return (
    <div className="relative isolate overflow-hidden rounded-[2rem] px-4 py-10 text-center">
      {/* The slice in focus, as a soft wash behind the whole column; the strongest one, fainter, at rest. */}
      <AnimatePresence>
        {bg?.image && (
          <motion.img
            key={bg.id}
            src={bg.image}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-2xl saturate-150"
            initial={{ opacity: 0 }}
            animate={{ opacity: focus ? 0.42 : 0.22 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
      <div className="kicker" style={{ color: rgb(color) }}>
        {personaName(g)}
      </div>
      <h3 className="mt-2 font-display text-5xl tracking-tight md:text-6xl">{g.label}</h3>
      <div className="mt-6">
        <ImagePie
          items={items}
          color={color}
          size={440}
          center={{ title: '', sub: matchMedia('(hover: none)').matches ? 'Tap a slice' : 'Hover a slice' }}
          onHover={setFocus}
          label={`What ${g.label} over-indexes on, from Qloo`}
        />
      </div>
      <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-ink-2">{g.persona?.tagline}</p>
    </div>
  )
}

type Ranks = Record<string, Record<string, [number | null, number]>>

/** How we know, with the Los Angeles demo's own numbers and one title worked through by rank. */
function HowWeKnow({ r, hoods, ranks }: { r: RunResult; hoods: Geist[]; ranks: Ranks }) {
  const read = r.trace?.steps.map((x) => /lift for (\d+) entities across (\d+)/.exec(x.text)).find(Boolean)
  const lines = r.groups.flatMap((x) =>
    (x.concepts ?? []).flatMap((c) => [c.big_idea, c.headline, c.body, c.music, ...c.moodboard, ...c.partners, ...c.channels].filter(Boolean)),
  )
  const stats = [
    read && { v: Number(read[1]).toLocaleString('en-GB'), l: `titles compared across ${read[2]} places, music to brands` },
    {
      v: lines.length.toLocaleString('en-GB'),
      l: `concept lines, every one citing a Qloo title${r.trace?.totals.rejected_elements ? ` (${r.trace.totals.rejected_elements} rejected for not citing)` : ''}`,
    },
    r.trace && { v: `${r.trace.totals.qloo_calls}`, l: 'Qloo calls behind this demo, each one listed in "How it was made"' },
    { v: '0', l: 'personal data sent to Qloo: only places, products and cultural titles' },
  ].filter(Boolean) as { v: string; l: string }[]

  // The worked example: the first neighborhood's top-ranked title, compared with the other neighborhood.
  const [g, other] = hoods
  const here = (id: string) => ranks[id]?.[g.label]?.[0] ?? null
  const e = g.ledger.filter((x) => x.image && here(x.id) != null).sort((a, b) => here(a.id)! - here(b.id)!)[0] ?? g.ledger[0]
  const rank = here(e.id)
  const [there, of] = ranks[e.id]?.[other.label] ?? [null, 50]
  const usedIn = (g.concepts ?? []).find((c) => [c.headline, c.big_idea, c.body, ...c.moodboard].some((x) => x?.because.includes(e.id)))
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="kicker text-center">How we know</div>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">Numbers, not adjectives.</h2>
        <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
          <div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-8">
              {stats.map((x) => (
                <div key={x.l}>
                  <dt className="t-metric-lg">{x.v}</dt>
                  <dd className="mt-1 text-sm text-ink-2">{x.l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card p-6">
            <div className="kicker">One title, worked out</div>
            <div className="mt-4 flex items-center gap-4">
              {e.image && <img src={e.image} alt="" className="h-16 w-16 rounded-xl object-cover" />}
              <div>
                <div className="t-h2">{e.name}</div>
                <div className="text-sm text-mute">
                  {DOMAIN_LABEL[e.domain]} · {g.label} vs {other.label}
                </div>
              </div>
            </div>
            <ol className="mt-6 space-y-4 text-sm text-ink-2">
              <li>
                <b className="block text-ink">
                  <span className="tabular mr-2 text-mute">1</span>
                  Ask Qloo per place
                </b>{' '}
                For the same product references, Qloo ranks the top {of} titles per domain in {g.label} and in {other.label}.
              </li>
              <li>
                <b className="block text-ink">
                  <span className="tabular mr-2 text-mute">2</span>
                  Compare the ranks
                </b>{' '}
                {e.name} is <b className="tabular text-ink">{rank != null ? `#${rank}` : 'near the top'}</b> in {g.label}, and{' '}
                <b className="text-ink">{there != null ? `#${there}` : `not in the top ${of}`}</b> in {other.label}.
              </li>
              <li>
                <b className="block text-ink">
                  <span className="tabular mr-2 text-mute">3</span>
                  Keep the distinctive
                </b>{' '}
                So it defines {g.label}'s audience, enters its ledger, and the concepts may cite it
                {usedIn?.headline ? (
                  <>
                    , as in <span className="text-ink">&ldquo;{usedIn.headline.text.replace(/[.]$/, '')}&rdquo;</span>
                  </>
                ) : null}
                .
              </li>
            </ol>
            <Link to="/methodology" className="text-link mt-6 inline-flex items-center gap-1 text-sm">
              The full method <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The Qloo mark: the official logo file if present in public/partners, else a typographic stand-in. */
function QlooMark({ className = '' }: { className?: string }) {
  const [file, setFile] = useState(true)
  return file ? (
    <img src="/partners/qloo.svg" alt="Qloo" className={`h-7 w-auto invert [[data-theme=dark]_&]:invert-0 ${className}`} onError={() => setFile(false)} />
  ) : (
    <span className={`text-2xl font-bold tracking-tight text-current ${className}`}>Qloo</span>
  )
}

/** Why Qloo: the same brief with and without the taste data, and what Qloo brings, side by side. */
function WhyQloo({ r, hoods, ranks }: { r: RunResult; hoods: Geist[]; ranks: Ranks }) {
  const llm = r.llm_only
  const cards = hoods.map((g) => ({ g, c: chosenConcept(g) }))
  const powers = [
    { t: 'A taste graph', d: 'What people who like one thing also like, across music, TV, film, podcasts, books, brands and places.' },
    { t: 'Down to the block', d: 'Heatmaps show where a taste concentrates in a city, not only which city has it.' },
    { t: 'Groups, not people', d: 'Aggregate affinities and demographics. No personal data goes in, none comes out.' },
  ]
  return (
    <section id="why-qloo" className="scroll-mt-20 bg-ink text-bg">
      <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="kicker flex items-center justify-center gap-2 text-bg/60">
            Why <QlooMark className="!h-4 !text-sm text-bg" />
          </div>
          <h2 className="mt-4 font-display text-statement leading-[1.02] tracking-tight" style={{ textWrap: 'balance' }}>
            A language model alone writes one campaign for everyone.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-bg/70" style={{ textWrap: 'balance' }}>
            No model knows what {hoods[0].label} watches that {hoods[1].label} doesn't. Qloo does. Same brief, same model: here is what changes when the taste
            data is in.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {llm && (
            <div className="flex flex-col rounded-2xl border border-dashed border-bg/20 p-6">
              <div className="text-xs uppercase tracking-widest text-bg/45">Without Qloo</div>
              <div className="mt-1 text-sm text-bg/55">One ad for the whole city</div>
              <div className="mt-6 font-display text-3xl leading-tight text-bg/60">{llm.headline}</div>
              <div className="mt-auto pt-6 text-xs text-bg/45">No sources. Nothing local to cite.</div>
            </div>
          )}
          {cards.map(({ g, c }) => (
            <div key={g.key} className="relative flex flex-col overflow-hidden rounded-2xl bg-bg/[0.07] p-6 ring-1 ring-bg/10">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest" style={{ color: rgb(colorOf(r, g.key)) }}>
                <span className="h-2 w-2 rounded-full" style={{ background: rgb(colorOf(r, g.key)) }} />
                With Qloo · {g.label}
              </div>
              <div className="mt-1 text-sm text-bg/55">{personaName(g)}</div>
              <div className="mt-6 font-display text-3xl leading-tight">{c?.headline?.text}</div>
              <div className="mt-auto flex items-center gap-2 pt-6">
                <div className="flex -space-x-2">
                  {g.ledger
                    .filter((e) => e.image)
                    .slice(0, 4)
                    .map((e) => (
                      <img key={e.id} src={e.image!} alt={e.name} title={e.name} className="h-8 w-8 rounded-full object-cover ring-2 ring-ink" />
                    ))}
                </div>
                <span className="text-xs text-bg/55">Built on {g.ledger.length} titles it over-indexes on</span>
              </div>
              {(() => {
                // The title that most separates this place from the other one, by Qloo rank.
                const other = hoods.find((h) => h.key !== g.key)!
                const rk = (id: string) => ranks[id]?.[g.label]?.[0] ?? 99
                const e = g.ledger.filter((x) => ranks[x.id]?.[other.label]?.[0] == null).sort((a, b) => rk(a.id) - rk(b.id))[0]
                return e && rk(e.id) < 99 ? (
                  <div className="mt-3 text-xs text-bg/70">
                    <b className="text-bg">{e.name}</b> is #{rk(e.id)} here and not on {other.label}'s list
                  </div>
                ) : null
              })()}
            </div>
          ))}
        </div>

        <div className="mt-14 grid gap-8 border-t border-bg/10 pt-10 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-3">
            <QlooMark className="text-bg" />
            <span className="text-sm text-bg/55">Cultural AI, the data under every line</span>
          </div>
          <ul className="grid gap-6 sm:grid-cols-3">
            {powers.map((x) => (
              <li key={x.t}>
                <div className="font-medium">{x.t}</div>
                <p className="mt-1 text-sm leading-relaxed text-bg/60">{x.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function Landing() {
  const nav = useNavigate()
  useTitle(undefined)
  // The neighborhood story is told with the US demo: Los Angeles, Silver Lake against Venice.
  const us = useQuery({ queryKey: ['campaign', 'us'], queryFn: () => api.campaign('us'), retry: 1 })
  const la = us.data?.result
  const laHoods = la?.groups.filter((g) => g.kind === 'neighborhood') ?? []
  // Each neighborhood's own covers for the hero split, people and film before logos.
  const sides = laHoods.map((g) => heroFirst(g.ledger.filter((e) => e.image)))
  // Rank of each title in both neighborhoods' Qloo lists: sharper than lift when only two places compare.
  const profA = useQuery({
    queryKey: ['profile', 'us', laHoods[0]?.key],
    queryFn: () => api.profile('us', laHoods[0].key),
    enabled: !!laHoods[0],
    staleTime: Infinity,
  })
  const profB = useQuery({
    queryKey: ['profile', 'us', laHoods[1]?.key],
    queryFn: () => api.profile('us', laHoods[1].key),
    enabled: !!laHoods[1],
    staleTime: Infinity,
  })
  const ranks = { ...(profA.data?.ledger_ranks ?? {}), ...(profB.data?.ledger_ranks ?? {}) }
  // Selling points with real numbers: measured run time and the Los Angeles demo's own results.
  const runStats = useRunStats()
  const proofSrc = la
  const proof = (() => {
    if (!proofSrc) return []
    const paired = proofSrc.groups.filter((g) => chosenConcept(g)?.panel && g.baseline_panel)
    const ours = paired.reduce((a, g) => a + chosenConcept(g)!.panel!.stop_scrolling, 0)
    const base = paired.reduce((a, g) => a + g.baseline_panel!.stop_scrolling, 0)
    const n = paired.reduce((a, g) => a + g.baseline_panel!.size, 0)
    const mins = runStats.data?.p50 ? Math.max(1, Math.round(runStats.data.p50 / 60)) : null
    return [
      mins ? { v: `${mins} min`, l: 'from brief to a campaign per neighborhood' } : { v: 'Minutes', l: 'from brief to a campaign per neighborhood' },
      n ? { v: `${ours} vs ${base}`, l: `of ${n} synthetic locals stop: tailored ads vs one generic ad` } : null,
      { v: '100%', l: 'of lines backed by real taste data, with the source' },
    ].filter(Boolean) as { v: string; l: string }[]
  })()

  return (
    <div className="min-h-full bg-bg">
      <SiteHeader sections />

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-10 md:grid-cols-2 md:px-8 md:pt-16">
        <div className="rise">
          <div className="kicker">Built on Qloo's taste data</div>
          <h1 className="mt-5 font-display text-[clamp(2.75rem,1.4rem+3.6vw,4.75rem)] leading-[0.95] tracking-tight">
            One city. Many tastes.
            <span className="block italic text-mute">A campaign for each.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2">
            Tastegeist finds the audiences hiding inside a market, down to the neighborhood, from what people there actually watch, hear and buy. Then it
            writes, tests and budgets a campaign for each, and shows the data behind every line.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <LinkButton to="/app/new" variant="primary" size="lg">
              Start your own <ArrowRight size={18} />
            </LinkButton>
            <Button size="lg" onClick={() => startTour(nav)}>
              <Play size={16} /> Take the 1-minute tour
            </Button>
          </div>
          {proof.length > 0 && (
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-5">
              {proof.map((x) => (
                <div key={x.l}>
                  <dt className="t-metric whitespace-nowrap text-base sm:text-lg">{x.v}</dt>
                  <dd className="mt-0.5 text-xs leading-snug text-mute">{x.l}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {/* On phones the fan is the same component, scaled down to fit the screen. */}
        <div className="relative -mx-5 h-[360px] overflow-hidden md:mx-0 md:h-auto md:overflow-visible">
          <div className="absolute left-1/2 top-0 w-[600px] origin-top -translate-x-1/2 scale-[0.66] md:static md:w-auto md:translate-x-0 md:scale-100">
            {la && laHoods.length === 2 && sides[0]?.length >= 4 && sides[1]?.length >= 4 ? (
              <TasteFan
                ranks={ranks}
                city={laHoods[0].parent ?? 'This city'}
                shared={la.overlap?.neighborhoods[0]?.pct ?? null}
                a={{
                  key: laHoods[0].key,
                  place: laHoods[0].label,
                  persona: personaName(laHoods[0]),
                  color: colorOf(la, laHoods[0].key),
                  titles: sides[0],
                }}
                b={{
                  key: laHoods[1].key,
                  place: laHoods[1].label,
                  persona: personaName(laHoods[1]),
                  color: colorOf(la, laHoods[1].key),
                  titles: sides[1],
                }}
              />
            ) : (
              <div className="h-[520px] animate-pulse rounded-3xl bg-surface-2" aria-hidden />
            )}
          </div>
        </div>
      </section>

      {/* The product film */}
      <section id="film" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 md:px-8">
        <ProductFilm
          onTour={() => startTour(nav)}
          images={sides
            .flat()
            .slice(0, 2)
            .map((e) => e.image)}
        />
      </section>

      {/* The product itself, before any explanation: a live map of the hero's two neighborhoods. */}
      {la && laHoods.length === 2 && sides[0]?.length && sides[1]?.length ? (
        <section className="mx-auto max-w-7xl px-5 pb-24 md:px-8">
          <div className="mb-10 text-center">
            <div>
              <div className="kicker">Live from the demo · Qloo heatmap</div>
              <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">
                Where each taste lives in {laHoods[0].parent ?? 'the city'}.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-ink-2">
                {laHoods[0].label}'s taste in one color, {laHoods[1].label}'s in the other: every block across the city where each over-indexes. That's where
                the campaign goes, well beyond the neighborhood itself.
              </p>
            </div>
            <Link to="/app/c/us/zones" className="text-link mt-4 inline-block text-sm">
              Explore it live
            </Link>
          </div>
          <TasteMap result={la} hoods={laHoods} titles={sides} />
        </section>
      ) : null}

      {/* The split, live from the demo */}
      {la && laHoods.length === 2 && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-7xl px-5 py-20 md:px-8">
            <div className="kicker text-center">Live from the demo · Qloo data</div>
            <h2 className="mx-auto mt-3 max-w-4xl text-center font-display text-statement leading-[1.02] tracking-tight" style={{ textWrap: 'balance' }}>
              {/* A city's name never breaks across lines. */}
              Two neighborhoods of {(laHoods[0].parent ?? 'one city').replace(/ /g, '\u00a0')}. Two different audiences.
            </h2>
            {la.overlap?.neighborhoods[0] && (
              <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-ink-2" style={{ textWrap: 'balance' }}>
                {laHoods[0].label} and {laHoods[1].label} share only {Math.round(la.overlap.neighborhoods[0].pct * 100)}% of their top tastes. Each slice is a
                title one of them over-indexes on, sized by how distinctive and how widely known it is.
              </p>
            )}
            <div className="mt-12 grid gap-12 md:grid-cols-2">
              <HoodColumn g={laHoods[0]} color={colorOf(la, laHoods[0].key)} />
              <HoodColumn g={laHoods[1]} color={colorOf(la, laHoods[1].key)} />
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 md:px-8">
        <div className="kicker text-center">How it works</div>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">
          From a brief to a campaign map in minutes.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-ink-2">Each step below shows what it really produced for the Los Angeles demo.</p>
        {la ? <HowItWorks r={la} /> : <div className="mt-14 h-80 animate-pulse rounded-2xl bg-surface-2" />}
      </section>

      {/* How we know: the numbers behind the demo, not adjectives */}
      {la && laHoods.length === 2 && <HowWeKnow r={la} hoods={laHoods} ranks={ranks} />}

      {/* Why Qloo */}
      {la && laHoods.length === 2 && <WhyQloo r={la} hoods={laHoods} ranks={ranks} />}

      {/* What you get: what one run hands over */}
      <section className="mx-auto max-w-7xl px-5 pt-24 md:px-8">
        <div className="kicker text-center">What you get</div>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">The deliverables, not a mock-up.</h2>
        <Deliverables images={sides.flat().map((e) => e.image)} />
      </section>

      {/* Markets */}
      <section className="mx-auto max-w-7xl px-5 pt-24 md:px-8">
        <div className="kicker text-center">Available markets</div>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">Five markets today. More on the way.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-ink-2">Any city Qloo knows can be briefed; these are the ones we have tested end to end.</p>
        <Markets />
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-8">
        <div className="kicker text-center">Pricing</div>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-statement leading-[1.02] tracking-tight">
          A culture deck costs $20k. This doesn't.
        </h2>
        <div className="mt-12">
          <PricingTiers />
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
