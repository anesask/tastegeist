import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { rgb, type RunResult } from '../lib/api'
import { chosenConcept, cited, colorOf, personaName } from '../lib/geists'

const money = (v: number, cur: string) => `${cur === 'USD' ? '$' : cur === 'EUR' ? '€' : `${cur} `}${Math.round(v / 1000)}k`

function Step({ n, title, text, children, i }: { n: string; title: string; text: string; children: ReactNode; i: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      className="card relative flex flex-col overflow-hidden p-5"
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="tabular text-xs text-mute">{n}</span>
      {/* The step's real output, from the Los Angeles demo */}
      <div className="mt-4 h-40 overflow-hidden rounded-xl bg-surface-2 p-3">{children}</div>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p>
    </motion.li>
  )
}

/** How it works, shown with what each step actually produced for the Los Angeles demo. */
export function HowItWorks({ r }: { r: RunResult }) {
  const ref = useRef<HTMLOListElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 60%'] })
  const line = useSpring(scrollYProgress, { stiffness: 80, damping: 24 })
  const hoods = r.groups.filter((g) => g.kind === 'neighborhood').slice(0, 2)
  const sides = hoods.length === 2 ? hoods : r.groups.slice(0, 2)
  const overlap = r.overlap?.neighborhoods[0]?.pct
  // The creative shown is the zone where tailoring beat the generic ad by the most.
  const gap = (x: (typeof r.groups)[number]) => (chosenConcept(x)?.panel?.stop_scrolling ?? 0) - (x.baseline_panel?.stop_scrolling ?? 0)
  const g = r.groups.slice().sort((a, b) => gap(b) - gap(a))[0]
  const c = g ? chosenConcept(g) : undefined
  const refs = g && c?.headline ? cited(g, c.headline.because).slice(0, 1) : []
  const zones = r.plan.zones.filter((z) => z.budget > 0)
  const total = zones.reduce((a, z) => a + z.budget, 0) || 1

  return (
    <div className="relative mt-14">
      {/* The thread through the steps, drawn as you scroll */}
      <div className="absolute left-0 right-0 top-[5.5rem] hidden h-px bg-line lg:block" aria-hidden>
        <motion.div className="h-full origin-left bg-ink" style={{ scaleX: line }} />
      </div>
      <ol ref={ref} className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Step
          i={0}
          n="01"
          title="Brief"
          text="Your product and where to run it: a country, a few cities or one city in depth. Tastegeist reads the product through brands and titles its buyers already love."
        >
          <div className="text-xs text-mute">Product</div>
          <div className="truncate font-medium">{r.brief.product_name || r.brief.title}</div>
          <div className="mt-2 text-xs text-mute">Read through</div>
          <div className="mt-1 flex gap-1.5">
            {r.anchors.slice(0, 3).map((a) =>
              a.image ? (
                <img key={a.id} src={a.image} alt={a.name} title={a.name} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <span key={a.id} className="grid h-12 w-12 place-items-center rounded-lg bg-surface text-[10px]">
                  {a.name}
                </span>
              ),
            )}
          </div>
        </Step>

        <Step
          i={1}
          n="02"
          title="Taste zones"
          text="Qloo maps what every place over-indexes on. Places that share a taste become one zone; places that don't get their own."
        >
          <div className="relative h-full">
            {sides.map((s, si) => {
              const img = s.ledger.find((e) => e.image)?.image
              return (
                <div key={s.key} className="absolute top-1 flex flex-col items-center" style={{ left: si ? '50%' : '8%' }}>
                  <div className="h-20 w-20 overflow-hidden rounded-full ring-[3px]" style={{ ['--tw-ring-color' as string]: rgb(colorOf(r, s.key)) }}>
                    {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider">{s.label}</div>
                </div>
              )
            })}
            {overlap != null && (
              <div className="absolute bottom-1 left-0 right-0 text-center text-xs text-ink-2">
                <b className="text-ink">{Math.round(overlap * 100)}%</b> of top tastes shared
              </div>
            )}
          </div>
        </Step>

        <Step
          i={2}
          n="03"
          title="Creatives"
          text="Three concepts per zone, every line cited to a Qloo title, then tested on synthetic locals against one generic ad."
        >
          {c?.headline && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-mute">{personaName(g)}</div>
              <div className="mt-1 line-clamp-2 font-display text-xl leading-tight">{c.headline.text}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {refs.map((e) => (
                  <span key={e.id} className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-surface px-1.5 py-0.5 text-[10px]">
                    {e.image && <img src={e.image} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />}
                    {e.name}
                  </span>
                ))}
              </div>
              {c.panel && (
                <div className="mt-2 text-xs text-ink-2">
                  <b className="text-ink">
                    {c.panel.stop_scrolling} of {c.panel.size}
                  </b>{' '}
                  stop{g.baseline_panel ? `, ${g.baseline_panel.stop_scrolling} for generic` : ''}
                </div>
              )}
            </>
          )}
        </Step>

        <Step i={3} n="04" title="Media plan" text="Budget by taste strength, a playbook per zone, audiences, geo targets and an A/B test, ready to hand over.">
          <div className="text-xs text-mute">
            {money(r.plan.budget, r.plan.currency)} across {zones.length} zones
          </div>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full">
            {zones.map((z) => (
              <motion.div
                key={z.key}
                style={{ background: rgb(colorOf(r, z.key)) }}
                initial={{ width: 0 }}
                whileInView={{ width: `${(z.budget / total) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
          <ul className="mt-2.5 space-y-1">
            {zones.slice(0, 4).map((z) => (
              <li key={z.key} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: rgb(colorOf(r, z.key)) }} />
                <span className="min-w-0 flex-1 truncate">{z.label}</span>
                <span className="tabular text-ink-2">{money(z.budget, r.plan.currency)}</span>
              </li>
            ))}
          </ul>
        </Step>
      </ol>
    </div>
  )
}
