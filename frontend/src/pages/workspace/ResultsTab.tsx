import { ArrowRight, Download, FileText, Lightbulb, Scale, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { type Geist } from '../../lib/api'
import { chosenConcept, colorOf, personaName, placeName } from '../../lib/geists'
import { Chart, axisStyle, tokens } from '../../components/Chart'
import { GenericPoster, Poster } from '../../components/Poster'
import { OverlapBars } from '../../components/Charts'
import { Card, Kpi, LinkButton, SectionTitle, Source } from '../../components/ui'
import { useTheme } from '../../theme'
import { useWorkspace } from './Workspace'
import { useCpmGrid } from '../../components/MediaNumbers'
import { fisherGreater, pText } from '../../lib/stats'

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en', {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  })

function NumberInput({
  label,
  value,
  onChange,
  suffix,
  step = 0.1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
}) {
  return (
    <label className="block text-sm">
      <span className="text-mute">{label}</span>
      <span className="mt-1 flex items-center rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-10 w-full bg-transparent outline-none"
        />
        {suffix && <span className="text-mute">{suffix}</span>}
      </span>
    </label>
  )
}

function Opportunity({ icon, title, body, to, cta }: { icon: ReactNode; title: string; body: string; to: string; cta: string }) {
  return (
    <div className="flex gap-4 border-t border-line py-4 first:border-0 first:pt-0">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 line-clamp-2 max-w-3xl text-sm text-ink-2" title={body}>
          {body}
        </p>
      </div>
      <Link to={to} className="inline-flex shrink-0 items-center gap-1 self-center text-sm font-medium text-link">
        {cta} <ArrowRight size={14} />
      </Link>
    </div>
  )
}

export function ResultsTab() {
  const { campaign, result } = useWorkspace()
  const { theme } = useTheme()
  const groups = result.groups

  // --- Real KPIs from the run
  const kpis = useMemo(() => {
    // Overlap of the raw Qloo culture maps: independent of the ledger math.
    const hood = result.overlap?.neighborhoods[0]
    const pairs = result.overlap?.markets ?? []
    const cityAvg = pairs.reduce((a, p) => a + p.pct, 0) / Math.max(1, pairs.length)
    const closest = [...pairs].sort((a, b) => b.pct - a.pct)[0]
    const strongest = groups.flatMap((g) => g.ledger.map((e) => ({ e, g }))).sort((a, b) => b.e.lift - a.e.lift)[0]
    const citedIds = new Set(
      groups.flatMap((g) => {
        const c = chosenConcept(g)
        return c ? [c.big_idea, c.headline, c.body, c.music, ...c.moodboard, ...c.partners, ...c.channels].flatMap((x) => x?.because ?? []) : []
      }),
    )
    return { hood, cityAvg, closest, strongest, cited: citedIds.size }
  }, [groups, result])

  // --- Measured uplift: chosen concepts vs the LLM-only concept, same personas
  const paired = groups.filter((g) => chosenConcept(g)?.panel && g.baseline_panel)
  const ours = paired.reduce((a, g) => a + chosenConcept(g)!.panel!.avg.attention, 0) / Math.max(1, paired.length)
  const base = paired.reduce((a, g) => a + g.baseline_panel!.avg.attention, 0) / Math.max(1, paired.length)
  const stopsOurs = paired.reduce((a, g) => a + chosenConcept(g)!.panel!.stop_scrolling, 0)
  const stopsBase = paired.reduce((a, g) => a + g.baseline_panel!.stop_scrolling, 0)
  const panelTotal = paired.reduce((a, g) => a + g.baseline_panel!.size, 0)
  const uplift = base > 0 ? Math.min(2, Math.max(-0.5, ours / base - 1)) : 0
  // Uncertainty: 95% intervals on both mean attentions from the individual persona ratings, combined
  // conservatively (low end of ours over high end of generic, and the other way round).
  const range = useMemo(() => {
    const stat = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
      return { m, se: sd / Math.sqrt(Math.max(1, xs.length)) }
    }
    const o = stat(paired.flatMap((g) => chosenConcept(g)!.panel!.personas.map((p) => p.attention)))
    const b = stat(paired.flatMap((g) => g.baseline_panel!.personas.map((p) => p.attention)))
    if (!paired.length || b.m <= 0) return null
    const clamp = (v: number) => Math.min(2, Math.max(-0.5, v))
    return { lo: clamp((o.m - 1.96 * o.se) / (b.m + 1.96 * b.se) - 1), hi: clamp((o.m + 1.96 * o.se) / Math.max(0.1, b.m - 1.96 * b.se) - 1) }
  }, [paired])

  // --- Forecast inputs (user's own numbers; defaults are labeled assumptions)
  const [spend, setSpend] = useState(result.plan.budget || 10000)
  // The blended CPM from the plan's CPM grid (Media plan tab), so both tabs agree.
  const grid = useCpmGrid(campaign.id, result.plan)
  const [cpm, setCpm] = useState(() => Math.round(grid.blended * 100) / 100 || 8)
  const [ctr, setCtr] = useState(1.0)
  const [cvr, setCvr] = useState(2.0)
  const scenarios = useMemo(() => {
    const impressions = (spend / Math.max(cpm, 0.01)) * 1000
    return [
      { name: 'One generic campaign', k: 0 },
      { name: 'Conservative', k: 0.25 },
      { name: 'Expected', k: 0.5 },
      { name: 'Optimistic', k: 1 },
    ].map((s) => {
      const clicks = impressions * (ctr / 100) * (1 + s.k * uplift)
      const conversions = clicks * (cvr / 100)
      return {
        ...s,
        impressions,
        clicks,
        conversions,
        cpa: conversions > 0 ? spend / conversions : 0,
      }
    })
  }, [spend, cpm, ctr, cvr, uplift])

  const forecastChart = useMemo(() => {
    const t = tokens()
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: scenarios.map((s) => s.name),
        ...axisStyle(),
        axisLabel: { color: t.ink2, fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: 'value' as const,
        ...axisStyle(),
        name: 'Conversions',
        nameTextStyle: { color: t.mute, fontSize: 11 },
      },
      series: [
        {
          type: 'bar' as const,
          data: scenarios.map((s, i) => ({
            value: Math.round(s.conversions),
            itemStyle: {
              color: i === 0 ? t.mute : i === 2 ? t.coral : t.amber,
              borderRadius: [8, 8, 0, 0],
            },
          })),
          barMaxWidth: 56,
          label: {
            show: true,
            position: 'top' as const,
            color: t.ink2,
            fontSize: 11,
          },
        },
      ],
    }
  }, [scenarios, theme])

  // --- Improvement opportunities, ranked
  const opportunities = useMemo(() => {
    const out: { score: number; node: ReactNode }[] = []
    for (const g of groups) {
      const c = chosenConcept(g)
      if (c?.panel?.fix)
        out.push({
          score: c.panel.size - c.panel.stop_scrolling,
          node: (
            <Opportunity
              key={`fix-${g.key}`}
              icon={<Lightbulb size={16} />}
              title={`Sharpen "${c.headline?.text}" for ${personaName(g)}`}
              body={c.panel.fix}
              to={`../creatives?g=${encodeURIComponent(g.key)}&c=${c.id}#seance`}
              cta="Review"
            />
          ),
        })
      if (c?.panel && g.baseline_panel && g.baseline_panel.stop_scrolling >= c.panel.stop_scrolling)
        out.push({
          score: 6,
          node: (
            <Opportunity
              key={`generic-${g.key}`}
              icon={<Scale size={16} />}
              title={`In ${placeName(g)}, a generic message holds up`}
              body={`The LLM-only concept stops ${g.baseline_panel.stop_scrolling} of ${g.baseline_panel.size}, as many as the tailored one. Consider a cheaper broad creative here and move budget to zones where taste makes the difference.`}
              to="../plan"
              cta="Rebalance"
            />
          ),
        })
      const best = [...(g.concepts ?? [])].sort((a, b) => (b.panel?.stop_scrolling ?? 0) - (a.panel?.stop_scrolling ?? 0))[0]
      if (best && c && best.id !== c.id && (best.panel?.stop_scrolling ?? 0) > (c.panel?.stop_scrolling ?? 0))
        out.push({
          score: 7,
          node: (
            <Opportunity
              key={`swap-${g.key}`}
              icon={<Sparkles size={16} />}
              title={`A stronger concept is waiting in ${placeName(g)}`}
              body={`"${best.headline?.text}" stops ${best.panel?.stop_scrolling} of ${best.panel?.size}, more than the one in the plan.`}
              to={`../creatives?g=${encodeURIComponent(g.key)}&c=${best.id}`}
              cta="Compare"
            />
          ),
        })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6)
  }, [groups])

  // Zones where the generic LLM-only concept holds up: said plainly, not hidden.
  const generic = groups.filter((g) => {
    const c = chosenConcept(g)
    return c?.panel && g.baseline_panel && g.baseline_panel.stop_scrolling >= c.panel.stop_scrolling
  })
  const hero: Geist | undefined = groups.find((g) => g.kind === 'neighborhood') ?? groups[0]
  const heroConcept = hero && chosenConcept(hero)

  return (
    <div className="flex flex-col gap-10">
      {/* Editorial key insight */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="kicker">Key insight</div>
          {kpis.hood && kpis.closest ? (
            <>
              <h2 className="mt-3 font-display text-statement leading-[1.04] tracking-tight">
                {kpis.hood.a} and {kpis.hood.b} have less in common than {kpis.closest.a} and {kpis.closest.b}.
              </h2>
              <p className="mt-3 max-w-2xl text-ink-2">
                The two neighborhoods share {fmt(kpis.hood.pct * 100)}% of their top Qloo affinities; the two most similar cities in the brief share{' '}
                {fmt(kpis.closest.pct * 100)}%. A single city-wide campaign would talk past most of it.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-3 font-display text-statement leading-[1.04] tracking-tight">
                {groups.length} distinct tastes, {groups.length} campaigns.
              </h2>
              <p className="mt-3 max-w-2xl text-ink-2">
                On average the markets in this brief share only {fmt(kpis.cityAvg * 100)}% of their top Qloo affinities. A single campaign would talk past the
                rest.
              </p>
            </>
          )}
        </div>
        {result.overlap && (result.overlap.markets.length > 1 || result.overlap.neighborhoods.length > 0) && (
          <Card className="p-5">
            <div className="t-h3">How far apart the tastes are</div>
            <p className="t-caption mt-1">Share of top Qloo titles each pair has in common. Neighborhoods in coral.</p>
            <div className="mt-3">
              <OverlapBars overlap={result.overlap} />
            </div>
          </Card>
        )}
      </div>

      <Card className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={groups.length} label="Taste zones and neighborhoods" />
        <Kpi
          value={`${fmt((kpis.hood?.pct ?? kpis.cityAvg) * 100)}%`}
          label={kpis.hood ? `Taste overlap, ${kpis.hood.a} and ${kpis.hood.b}` : 'Average taste overlap between markets'}
          sub="Share of top Qloo entities in common"
        />
        <Kpi
          value={`${kpis.strongest?.e.lift.toFixed(1)}×`}
          label="Strongest lift"
          sub={`${kpis.strongest?.e.name}, ${kpis.strongest ? placeName(kpis.strongest.g) : ''}`}
        />
        <Kpi value={kpis.cited} label="Qloo entities cited in the plan" />
      </Card>

      {generic.length > 0 && (
        <p className="rounded-xl bg-amber-soft p-4 text-sm text-ink">
          <b>Where taste doesn't change the answer, Tastegeist says so.</b> In {generic.map((g) => placeName(g)).join(' and ')}, the generic concept did as well
          with the same personas: a broad creative is enough there, and the tailoring budget works harder in the other zones.
        </p>
      )}

      {/* LLM-only vs Tastegeist */}
      {result.llm_only && hero && heroConcept && (
        <section>
          <SectionTitle title="The same brief without Qloo" sub="Same model, same personas. Without the culture data it writes one ad for everyone." />
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <span className="kicker">LLM only</span>
                <span className="text-xs text-mute">0 Qloo entities cited</span>
              </div>
              <div className="mt-4">
                <GenericPoster headline={result.llm_only.headline} />
              </div>
              <p className="mt-4 line-clamp-4 text-sm text-ink-2">{result.llm_only.big_idea}</p>
              <div className="mt-3 line-clamp-2 text-xs text-mute">Partners: {result.llm_only.partners.join(' · ')}</div>
              {hero.baseline_panel && (
                <div className="mt-4 text-sm">
                  <b>
                    {hero.baseline_panel.stop_scrolling} of {hero.baseline_panel.size}
                  </b>{' '}
                  {placeName(hero)} personas would stop scrolling
                </div>
              )}
            </Card>
            <Card className="p-5 ring-2 ring-coral">
              <div className="flex items-center justify-between">
                <span className="kicker text-coral">Tastegeist · {placeName(hero)}</span>
                <span className="text-xs text-coral">ledger-cited</span>
              </div>
              <div className="mt-4">
                <Poster g={hero} c={heroConcept} color={colorOf(result, hero.key)} productName={campaign.product_name} size="thumb" />
              </div>
              <p className="mt-4 line-clamp-4 text-sm text-ink-2">{heroConcept.big_idea?.text}</p>
              <div className="mt-3 text-xs text-mute">Partners: {heroConcept.partners.map((p) => p.text.split(':')[0]).join(' · ')}</div>
              {heroConcept.panel && (
                <div className="mt-4 text-sm">
                  <b>
                    {heroConcept.panel.stop_scrolling} of {heroConcept.panel.size}
                  </b>{' '}
                  {placeName(hero)} personas would stop scrolling
                </div>
              )}
            </Card>
          </div>
        </section>
      )}

      {/* Benefit forecast */}
      <section>
        <SectionTitle title="What it could mean for your numbers" sub="The measured uplift applied to your own baseline. A scenario model, not a promise." />
        <div className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="space-y-4 p-5">
            <div className="rounded-xl bg-coral-soft p-4">
              <div className="text-xs text-coral">Measured attention uplift</div>
              <div className="t-metric-lg mt-1 text-coral">
                {uplift >= 0 ? '+' : ''}
                {fmt(uplift * 100)}%
              </div>
              <div className="mt-1 text-xs text-ink-2">
                Tailored concepts: {ours.toFixed(2)}/5 attention, {stopsOurs} of {panelTotal} stop. Generic: {base.toFixed(2)}/5, {stopsBase} of {panelTotal}.
              </div>
              {panelTotal > 0 && (
                <div className="mt-2 border-t border-coral/20 pt-2 text-xs text-ink-2">
                  {(() => {
                    const p = fisherGreater(stopsOurs, panelTotal, stopsBase, panelTotal)
                    return p < 0.05
                      ? `Unlikely to be chance: ${pText(p)} (Fisher exact, one-sided, ${panelTotal} personas per side). Synthetic personas, so treat it as a strong hypothesis for the A/B test.`
                      : `Not yet distinguishable from chance: ${pText(p)} (Fisher exact, ${panelTotal} personas per side). Let the A/B test decide.`
                  })()}
                </div>
              )}
            </div>
            <NumberInput label="Media spend" value={spend} onChange={setSpend} suffix={result.plan.currency} step={1000} />
            <NumberInput label="CPM (cost per 1,000 impressions)" value={cpm} onChange={setCpm} suffix={result.plan.currency} />
            <NumberInput label="Baseline click-through rate" value={ctr} onChange={setCtr} suffix="%" />
            <NumberInput label="Conversion rate after click" value={cvr} onChange={setCvr} suffix="%" />
            <Source>Defaults are assumptions; replace them with your own benchmarks.</Source>
          </Card>
          <Card className="p-5">
            <Chart option={forecastChart} height={260} theme={theme} label="Projected conversions per scenario" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-mute">
                  <tr>
                    <th className="py-2 font-medium">Scenario</th>
                    <th className="py-2 font-medium">Uplift applied</th>
                    <th className="py-2 font-medium">Clicks</th>
                    <th className="py-2 font-medium">Conversions</th>
                    <th className="py-2 font-medium">Cost per conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s, i) => (
                    <tr key={s.name} className={`border-t border-line ${i === 2 ? 'font-semibold' : ''}`}>
                      <td className="py-2">{s.name}</td>
                      <td className="py-2">{i === 0 ? 'none' : `${fmt(s.k * 100)}% of measured`}</td>
                      <td className="py-2">{fmt(s.clicks)}</td>
                      <td className="py-2">{fmt(s.conversions)}</td>
                      <td className="py-2">
                        {result.plan.currency} {fmt(s.cpa, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <Source>
                Scenario model, directional: applies a share of the synthetic séance uplift to click-through. Validate with the A/B tests in the media plan.
              </Source>
            </div>
          </Card>
        </div>
        <Card className="mt-6 p-5">
          <h3 className="t-h3">Assumptions and uncertainty</h3>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-ink-2">
              <p>
                <b className="text-ink">The formula.</b> Conversions = spend / CPM × 1,000 × click-through × (1 + share × uplift) × conversion rate. Expected,
                with your inputs: {result.plan.currency} {fmt(spend)} / {fmt(cpm, 2)} × 1,000 = {fmt(scenarios[0].impressions)} impressions × {fmt(ctr, 2)}% ×{' '}
                {(1 + 0.5 * uplift).toFixed(2)} × {fmt(cvr, 2)}% = <b className="text-ink">{fmt(scenarios[2].conversions)}</b>.
              </p>
              {range && (
                <p>
                  <b className="text-ink">How wide it could be.</b> From the individual persona ratings, the attention uplift lies somewhere between{' '}
                  {range.lo >= 0 ? '+' : ''}
                  {fmt(range.lo * 100)}% and +{fmt(range.hi * 100)}% (95%, {panelTotal} personas per side). At the full measured effect that means{' '}
                  {fmt(scenarios[0].conversions * (1 + range.lo))} to {fmt(scenarios[0].conversions * (1 + range.hi))} conversions, against{' '}
                  {fmt(scenarios[0].conversions)} for one generic campaign.
                  {range.lo <= 0 ? ' The low end includes no effect at all.' : ' Even the low end beats generic.'}
                </p>
              )}
            </div>
            <ul className="space-y-2 text-sm">
              {[
                ['Measured', `Attention of ${panelTotal} synthetic personas per side, same people, tailored vs generic concept.`],
                ['Assumed', 'Attention moves click-through one for one. The scenarios apply 25%, 50% or 100% of it because real feeds are noisier.'],
                ['Assumed', 'CPM, click-through and conversion rate are placeholders until you enter your own.'],
                ['Not modelled', 'Frequency, ad fatigue, seasonality, competition and the extra cost of producing several creatives.'],
              ].map(([k, v], i) => (
                <li key={i} className="flex items-baseline gap-3">
                  <span className={`w-24 shrink-0 text-xs font-medium ${k === 'Measured' ? 'text-mint' : k === 'Assumed' ? 'text-amber' : 'text-mute'}`}>
                    {k}
                  </span>
                  <span className="text-ink-2">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card className="mt-6 grid gap-6 p-5 sm:grid-cols-3">
          <Kpi value="$20k-80k" label="Typical agency culture deck" sub="Source: market estimate in the Tastegeist spec" />
          <Kpi value="2-4 weeks" label="Typical agency turnaround" sub="Source: market estimate in the Tastegeist spec" />
          <Kpi value="Minutes" label="Tastegeist, re-runs on every edit" accent="var(--mint)" />
        </Card>
      </section>

      {/* Improvement opportunities */}
      <section>
        <SectionTitle title="What to do next" sub="Ranked by expected impact." />
        <Card className="mt-5 p-5">
          {opportunities.length ? (
            opportunities.map((o) => o.node)
          ) : (
            <p className="text-sm text-mute">No open opportunities. Every zone runs its strongest concept.</p>
          )}
        </Card>
      </section>

      {/* Close the loop: the deliverable */}
      <section className="card flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
        <div>
          <h2 className="font-display text-title leading-tight">
            Ready to hand over? <em className="text-mute">Send the report.</em>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-2">
            An editorial report of this campaign for your client or team: the finding, one chapter per taste zone, the plan. Anyone with the link can read it,
            and it prints to PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/report/${campaign.id}`} variant="primary">
            <FileText size={16} /> Open the client report
          </LinkButton>
          <LinkButton to="../plan#export">
            <Download size={16} /> Export the plan
          </LinkButton>
        </div>
      </section>
    </div>
  )
}
