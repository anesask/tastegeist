import { previewUrl } from '../lib/api'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ProfileEntity } from '../lib/api'
import { claimSolo, onSolo } from '../lib/solo'

/** A toothed reel hub, turning while `spin`, with the wound tape around it. */
function Reel({ cx, tape, spin, reduce }: { cx: number; tape: number; spin: boolean; reduce: boolean | null }) {
  return (
    <g>
      <circle cx={cx} cy={118} r={tape} fill="#3b2a1b" />
      <circle cx={cx} cy={118} r={tape} fill="url(#tape-sheen)" />
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        animate={spin ? { rotate: 360 } : { rotate: 0 }}
        transition={spin ? { duration: reduce ? 6 : 2.8, repeat: Infinity, ease: 'linear' } : { duration: 0.6 }}
      >
        <circle cx={cx} cy={118} r={17} fill="#f4f1ea" />
        <circle cx={cx} cy={118} r={9} fill="#1a1612" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x={cx - 2.2} y={118 - 11.5} width={4.4} height={5} rx={1} fill="#1a1612" transform={`rotate(${a} ${cx} 118)`} />
        ))}
      </motion.g>
    </g>
  )
}

/** A worn compact cassette: smoky grained plastic, a crooked paper label with ink bleed, screws, tape guides, scuffs. */
function Shell({ title, sub, spin, play }: { title: string; sub: string; spin: boolean; play: number }) {
  const reduce = useReducedMotion()
  // the tape moves from the left reel to the right one as the mixtape plays
  const left = 44 - 16 * play
  const right = 28 + 16 * play
  return (
    <svg viewBox="0 0 400 252" className="w-full drop-shadow-[0_26px_34px_rgba(0,0,0,0.5)]" role="img" aria-label={`${title}: ${sub}`}>
      <defs>
        {/* smoky translucent plastic with fine grain */}
        <linearGradient id="cs-shell" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#4a423a" />
          <stop offset="0.55" stopColor="#2a241f" />
          <stop offset="1" stopColor="#17130f" />
        </linearGradient>
        <filter id="cs-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.22" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        {/* paper: warm, uneven, with fibres */}
        <filter id="cs-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="3" seed="9" result="f" />
          <feColorMatrix in="f" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.16 0" result="fib" />
          <feComposite in="fib" in2="SourceGraphic" operator="in" result="fibIn" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="fibIn" />
          </feMerge>
        </filter>
        {/* ballpoint ink that bleeds a little into the paper */}
        <filter id="cs-ink" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="2" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="1.4" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.25" />
        </filter>
        <linearGradient id="cs-gloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="0.36" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="tape-sheen" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="window">
          <rect x="112" y="92" width="176" height="52" rx="26" />
        </clipPath>
      </defs>

      {/* shell, its grain, a moulded inner ridge and a gloss streak */}
      <rect x="4" y="4" width="392" height="244" rx="15" fill="url(#cs-shell)" stroke="#000" strokeOpacity="0.6" />
      <rect x="4" y="4" width="392" height="244" rx="15" fill="#fff" filter="url(#cs-grain)" />
      <rect x="11" y="11" width="378" height="230" rx="11" fill="none" stroke="#000" strokeOpacity="0.35" />
      <rect x="12" y="12" width="376" height="228" rx="10" fill="none" stroke="#fff" strokeOpacity="0.07" />
      {/* scuffs on the plastic */}
      <path d="M330 196 l26 -9 M338 205 l14 -5 M40 200 l18 6" stroke="#fff" strokeOpacity="0.07" strokeWidth="0.8" />
      {/* screws with slots */}
      {[
        [20, 20, 30],
        [380, 20, -20],
        [20, 232, 70],
        [380, 232, 10],
        [200, 236, 45],
      ].map(([x, y, a]) => (
        <g key={`${x}-${y}`} transform={`rotate(${a} ${x} ${y})`}>
          <circle cx={x} cy={y} r={5.5} fill="#0c0a08" />
          <circle cx={x} cy={y} r={4.2} fill="#57514a" />
          <circle cx={x - 1} cy={y - 1} r={2.2} fill="#7d766d" opacity="0.6" />
          <rect x={x - 3.6} y={y - 0.6} width={7.2} height={1.2} fill="#1a1612" />
        </g>
      ))}

      {/* the label: a slightly crooked paper sticker with a lifted corner */}
      <g transform="rotate(-0.6 200 100)">
        <path d="M29 24 h342 a6 6 0 0 1 6 6 v140 a6 6 0 0 1 -6 6 h-336 l-6 -7 z" fill="#ece3d1" filter="url(#cs-paper)" />
        <path d="M29 169 l6 7 v-6 z" fill="#c9bea9" />
        <rect x="29" y="24" width="348" height="27" fill="#c9952f" filter="url(#cs-paper)" />
        <text x="42" y="42" fontFamily="'Inter Variable', Inter, sans-serif" fontSize="12" fontWeight="800" fill="#1a1612">
          A
        </text>
        <text
          x="362"
          y="41.5"
          textAnchor="end"
          fontFamily="'Inter Variable', Inter, sans-serif"
          fontSize="9.5"
          fontWeight="700"
          letterSpacing="1.6"
          fill="#2a2117"
          opacity="0.85"
        >
          TASTEGEIST · C-30 · TYPE I
        </text>
        {[70, 86].map((y) => (
          <line key={y} x1="42" x2="362" y1={y} y2={y} stroke="#b9ab93" strokeWidth={0.7} />
        ))}
        <g filter="url(#cs-ink)">
          <text x="44" y="67" fontFamily="'Permanent Marker', 'Instrument Serif', cursive" fontSize="19" fill="#203070" transform="rotate(-1.4 44 67)">
            {title.length > 28 ? title.slice(0, 27) + '…' : title}
          </text>
          <text x="46" y="83" fontFamily="'Permanent Marker', cursive" fontSize="9" fill="#3a3f63" opacity="0.85" transform="rotate(-0.6 46 83)">
            {sub.length > 58 ? sub.slice(0, 57) + '…' : sub}
          </text>
        </g>
      </g>

      {/* window: tape guides, both reels, the tape running between them */}
      <rect x="106" y="86" width="188" height="64" rx="32" fill="#0a0806" stroke="#000" strokeOpacity="0.5" />
      <g clipPath="url(#window)">
        <rect x="112" y="92" width="176" height="52" fill="#14100c" />
        <Reel cx={150} tape={left} spin={spin} reduce={reduce} />
        <Reel cx={250} tape={right} spin={spin} reduce={reduce} />
        <rect x="112" y="92" width="176" height="52" fill="url(#cs-gloss)" />
      </g>
      <rect x="106" y="86" width="188" height="64" rx="32" fill="none" stroke="#fff" strokeOpacity="0.1" />

      {/* the head opening, its pins and the tape crossing it */}
      <path d="M94 248 L117 194 H283 L306 248 Z" fill="#110e0b" stroke="#000" strokeOpacity="0.5" />
      <path d="M117 194 H283" stroke="#fff" strokeOpacity="0.06" />
      <line x1="120" y1="240" x2="280" y2="240" stroke="#3b2a1b" strokeWidth="2" />
      {[150, 200, 250].map((x) => (
        <rect key={x} x={x - 7} y={220} width={14} height={14} rx={2} fill="#050403" stroke="#2a241e" strokeWidth={0.6} />
      ))}
      {[128, 272].map((x) => (
        <g key={x}>
          <circle cx={x} cy={229} r={5.5} fill="#050403" />
          <circle cx={x} cy={229} r={2.5} fill="#8a8178" />
        </g>
      ))}
    </svg>
  )
}

