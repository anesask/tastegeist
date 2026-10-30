import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from './ui'

const KEY = 'tg-tour'

/** Five stops through the Amsterdam demo; each stop opens the tab it talks about. */
const STOPS: { path: string; title: string; body: string }[] = [
  {
    path: '/app/c/eu/zones',
    title: 'One city, two audiences',
    body: "Qloo's taste data says De Pijp and Noord share only 60% of their top tastes. Each tower is a block where that audience's taste over-indexes. Switch places with the chips under the map.",
  },
  {
    path: '/app/c/eu/culture?g=Noord&vs=De%20Pijp',
    title: 'What a place is made of',
    body: 'Every place gets a culture profile: what it listens to (press play), watches, wears, reads and where it travels. Here Noord is compared side by side with De Pijp.',
  },
  {
    path: '/app/c/eu/creatives?g=Noord',
    title: 'A concept per audience, every line cited',
    body: 'Three concepts per audience, written only from its Qloo ledger. The chips under each line are the titles it was built from. The séance below tests them on synthetic locals.',
  },
  {
    path: '/app/c/eu/results',
    title: 'Against a control',
    body: 'The same personas judged a generic concept written without Qloo. That gap is the measured uplift; the forecast applies it to your own numbers.',
  },
  {
    path: '/app/c/eu/trace',
    title: 'And how the agent got there',
    body: 'Every decision and every Qloo and model call, in order. When you are ready, the client report is one click away in the header.',
  },
]

export function startTour(nav: (to: string) => void) {
  try {
    localStorage.setItem(KEY, '0')
  } catch {
    // storage blocked: the tour still runs for this page view
  }
  window.dispatchEvent(new Event('tg-tour'))
  nav(STOPS[0].path)
}

/** The tour card; mounted once in the app shell, shown while a tour is in progress. */
export function Tour() {
  const nav = useNavigate()
  const loc = useLocation()
  const read = () => {
    try {
      const v = localStorage.getItem(KEY)
      return v == null || v === 'done' ? null : Number(v)
    } catch {
      return null
    }
  }
  const [step, setStep] = useState<number | null>(read)
  useEffect(() => {
    const on = () => setStep(read())
    window.addEventListener('tg-tour', on)
    return () => window.removeEventListener('tg-tour', on)
  }, [])
  if (step == null || !loc.pathname.startsWith('/app/c/eu')) return null
  const stop = STOPS[step]
  const go = (n: number) => {
    if (n >= STOPS.length || n < 0) return end()
    try {
      localStorage.setItem(KEY, String(n))
    } catch {
      // ignore
    }
    setStep(n)
    nav(STOPS[n].path)
  }
  function end() {
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      // ignore
    }
    setStep(null)
  }
  return (
    <div role="dialog" aria-label="Product tour" className="rise fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] print:hidden">
      <div className="card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="kicker">
            Tour · {step + 1} of {STOPS.length}
          </span>
          <button type="button" onClick={end} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-2" aria-label="End the tour">
            <X size={16} />
          </button>
        </div>
        <div className="t-h2 mt-2">{stop.title}</div>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{stop.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft size={14} /> Back
          </Button>
          <div className="flex gap-1">
            {STOPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-ink' : 'bg-line'}`} />
            ))}
          </div>
          <Button size="sm" variant="primary" onClick={() => go(step + 1)}>
            {step === STOPS.length - 1 ? 'Finish' : 'Next'} {step < STOPS.length - 1 && <ArrowRight size={14} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
