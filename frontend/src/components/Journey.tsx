import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Term } from './Term'

/** The workspace is one path, not seven dashboards: understand, decide, plan, hand over. */
const STAGES = ['Understand', 'Decide', 'Plan', 'Hand over'] as const

const TABS: Record<string, { stage: (typeof STAGES)[number]; what: ReactNode; next?: { to: string; label: string; why: string } }> = {
  brief: {
    stage: 'Understand',
    what: (
      <>
        What you asked for, and the <Term k="anchors">references</Term> Qloo reads your product through.
      </>
    ),
    next: { to: 'zones', label: 'See the taste zones', why: 'Where the audiences are, and how they differ.' },
  },
  zones: {
    stage: 'Understand',
    what: (
      <>
        The audiences (<Term k="geist">geists</Term>) Qloo found, where they live, and why they were grouped into <Term k="zone">taste zones</Term>.
      </>
    ),
    next: { to: 'culture', label: 'Meet each place', why: 'What every audience listens to, watches, wears and reads.' },
  },
  culture: {
    stage: 'Understand',
    what: (
      <>
        The culture of one place in depth, ranked by <Term k="lift" />. Click any title to see how strongly every place leans to it.
      </>
    ),
    next: { to: 'creatives', label: 'Pick the concepts', why: 'Three ideas per audience, each tested on synthetic locals.' },
  },
  creatives: {
    stage: 'Decide',
    what: (
      <>
        Three concepts per audience, every line cited from the zone's <Term k="ledger" />, tested in the <Term k="seance">séance</Term>. Pick the one each zone
        runs.
      </>
    ),
    next: { to: 'plan', label: 'Plan the media', why: 'Budget, playbook, audiences and A/B tests per zone.' },
  },
  plan: {
    stage: 'Plan',
    what: (
      <>
        How the budget splits by <Term k="lift" />, and a playbook per zone: where to place it, who to bring in, what to do each week.
      </>
    ),
    next: { to: 'results', label: 'Check the evidence', why: 'How sure we are, against a generic control.' },
  },
  results: {
    stage: 'Hand over',
    what: (
      <>
        The key insight, the <Term k="seance">séance</Term> against a generic control, what it could mean for your numbers, and what to do next.
      </>
    ),
    next: { to: 'trace', label: 'See how it was made', why: 'Every decision and every Qloo and model call.' },
  },
  trace: {
    stage: 'Hand over',
    what: 'Every step the agent took, in order. Useful for anyone who asks how a number came about.',
  },
}

function useTab() {
  const { pathname } = useLocation()
  const tab = pathname.split('/').filter(Boolean).at(-1) ?? ''
  return TABS[tab] ? tab : null
}

/** One line under the tabs: which stage you're in and what this tab is for. */
export function TabIntro() {
  const tab = useTab()
  if (!tab) return null
  const t = TABS[tab]
  const i = STAGES.indexOf(t.stage)
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <ol className="flex items-center gap-1.5" aria-label="Where you are">
        {STAGES.map((s, j) => (
          <li key={s} className={`flex items-center gap-1.5 ${j === i ? 'font-medium text-ink' : j < i ? 'text-ink-2' : 'text-mute'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${j <= i ? 'bg-ink' : 'bg-line'}`} />
            {s}
            {j < STAGES.length - 1 && <span className="mx-1 h-px w-4 bg-line" />}
          </li>
        ))}
      </ol>
      <p className="min-w-0 text-ink-2">{t.what}</p>
    </div>
  )
}

/** The end of every tab: where to go next and what you'll get there. */
export function NextStep({ reportId }: { reportId: string }) {
  const tab = useTab()
  if (!tab) return null
  const next = TABS[tab].next ?? { to: `/report/${reportId}`, label: 'Open the client report', why: 'Everything above as one shareable, printable document.' }
  return (
    <Link to={next.to} className="card card-interactive mt-10 flex items-center justify-between gap-4 p-5 md:p-6">
      <div>
        <div className="kicker">Next</div>
        <div className="t-h2 mt-1">{next.label}</div>
        <p className="mt-1 text-sm text-ink-2">{next.why}</p>
      </div>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
        <ArrowRight size={18} />
      </span>
    </Link>
  )
}
