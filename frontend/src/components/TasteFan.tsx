import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { rgb, type LedgerEntity } from '../lib/api'
import type { RGB } from '../lib/geists'

export interface FanSide {
  key: string
  place: string
  persona: string
  color: RGB
  titles: LedgerEntity[]
}

const PER_SIDE = 6
const CARD = { w: 118, h: 166 }
// Cards pivot around a point well below them, like a hand of playing cards.
const PIVOT_Y = 2.1 // share of the card height, from its top
const PIVOT = `50% ${PIVOT_Y * 100}%`
const IDLE_MS = 3500 // auto-play resumes this long after the pointer leaves

type Card = { e: LedgerEntity; s: FanSide; si: number; i: number }
type Step = { dealt: boolean; focus: string | null; say: ReactNode; side?: 0 | 1 }

/** A speech bubble with a tail, popping in above the hand. */
function Bubble({ children, side, top }: { children: ReactNode; side?: 0 | 1; top: number }) {
  const shift = side === 0 ? -146 : side === 1 ? 146 : 0
  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 z-[70] w-max max-w-[300px] rounded-2xl border border-line bg-bg px-4 py-2.5 text-center text-sm shadow-xl"
      style={{ x: `calc(-50% + ${shift}px)`, top }}
      initial={{ opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {children}
      <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-line bg-bg" aria-hidden />
    </motion.div>
  )
}

/**
 * The hero's story as a hand of cards (a fan). Left alone it tells itself in speech bubbles: one
 * city's titles as one hand, the deal into two neighborhoods, each one's strongest card pulled out.
 * Under the pointer it hands over control: the card you point at is chosen by its angle around the
 * fan's pivot, like a dial, so moving across the hand sweeps through the cards in order without
 * flicker. Click deals or gathers. With reduced motion it still tells the story and answers the
 * pointer, but cards glide briefly instead of flying, with no stagger and no sway.
 */
const NOUN: Record<string, string> = { movie: 'film', tv_show: 'TV show', artist: 'artist', brand: 'brand', podcast: 'podcast', book: 'book' }

export function TasteFan({
  city,
  a,
  b,
  shared,
  ranks = {},
}: {
  city: string
  a: FanSide
  b: FanSide
  shared: number | null
  /** Rank of each title in each place's Qloo list (from the culture profile). */
  ranks?: Record<string, Record<string, [number | null, number]>>
}) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(false) // the pointer is in charge
  const [dealtByUser, setDealtByUser] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const sides = [a, b].map((s) => ({ ...s, titles: s.titles.slice(0, PER_SIDE) }))
  const srcs = sides.flatMap((s) => s.titles.map((e) => e.image!)).join('|')
  // What makes a title belong to its side: its rank there, and its absence (or rank) next door.
  const rankHere = (e: LedgerEntity, si: number) => ranks[e.id]?.[sides[si].place]?.[0] ?? null
  const fact = (e: LedgerEntity, si: number): ReactNode => {
    const here = rankHere(e, si)
    if (here == null) return `${e.lift.toFixed(1)}× more loved in ${sides[si].place}`
    const other = sides[1 - si].place
    const there = ranks[e.id]?.[other]?.[0]
    return (
      <>
        #{here} {NOUN[e.domain] ?? 'title'} in {sides[si].place}
        <span className="text-mute"> · {there ? `#${there} in ${other}` : `not on ${other}'s list`}</span>
      </>
    )
  }
  // The story shows each side's top-ranked title (by lift until the ranks arrive).
  const strongest = sides.map((s, si) =>
    s.titles.reduce((x, y) => {
      const rx = rankHere(x, si) ?? 99
      const ry = rankHere(y, si) ?? 99
      return ry < rx || (ry === rx && y.lift > x.lift) ? y : x
    }, s.titles[0]),
  )

  // The story it tells while nobody touches it.
  const story: Step[] = [
    { dealt: false, focus: null, say: <>Is {city} one audience?</> },
    {
      dealt: true,
      focus: null,
      say: (
        <>
          Qloo says no. Two neighborhoods
          {shared != null ? (
            <>
              , only <b>{Math.round(shared * 100)}%</b> in common
            </>
          ) : null}
          .
        </>
      ),
    },
    ...strongest.map((e, si) => ({
      dealt: true,
      focus: e.id,
      side: si as 0 | 1,
      say: (
        <>
          <b>{e.name}</b>
          <span className="block text-xs text-ink-2">{fact(e, si)}</span>
        </>
      ),
    })),
    { dealt: true, focus: null, say: <>So each gets its own campaign.</> },
  ]
  const DUR = [2600, 3200, 2600, 2600, 2600]

  // Load the covers first, so the first deal shows real cards.
  useEffect(() => {
    let alive = true
    Promise.all(
      srcs.split('|').map(
        (src) =>
          new Promise<void>((done) => {
            const img = new Image()
            img.onload = img.onerror = () => done()
            img.src = src
          }),
      ),
    ).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [srcs])

  // Auto-play: advance the story unless the pointer is in charge.
  useEffect(() => {
    if (user || !ready) return
    const id = setTimeout(() => setStep((n) => (n + 1) % story.length), DUR[step] ?? 2600)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, step, story.length])

  // Hand control back to the story after a quiet moment.
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const release = () => {
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => {
      setUser(false)
      setHover(null)
    }, IDLE_MS)
  }
  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current)
    },
    [],
  )

  const cur = story[step]
  const dealt = user ? dealtByUser : cur.dealt
  const focus = user ? hover : cur.focus

  // The whole hand sways a little with the pointer.
  const mx = useMotionValue(0)
  const sway = useSpring(useTransform(mx, [-0.5, 0.5], [-3, 3]), { stiffness: 60, damping: 18 })

  const cards: Card[] = sides.flatMap((s, si) => s.titles.map((e, i) => ({ e, s, si, i })))
  const interleaved = cards.slice().sort((p, q) => p.i - q.i || p.si - q.si)
  const n = interleaved.length

  const pose = (c: Card) => {
    if (!dealt) {
      const spread = 78
      const k = interleaved.indexOf(c)
      return { x: 0, y: -24, rotate: -spread / 2 + (k * spread) / (n - 1), scale: 1, z: k }
    }
    const spread = 44
    const m = sides[c.si].titles.length
    return { x: c.si ? 146 : -146, y: -10, rotate: -spread / 2 + (c.i * spread) / Math.max(m - 1, 1), scale: 0.76, z: c.i }
  }

  /** The card under the pointer, from its angle around the hand's pivot (stable, in order, no flicker). */
  const pick = (px: number, py: number): string | null => {
    const hand = dealt ? cards.filter((c) => c.si === (px < 0 ? 0 : 1)) : interleaved
    const p0 = pose(hand[0])
    const pivotY = p0.y + (PIVOT_Y - 0.5) * CARD.h
    const dx = px - p0.x
    const dy = pivotY - py
    const r = Math.hypot(dx, dy)
    if (r < (PIVOT_Y - 1.05) * CARD.h * p0.scale || r > (PIVOT_Y + 0.3) * CARD.h * p0.scale) return null
    const ang = (Math.atan2(dx, dy) * 180) / Math.PI
    const gap = hand.length > 1 ? Math.abs(pose(hand[1]).rotate - p0.rotate) : 10
    // Keep the current card until the pointer is clearly over the next one.
    const current = hand.find((c) => c.e.id === hover)
    if (current && Math.abs(pose(current).rotate - ang) < gap * 0.7) return current.e.id
    const best = hand.reduce((x, c) => (Math.abs(pose(c).rotate - ang) < Math.abs(pose(x).rotate - ang) ? c : x), hand[0])
    return Math.abs(pose(best).rotate - ang) < gap * 1.2 ? best.e.id : null
  }

  const calm = reduce ? { duration: 0.25, ease: 'easeOut' as const } : { type: 'spring' as const, stiffness: 170, damping: 24, mass: 1 }
  // Reduced motion: a short glide instead of a springy, staggered deal.
  const deal = reduce ? { duration: 0.35, ease: 'easeInOut' as const } : { type: 'spring' as const, stiffness: 120, damping: 18, mass: 0.85 }
  const focused = focus ? cards.find((c) => c.e.id === focus) : undefined

  return (
    <div
      ref={box}
      className="relative h-[520px] w-full select-none"
      onPointerMove={(ev) => {
        const r = box.current!.getBoundingClientRect()
        const px = ev.clientX - r.left - r.width / 2
        const py = ev.clientY - r.top - r.height / 2
        if (!reduce) mx.set(px / r.width)
        if (!user) {
          setUser(true)
          setDealtByUser(cur.dealt)
        }
        if (idle.current) clearTimeout(idle.current)
        const id = pick(px, py)
        if (id !== hover) setHover(id)
      }}
      onPointerLeave={() => {
        mx.set(0)
        setHover(null)
        release()
      }}
    >
      <motion.button
        type="button"
        onClick={() => {
          setUser(true)
          setDealtByUser((d) => !(user ? d : cur.dealt))
          release()
        }}
        aria-label={dealt ? `Gather ${city} back into one hand` : `Deal ${city} into ${a.place} and ${b.place}`}
        aria-pressed={dealt}
        className="absolute inset-0 cursor-pointer rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ink"
        style={{ rotate: sway }}
      >
        {cards.map((c) => {
          const p = pose(c)
          const on = focus === c.e.id
          const dim = !!focused && !on && (dealt ? c.si !== focused.si : true)
          const order = dealt ? cards.indexOf(c) : interleaved.indexOf(c)
          return (
            <motion.div
              key={c.e.id}
              className="pointer-events-none absolute left-1/2 top-1/2 overflow-hidden rounded-xl bg-[#f3efe7]"
              style={{
                width: CARD.w,
                height: CARD.h,
                marginLeft: -CARD.w / 2,
                marginTop: -CARD.h / 2,
                transformOrigin: PIVOT,
                zIndex: on ? 60 : (dealt ? c.si * 10 : 0) + p.z,
              }}
              initial={false}
              animate={{
                x: p.x,
                y: p.y + (on ? -30 : 0),
                rotate: p.rotate,
                scale: p.scale * (on ? 1.07 : 1),
                opacity: ready ? (dim ? 0.55 : 1) : 0,
                boxShadow: dealt
                  ? `0 0 0 3px ${rgb(c.s.color)}, 0 18px 40px -16px rgba(0,0,0,.5)`
                  : '0 0 0 1px rgba(0,0,0,.08), 0 18px 40px -16px rgba(0,0,0,.5)',
              }}
              // Dealing staggers card by card; a focus change moves only the cards involved, gently.
              transition={{
                x: { ...deal, delay: reduce ? 0 : order * 0.045 },
                rotate: { ...deal, delay: reduce ? 0 : order * 0.045 },
                y: calm,
                scale: calm,
                opacity: { duration: 0.35 },
                boxShadow: { duration: 0.4 },
              }}
            >
              <img src={c.e.image!} alt="" draggable={false} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-6 text-left">
                <div className="truncate text-[11px] font-medium text-white">{c.e.name}</div>
              </div>
            </motion.div>
          )
        })}
      </motion.button>

      {/* What the hand is saying: the story while it plays, the pointed card while you explore. */}
      <AnimatePresence mode="wait">
        {user
          ? focused && (
              <Bubble key={focused.e.id} side={dealt ? (focused.si as 0 | 1) : undefined} top={dealt ? 132 : 70}>
                <b>{focused.e.name}</b>
                <span className="block text-xs text-ink-2">{fact(focused.e, focused.si)}</span>
              </Bubble>
            )
          : ready && (
              <Bubble key={step} side={cur.side} top={cur.dealt ? (cur.focus ? 132 : 150) : 70}>
                {cur.say}
              </Bubble>
            )}
      </AnimatePresence>

      {/* Labels stay level while the hand sways. */}
      <AnimatePresence mode="wait">
        {dealt ? (
          <motion.div
            key="dealt"
            className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {sides.map((s) => (
              <div key={s.key} className="w-56 text-center">
                <div className="kicker flex items-center justify-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: rgb(s.color) }} />
                  {s.place}
                </div>
                <div className="mt-0.5 truncate text-sm font-medium">{s.persona}</div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="one"
            className="pointer-events-none absolute inset-x-0 bottom-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="kicker">{city}</div>
            <div className="mt-0.5 text-sm text-mute">one hand, many tastes</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
