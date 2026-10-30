import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { DOMAIN_LABEL, type Cited, type Concept, type Geist, type LedgerEntity } from '../lib/api'
import { cited } from '../lib/geists'
import { Source } from './ui'

function Ref({ e, rank }: { e: LedgerEntity; rank: number }) {
  const ratio = e.lift_outside ? e.lift / e.lift_outside : null
  return (
    <li className="flex items-center gap-2.5" title={`Qloo entity ${e.id}`}>
      {e.image ? (
        <img src={e.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md bg-[#f3efe7] object-cover" />
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-md bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{e.name}</div>
        <div className="t-caption">
          {DOMAIN_LABEL[e.domain]} · #{rank} in the ledger
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-medium">{e.lift.toFixed(1)}× here</div>
        {e.lift_outside != null && (
          <div className="tabular t-caption">
            {e.lift_outside.toFixed(1)}× elsewhere{ratio ? `, ${ratio.toFixed(1)}× gap` : ''}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * The science of a concept: each line next to the Qloo titles it was written from, with the numbers
 * that put those titles in this zone's ledger. Nothing here is new data; it makes the citation chain visible.
 */
export function DataToLine({ g, c, highlight }: { g: Geist; c: Concept; highlight?: string | null }) {
  const [all, setAll] = useState(!!highlight)
  const rank = Object.fromEntries(g.ledger.map((e, i) => [e.id, i + 1]))
  const rows: [string, Cited | null | undefined][] = [
    ['Headline', c.headline],
    ['Big idea', c.big_idea],
    ['Body copy', c.body],
    ['Sound', c.music],
    ...c.moodboard.map((m, i) => [`Moodboard ${i + 1}`, m] as [string, Cited]),
    ...c.partners.map((m) => ['Partner', m] as [string, Cited]),
    ...c.channels.map((m) => ['Channel', m] as [string, Cited]),
  ]
  const list = rows.filter(([, el]) => el) as [string, Cited][]
  const used = new Map(list.flatMap(([, el]) => cited(g, el.because)).map((e) => [e.id, e]))
  const withRefs = list.filter(([, el]) => cited(g, el.because).length > 0).length
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const usedLift = avg([...used.values()].map((e) => e.lift))
  const ledgerLift = avg(g.ledger.map((e) => e.lift))
  const outLift = avg([...used.values()].map((e) => e.lift_outside ?? 1))

  return (
    <section id="data-to-line-section" aria-labelledby="data-to-line" className="scroll-mt-20">
      <h2 id="data-to-line" className="font-display text-title leading-tight">
        From data to line
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        Every line of this concept was written from titles in this zone's Qloo ledger, and names them. Lines that cite nothing, or cite a title outside the
        ledger, are rejected before you see them.
      </p>

      {highlight && used.has(highlight) && (
        <p className="mt-3 text-sm text-ink">
          Highlighted: the {list.filter(([, el]) => el.because.includes(highlight)).length} lines that cite <b>{used.get(highlight)!.name}</b>.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { v: `${withRefs} of ${list.length}`, l: 'lines carry a citation' },
          { v: `${used.size} of ${g.ledger.length}`, l: 'ledger titles used' },
          { v: `${usedLift.toFixed(1)}×`, l: `average lift here (ledger ${ledgerLift.toFixed(1)}×)` },
          { v: `${outLift.toFixed(1)}×`, l: 'same titles in the other places' },
        ].map((m) => (
          <div key={m.l} className="card p-4">
            <div className="t-metric">{m.v}</div>
            <div className="t-caption mt-1">{m.l}</div>
          </div>
        ))}
      </div>

      <ol className="card mt-4 divide-y divide-line">
        {list.slice(0, all ? undefined : 4).map(([label, el], i) => {
          const refs = cited(g, el.because)
          return (
            <li
              key={i}
              className={`grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] md:items-center ${highlight && el.because.includes(highlight) ? 'bg-surface-2' : highlight ? 'opacity-50' : ''}`}
            >
              <div className="order-2 md:order-none">
                <ul className="space-y-2">
                  {refs.map((e) => (
                    <Ref key={e.id} e={e} rank={rank[e.id]} />
                  ))}
                  {!refs.length && <li className="text-sm text-coral">No citation</li>}
                </ul>
              </div>
              <ArrowRight size={16} className="hidden text-mute md:block" aria-hidden />
              <div className="order-1 md:order-none">
                <div className="kicker">{label}</div>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink">{el.text}</p>
                {el.edited && <p className="t-caption mt-1">Rewritten by you; the citations are the original line's.</p>}
              </div>
            </li>
          )
        })}
      </ol>
      {list.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-link mt-3 text-sm">
          {all ? 'Show the core lines only' : `Show all ${list.length} lines, with moodboard, partners and channels`}
        </button>
      )}
      <Source>
        Lift = Qloo's affinity score for a title in this zone's places, divided by its average across all places in the campaign; 1.0× means no difference. The
        ledger keeps titles above 1.5× here and below 1.0× elsewhere where it can, ordered by that gap weighted by how well known the title is.
      </Source>
    </section>
  )
}
