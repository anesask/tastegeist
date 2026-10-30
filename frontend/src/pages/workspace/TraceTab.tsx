import { Bot, ChevronDown, Database, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { fmtDate, type Trace } from '../../lib/api'
import { chosenConcept, personaName, placeName } from '../../lib/geists'
import { Kpi, Source } from '../../components/ui'
import { useWorkspace } from './Workspace'

type Call = Trace['calls'][number]

/** The calls made between one step and the next, folded under that step. */
function CallGroup({ calls }: { calls: Call[] }) {
  const [open, setOpen] = useState(false)
  if (!calls.length) return null
  const q = calls.filter((c) => c.kind === 'qloo').length
  const l = calls.length - q
  const usd = calls.reduce((a, c) => a + c.usd, 0)
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs text-mute transition hover:text-ink"
        aria-expanded={open}
      >
        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
        {[q && `${q} Qloo ${q === 1 ? 'call' : 'calls'}`, l && `${l} model ${l === 1 ? 'call' : 'calls'}`].filter(Boolean).join(' · ')}
        {usd > 0 && ` · $${usd.toFixed(3)}`}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {calls.map((c, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-medium ${c.kind === 'qloo' ? 'bg-amber-soft text-amber' : 'bg-lilac-soft text-lilac'}`}>
                {c.kind === 'qloo' ? 'Qloo' : 'Model'}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-2" title={c.note ?? c.label}>
                {c.label}
                {c.note && <span className="text-mute"> · {c.note}</span>}
              </span>
              {c.model && <span className="hidden text-mute sm:inline">{c.model.replace('claude-', '')}</span>}
              <span className="tabular w-16 text-right text-mute">{c.cached ? 'cached' : `${c.ms} ms`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Decision({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-ink-2">{icon}</span>
      <div>
        <div className="t-h3">{title}</div>
        <p className="mt-1 text-sm text-ink-2">{children}</p>
      </div>
    </li>
  )
}

export function TraceTab() {
  const { campaign, result } = useWorkspace()
  const tr = result.trace
  const timeline = useMemo(() => {
    if (!tr) return []
    return tr.steps.map((s, i) => {
      const end = tr.steps[i + 1]?.t ?? Infinity
      return { ...s, calls: tr.calls.filter((c) => c.t >= s.t && c.t < end) }
    })
  }, [tr])

  const zones = result.groups.filter((g) => g.kind === 'zone')
  const hoods = result.groups.filter((g) => g.kind === 'neighborhood')
  const overlap = (a: string, b: string) => result.overlap?.markets.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))
  const concepts = result.groups.reduce((a, g) => a + (g.concepts?.length ?? 0), 0)

  if (!tr)
    return (
      <div className="card p-6 text-sm text-ink-2">
        This campaign was generated before runs were recorded. Generate it again to see every step the agent takes.
      </div>
    )

  const t = tr.totals
  const replay = t.qloo_cached === t.qloo_calls && t.llm_cached === t.llm_calls
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div>
          <div className="kicker">How it was made</div>
          <h2 className="mt-3 font-display text-statement leading-[1]">
            {t.qloo_calls} Qloo calls, {t.llm_calls} model calls. <em className="text-mute">One campaign.</em>
          </h2>
          <p className="measure mt-4 text-ink-2">
            Tastegeist is an agent: it reads the brief, decides which places and references to ask Qloo about, turns the answers into audiences, writes for
            each, rejects any line it can't cite, tests the result against a control and budgets the plan. Every step is below.
          </p>
        </div>
        <div className="card grid grid-cols-2 gap-5 p-5">
          <Kpi value={t.qloo_calls} label="Qloo calls" sub={`${t.qloo_cached} served from cache`} />
          <Kpi value={t.llm_calls} label="Model calls" sub={`${t.llm_cached} from cache`} />
          <Kpi value={`$${t.usd.toFixed(2)}`} label="Model spend" sub={replay ? 'Replayed from cache' : 'This run'} />
          <Kpi value={t.rejected_elements} label="Uncited lines rejected" sub="By the citation validator" />
        </div>
      </div>

      <section className="card p-6 md:p-8">
        <h3 className="t-h2">What the agent decided</h3>
        <ol className="mt-6 space-y-6">
          <Decision icon={<Bot size={16} />} title="Read the brief as a set of tastes">
            A new product has no Qloo history of its own, so it was anchored to {result.anchors.map((a) => a.name).join(', ')}: real references its audience
            already loves. Qloo resolved each to an entity.
          </Decision>
          <Decision icon={<Database size={16} />} title={`Mapped the culture of ${result.markets.length + hoods.length} places`}>
            Five domains per place (music, TV, film, podcasts, brands), 50 titles each, with the anchors weighted low so the place, not the product, shapes the
            answer. Lift ranks what each place over-indexes on against the others.
          </Decision>
          <Decision
            icon={<Database size={16} />}
            title={
              result.groups.length > result.markets.length
                ? `Found ${result.groups.length} audiences in ${result.markets.length} markets`
                : `Grouped ${result.markets.length} markets into ${result.groups.length} audiences`
            }
          >
            {zones
              .map((z) => {
                const [a, b] = z.markets
                const o = b ? overlap(a, b) : undefined
                return `${placeName(z)} became ${personaName(z)}${o ? ` (${Math.round(o.pct * 100)}% of their top tastes in common)` : ''}`
              })
              .join('; ')}
            {hoods.length > 0 &&
              `. Inside ${result.splits.map((s) => s.city).join(' and ')}, the neighborhoods were read separately: ${hoods.map((h) => `${h.label} is ${personaName(h)}`).join(', ')}.`}
          </Decision>
          <Decision icon={<ShieldCheck size={16} />} title={`Wrote ${concepts} concepts and checked every line`}>
            Three directions per audience, written only from that audience's ledger. A validator removed{' '}
            {t.rejected_elements === 0
              ? 'no lines this time: every element cited a Qloo entity'
              : `${t.rejected_elements} uncited ${t.rejected_elements === 1 ? 'line' : 'lines'}`}
            .
          </Decision>
          <Decision icon={<Bot size={16} />} title="Tested them against a control">
            Each concept went to 8 synthetic locals built from Qloo data; the same personas judged a generic concept written without Qloo. The plan uses the
            strongest per audience: {result.groups.map((g) => `“${(chosenConcept(g)?.headline?.text ?? '-').replace(/\.$/, '')}”`).join(', ')}.
          </Decision>
          <Decision icon={<Database size={16} />} title="Budgeted the plan">
            {result.plan.currency} {Math.round(result.plan.budget).toLocaleString('en-GB')} split by ledger strength, flighted in three phases, with A/B tests
            sized for a 20% uplift. Deterministic: the same inputs give the same plan.
          </Decision>
        </ol>
      </section>

      <section className="card p-6 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="t-h2">The run, step by step</h3>
          <Source>
            {fmtDate(tr.finished * 1000)}, {tr.seconds.toFixed(1)} s{replay ? ', replayed from cache' : ''}
          </Source>
        </div>
        <ol className="relative mt-6 border-l border-line pl-6">
          {timeline.map((s, i) => (
            <li key={i} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-ink" />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="tabular text-xs text-mute">{s.t.toFixed(1)} s</span>
                <span className="text-sm text-ink">{s.text}</span>
              </div>
              <CallGroup calls={s.calls} />
            </li>
          ))}
        </ol>
        {tr.warnings.length > 0 && (
          <div className="mt-6 rounded-xl bg-amber-soft p-4 text-sm">
            <div className="font-medium">Handled along the way</div>
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              {tr.warnings.map((w, i) => (
                <li key={i}>{w.text}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <p className="t-caption">
        Campaign {campaign.id}. Qloo calls are cached server-side and never leave it; model calls are cached too, so a demo replays for free.
      </p>
    </div>
  )
}
