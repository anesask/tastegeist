import { AnimatePresence, motion } from 'motion/react'
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { claimSolo, onSolo } from '../lib/solo'

const SRC = '/video/tastegeist.mp4'
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * The product film in a custom player: the poster until you press play, then the film with
 * quiet controls (play, scrub, time, sound, fullscreen) that fade out while it plays.
 */
export function ProductFilm({ onTour }: { images?: (string | null)[]; onTour: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const v = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [starting, setStarting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [vol, setVol] = useState(0.4)
  const [t, setT] = useState(0)
  const [d, setD] = useState(0)
  const [idle, setIdle] = useState(false)
  const [missing, setMissing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    if (missing) return onTour()
    setStarting(true)
    setTimeout(() => {
      setStarted(true)
      const el = v.current
      if (!el) return
      // fade the sound up instead of starting at full level
      el.volume = 0
      el.play()
        .then(() => {
          const t0 = performance.now()
          const step = () => {
            const k = Math.min(1, (performance.now() - t0) / 900)
            el.volume = vol * k
            if (k < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })
        .catch(() => {})
    }, 650)
  }
  const toggle = () => (v.current?.paused ? v.current.play() : v.current?.pause())
  const wake = () => {
    setIdle(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setIdle(true), 2200)
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  useEffect(() => onSolo('film', () => v.current?.pause()), [])

  return (
    <div
      ref={box}
      className="group relative isolate aspect-video w-full overflow-hidden rounded-3xl bg-[#0b0a09] outline-none ring-1 ring-line focus-visible:ring-2 focus-visible:ring-ink"
      onMouseMove={wake}
      tabIndex={0}
      aria-label="Product film. Space plays or pauses, arrows skip 5 seconds, M mutes, F fullscreen."
      onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return
        const el = v.current
        if (e.key === ' ' || e.key === 'k') {
          e.preventDefault()
          if (!started) start()
          else toggle()
        } else if (!el || !started) return
        else if (e.key === 'ArrowRight') el.currentTime = Math.min(el.duration, el.currentTime + 5)
        else if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 5)
        else if (e.key === 'm') {
          el.muted = !el.muted
          setMuted(el.muted)
        } else if (e.key === 'f') box.current?.requestFullscreen?.()
        else return
        wake()
      }}
      style={{ cursor: started && playing && idle ? 'none' : undefined }}
    >
      <video
        ref={v}
        src={SRC}
        playsInline
        preload="metadata"
        className={`h-full w-full object-cover transition-opacity duration-700 ${started ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setMissing(true)}
        onPlay={() => {
          setPlaying(true)
          claimSolo('film')
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setD(e.currentTarget.duration)
          e.currentTarget.volume = 0.4
        }}
        onEnded={() => setPlaying(false)}
        onClick={toggle}
        aria-label="Tastegeist product film"
      />

      {/* Before: the mixtape */}
      <AnimatePresence>
        {!started && (
          <motion.button
            type="button"
            onClick={start}
            className="absolute inset-0 grid place-items-center "
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            aria-label={missing ? 'Take the live tour' : 'Play the product film'}
          >
            <motion.img
              src="/video/tastegeist-poster.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              animate={starting ? { scale: 1.04, opacity: 0.4 } : { scale: 1, opacity: 1 }}
              transition={{ duration: 0.65 }}
            />
            <span className="absolute inset-0 bg-black/25" />
            <span className="relative flex items-center gap-3 rounded-full bg-[#f3efe7] px-5 py-2.5 text-sm font-medium text-[#16130f] shadow-xl transition group-hover:scale-[1.03]">
              <Play size={16} className="fill-current" aria-hidden /> {missing ? 'Take the live tour' : 'Play the 90-second film'}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* During: quiet controls */}
      {started && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pb-4 pt-10 text-white transition-opacity duration-500 ${playing && idle ? 'opacity-0' : 'opacity-100'}`}
        >
          <input
            type="range"
            min={0}
            max={d || 1}
            step={0.1}
            value={t}
            onChange={(e) => v.current && (v.current.currentTime = +e.target.value)}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer accent-[#d4a43a]"
          />
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={toggle}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="ml-0.5 fill-current" />}
            </button>
            <span className="tabular text-white/80">
              {fmt(t)} / {fmt(d)}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                if (!v.current) return
                v.current.muted = !v.current.muted
                setMuted(v.current.muted)
              }}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : vol}
              onChange={(e) => {
                const x = +e.target.value
                setVol(x)
                if (v.current) {
                  v.current.volume = x
                  v.current.muted = x === 0
                  setMuted(x === 0)
                }
              }}
              aria-label="Volume"
              className="h-1 w-24 cursor-pointer accent-[#d4a43a]"
            />
            <button
              type="button"
              onClick={() => box.current?.requestFullscreen?.()}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
              aria-label="Fullscreen"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