/** A deck key: pushed in while it is the active one, like the piano keys on a tape deck. */
function Key({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid h-10 w-12 place-items-center rounded-b-lg rounded-t-sm border border-black/40 text-[#d8cfc2] transition-all duration-150 active:translate-y-[3px] ${
        on
          ? 'translate-y-[3px] bg-[#16130f] shadow-[inset_0_3px_6px_rgba(0,0,0,.7)] text-[#d4a43a]'
          : 'bg-gradient-to-b from-[#3a332d] to-[#211c18] shadow-[0_4px_0_#0b0a09,0_6px_12px_rgba(0,0,0,.4)] hover:brightness-110'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A place's mixtape on a tape deck: piano keys that latch in, reels that turn while it plays, and a
 * now-playing card with the album art. Plays the 30-second Deezer previews of the artists the place
 * over-indexes on (fetched fresh at play time).
 */
export function Mixtape({ place, title, artists }: { place: string; title?: string; artists: ProfileEntity[] }) {
  const tracks = artists.filter((a) => a.preview)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [i, setI] = useState<number | null>(null)
  const [last, setLast] = useState(0)
  const [vol, setVol] = useState(0.35)
  const [paused, setPaused] = useState(false)
  const [pos, setPos] = useState(0)
  const soloId = useId()
  useEffect(() => () => audio.current?.pause(), [])
  // Sound never jumps in at full level: it fades up over ~0.8 s to the chosen volume.
  const fadeIn = (a: HTMLAudioElement, to: number) => {
    a.volume = 0
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 800)
      a.volume = to * k
      if (k < 1 && !a.paused) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const stop = () => {
    audio.current?.pause()
    setI(null)
    setPos(0)
    setPaused(false)
  }
  // A pause during loading cancels play() with an AbortError: that is not a failure.
  const failed = (e: unknown) => {
    if ((e as DOMException)?.name !== 'AbortError') stop()
  }
  // Another player started: this deck stops (one tape at a time).
  useEffect(
    () =>
      onSolo(soloId, () => {
        audio.current?.pause()
        setI(null)
        setPos(0)
        setPaused(false)
      }),
    [soloId],
  )
  const pause = () => {
    const a = audio.current
    if (!a || i == null) return
    if (a.paused) {
      claimSolo(soloId)
      a.play()
        .then(() => fadeIn(a, vol))
        .catch(failed)
      setPaused(false)
    } else {
      a.pause()
      setPaused(true)
    }
  }
  const play = (n: number) => {
    audio.current?.pause()
    const k = ((n % tracks.length) + tracks.length) % tracks.length
    const a = new Audio(previewUrl(tracks[k].name))
    a.ontimeupdate = () => setPos(a.duration ? a.currentTime / a.duration : 0)
    a.onended = () => (k + 1 < tracks.length ? play(k + 1) : stop())
    claimSolo(soloId)
    a.play()
      .then(() => fadeIn(a, vol))
      .catch(failed)
    audio.current = a
    setPaused(false)
    setI(k)
    setLast(k)
    setPos(0)
  }
  if (!tracks.length) return null
  const shown = tracks[i ?? last]
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${title ?? place} mixtape. Space plays or pauses, left and right arrows change the track.`}
      onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        if (e.key === ' ' || e.key === 'k') {
          e.preventDefault()
          if (i == null) play(last)
          else pause()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          play((i ?? last) + 1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          play((i ?? last) - 1)
        }
      }}
      className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-[2rem] px-6 py-8 outline-none focus-visible:ring-2 focus-visible:ring-ink md:px-10"
    >
      {/* The track's album art as a soft wash: faint at rest, breathing while the tape plays. */}
      <AnimatePresence>
        <motion.img
          key={shown.preview!.cover || shown.image || shown.name}
          src={shown.preview!.cover || shown.image || ''}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover blur-3xl saturate-150"
          initial={{ opacity: 0 }}
          animate={i == null ? { opacity: 0.18, scale: 1.15 } : { opacity: [0.32, 0.46, 0.32], scale: [1.15, 1.22, 1.15] }}
          exit={{ opacity: 0 }}
          transition={i == null ? { duration: 0.8 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </AnimatePresence>
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,340px)_1fr]">
        <div>
          <Shell
            title={title ?? place}
            sub={`${place}: ${tracks.length} tracks it plays more than anywhere else`}
            spin={i != null && !paused}
            play={i == null ? 0 : (i + pos) / tracks.length}
          />
          {/* the deck keys */}
          <div className="mt-5 flex items-start justify-center gap-2 rounded-xl bg-[#0f0d0b] p-2.5 pb-4 ring-1 ring-black/40">
            <Key label="Previous track" onClick={() => play((i ?? last) - 1)}>
              <SkipBack size={18} className="fill-current" />
            </Key>
            <Key label="Play" on={i != null && !paused} onClick={() => (i == null ? play(last) : paused && pause())}>
              <Play size={18} className="fill-current" />
            </Key>
            <Key label="Pause" on={paused} onClick={pause}>
              <Pause size={17} className="fill-current" />
            </Key>
            <Key label="Stop" onClick={stop}>
              <Square size={16} className="fill-current" />
            </Key>
            <Key label="Next track" onClick={() => play((i ?? last) + 1)}>
              <SkipForward size={18} className="fill-current" />
            </Key>
          </div>
        </div>

        {/* now playing */}
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <div className="kicker">{i == null ? 'Side A, track ' + (last + 1) : 'Now playing'}</div>
          <motion.img
            key={shown.preview!.cover || shown.image || shown.name}
            src={shown.preview!.cover || shown.image || ''}
            alt=""
            className="mt-4 aspect-square w-36 rounded-xl object-cover shadow-[0_24px_50px_-20px_rgba(0,0,0,.6)]"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, rotate: i == null ? 0 : [0, 0.6, 0, -0.6, 0] }}
            transition={{ duration: 0.4, rotate: { duration: 4, repeat: Infinity } }}
          />
          <div className="mt-4 font-display text-3xl leading-tight">{shown.preview!.track}</div>
          <div className="mt-1 text-sm text-ink-2">{shown.name}</div>
          <div className="mt-4 h-1 w-36 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-[#d4a43a] transition-[width] duration-300" style={{ width: `${i == null ? 0 : pos * 100}%` }} />
          </div>
          <label className="mt-4 flex items-center gap-2 text-xs text-mute">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vol}
              onChange={(e) => {
                setVol(+e.target.value)
                if (audio.current) audio.current.volume = +e.target.value
              }}
              className="h-1 w-28 cursor-pointer accent-[#d4a43a]"
            />
          </label>
          <p className="t-caption mt-3">30-second previews from Deezer of the artists Qloo ranks highest here.</p>
          <p className="t-caption mt-1">Keys: Space to play or pause, ← → to change the track.</p>
        </div>
      </div>
    </div>
  )
}
