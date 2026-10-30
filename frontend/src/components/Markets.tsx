import { motion, useReducedMotion } from 'motion/react'

type Market = { name: string; cities: string; status: 'live' | 'next' }

// Live: tested end to end in this product (demos and real runs). Next: planned, with local-language copy.
const MARKETS: Market[] = [
  { name: 'United States', cities: 'Los Angeles, New York, Chicago, Austin', status: 'live' },
  { name: 'United Kingdom', cities: 'London, Manchester', status: 'live' },
  { name: 'Netherlands', cities: 'Amsterdam, down to De Pijp and Noord', status: 'live' },
  { name: 'Germany', cities: 'Nationwide, city by city', status: 'live' },
  { name: 'Portugal', cities: 'Lisbon', status: 'live' },
  { name: 'France', cities: 'Paris, Lyon, Marseille', status: 'next' },
  { name: 'Spain', cities: 'Madrid, Barcelona', status: 'next' },
  { name: 'Italy', cities: 'Milan, Rome', status: 'next' },
  { name: 'Nordics', cities: 'Stockholm, Copenhagen, Oslo', status: 'next' },
  { name: 'Japan', cities: 'Tokyo, Osaka', status: 'next' },
]

/** Where Tastegeist runs today, and where it goes next. */
export function Markets() {
  const reduce = useReducedMotion()
  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-2">
      {(['live', 'next'] as const).map((st) => (
        <div key={st}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${st === 'live' ? 'bg-mint' : 'bg-mute'}`} />
            <h3 className="t-h3">{st === 'live' ? 'Available now' : 'Coming soon'}</h3>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {st === 'live'
              ? 'Tested end to end: taste zones, neighborhoods, concepts and plans.'
              : 'Next up, with concepts written in the local language and local media benchmarks.'}
          </p>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {MARKETS.filter((m) => m.status === st).map((m, i) => (
              <motion.li
                key={m.name}
                className="flex items-baseline justify-between gap-4 py-3.5"
                initial={reduce ? false : { opacity: 0, x: st === 'live' ? -12 : 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
              >
                <span className={`font-display text-2xl ${st === 'next' ? 'text-mute' : ''}`}>{m.name}</span>
                <span className="text-right text-sm text-ink-2">{m.cities}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
