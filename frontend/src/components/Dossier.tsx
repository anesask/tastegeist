import { ArrowRight, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { DOMAIN_LABEL, heroFirst, rgb, type Domain, type Geist, type LedgerEntity } from '../lib/api'
import { chosenConcept, personaName, placeName, type RGB } from '../lib/geists'
import { Poster } from './Poster'
import { buttonClass } from './ui'

const VERB: Record<Domain, string> = {
  movie: 'watches',
  tv_show: 'binges',
  artist: 'listens to',
  brand: 'buys into',
  podcast: 'tunes in to',
}

/** An audience narrative written straight from the ledger, so every claim is a Qloo affinity. */
export function narrative(ledger: LedgerEntity[]): string {
  const by: Partial<Record<Domain, LedgerEntity[]>> = {}
  for (const e of ledger) (by[e.domain] ??= []).push(e)
  const order = Object.entries(by).sort((a, b) => b[1]!.length - a[1]!.length) as [Domain, LedgerEntity[]][]
  const parts = order.slice(0, 4).map(
    ([d, es]) =>
      `${VERB[d]} ${es
        .slice(0, 2)
        .map((e) => e.name)
        .join(' and ')}`,
  )
  if (!parts.length) return ''
  const last = parts.pop()
  return `Compared with the rest of the brief, this audience ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`
}

/** The geist dossier: a creative research file for one zone or neighborhood (story D4). */
export function Dossier({ g, color, productName, onClose }: { g: Geist; color: RGB; productName: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const photos = heroFirst(g.ledger.filter((e) => e.image))
  const concept = chosenConcept(g)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label={`Dossier: ${placeName(g)}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-10">
        <div className="kicker">Geist dossier · {g.kind === 'neighborhood' ? g.parent : 'Taste zone'}</div>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
          <X size={15} /> Close
        </button>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-24 md:px-10">
        <header className="rise mt-10 grid gap-8 md:mt-16 md:grid-cols-[1.3fr_1fr] md:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm text-mute">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(color) }} />
              {personaName(g)}
            </div>
            <h1 className="mt-3 font-display text-hero leading-[0.92] tracking-tight">{placeName(g)}</h1>
            <p className="mt-6 font-display text-title leading-snug">{g.persona?.tagline || g.geist}</p>
          </div>
          <div>
            <p className="leading-relaxed text-ink-2">{narrative(g.ledger)}</p>
            {g.tags && g.tags.length > 0 && <p className="t-caption mt-4">{g.tags.slice(0, 3).join(', ').toLowerCase()}</p>}
          </div>
        </header>

        <section className="mt-12 grid auto-rows-[150px] grid-cols-2 gap-2 md:auto-rows-[170px] md:grid-cols-4" aria-label="Cultural moodboard">
          {photos.map((e, i) => (
            <figure
              key={e.id}
              className={`group relative overflow-hidden rounded-xl bg-surface-2 ${i === 0 ? 'col-span-2 row-span-2' : i === 3 ? 'row-span-2' : ''}`}
            >
              <img src={e.image!} alt={e.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
                <div className="text-xs font-semibold uppercase tracking-widest text-white/60">{DOMAIN_LABEL[e.domain]}</div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="tabular text-xs">{e.lift.toFixed(1)}×</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </section>

        {g.tags && g.tags.length > 0 && (
          <section className="mt-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="kicker">Aesthetics</span>
            {g.tags.map((t) => (
              <span key={t} className="text-base text-ink-2">
                {t}
              </span>
            ))}
          </section>
        )}

        {g.places && g.places.length > 0 && (
          <section className="mt-12">
            <div className="kicker">Where this geist lives</div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {g.places.map((p) => (
                <figure key={p.id}>
                  <img src={p.image!} alt={p.name} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" />
                  <figcaption className="mt-2 text-sm">{p.name}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-mute">
          Lift: how much more this audience over-indexes on an entity here than across the brief's other markets. Source: Qloo Insights API.
        </p>

        {concept && (
          <section className="mt-20 grid gap-10 md:grid-cols-2 md:items-center">
            <Poster g={g} c={concept} color={color} productName={productName} />
            <div>
              <div className="kicker">The campaign</div>
              <h2 className="mt-3 font-display text-statement leading-[1.02] tracking-tight">Built from what {placeName(g)} already loves.</h2>
              <p className="mt-4 leading-relaxed text-ink-2">{concept.big_idea?.text}</p>
              <Link to={`../creatives?g=${encodeURIComponent(g.key)}&c=${concept.id}`} className={buttonClass('primary', 'lg', 'mt-6')}>
                Open the three concepts <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
