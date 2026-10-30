import { useEffect, useId, useRef, useState } from 'react'
import { rgb } from '../lib/api'
import type { RGB } from '../lib/geists'

export interface PieItem {
  id: string
  name: string
  image: string | null
  value: number
  sub?: string
}

const TAU = Math.PI * 2

/** SVG path of a donut wedge between two angles (0 = 12 o'clock, clockwise). */
function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(r1, a0)
  const [x1, y1] = p(r1, a1)
  const [x2, y2] = p(r0, a1)
  const [x3, y3] = p(r0, a0)
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
}

/**
 * A pie made of the culture itself: every wedge is a title's own cover art or portrait, its angle
 * the title's share of the place's lift. Hover names it in the center; click drills in.
 */
export function ImagePie({
  items,
  color,
  size = 420,
  center,
  onPick,
  onHover,
  label,
}: {
  items: PieItem[]
  color: RGB
  size?: number
  center?: { title: string; sub?: string }
  onPick?: (item: PieItem) => void
  /** The slice in focus (after hover intent), or null when the pie rests. */
  onHover?: (item: PieItem | null) => void
  label: string
}) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHoverNow] = useState<number | null>(null)
  // Hover intent: a slice reacts only after the pointer rests on it briefly, and the pie lets go a
  // moment after the pointer leaves, so sweeping across it doesn't flicker slice to slice.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setHover = (i: number | null, wait = i == null ? 220 : 140) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHoverNow(i), wait)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  // Tell the parent which slice is in focus; list is sorted biggest first below.
  useEffect(() => {
    if (!onHover) return
    const sorted = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
    onHover(hover == null ? null : (sorted[hover] ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover])
  // Biggest first, so the strongest taste starts at 12 o'clock and is the slice pulled out.
  const list = items.filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
  const total = list.reduce((a, x) => a + x.value, 0) || 1
  const c = size / 2
  // Room around the pie for the pulled-out slice, so it is never cut at the edge.
  const r1 = c - 30
  const r0 = r1 * 0.5
  const gap = 0.012
  let a = 0
  const wedges = list.map((x) => {
    const span = (x.value / total) * TAU
    const w = {
      ...x,
      a0: a + gap / 2,
      a1: a + span - gap / 2,
      mid: a + span / 2,
    }
    a += span
    return w
  })
  const shown = hover != null ? wedges[hover] : null
  const rankText = (i: number) => `#${i + 1} of ${wedges.length}`

  return (
    <figure className="relative mx-auto w-full" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="block h-auto w-full overflow-visible" role="img" aria-label={label}>
        <defs>
          {wedges.map((w, i) => (
            <clipPath key={i} id={`${uid}-w${i}`}>
              <path d={wedge(c, c, r0, r1, w.a0, w.a1)} />
            </clipPath>
          ))}
        </defs>
        {wedges.map((w, i) => {
          // The image is centered on the wedge, sized so even a thin wedge shows its middle.
          const rm = (r0 + r1) / 2
          const cx = c + rm * Math.sin(w.mid)
          const cy = c - rm * Math.cos(w.mid)
          // Cover the wedge's outer corners too: size from the outer chord, not the mid arc.
          const chord = 2 * r1 * Math.sin(Math.min(Math.PI / 2, (w.a1 - w.a0) / 2))
          const s = Math.max(r1 - r0, chord) * 1.35
          // The biggest slice sits pulled out; a hovered one springs further and grows a little.
          const active = hover === i
          const out = active ? 10 : i === 0 && hover == null ? 8 : 0
          const dx = out * Math.sin(w.mid)
          const dy = -out * Math.cos(w.mid)
          const raised = active || (i === 0 && hover == null)
          return (
            <g
              key={w.id}
              className="pie-slice"
              style={{
                transform: `translate(${dx}px, ${dy}px) scale(${active ? 1.03 : 1})`,
                transformOrigin: `${c}px ${c}px`,
                transition: 'transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.5s ease',
                filter: raised ? 'drop-shadow(0 12px 18px rgba(0,0,0,0.45))' : 'none',
                animationDelay: `${i * 45}ms`,
                cursor: onPick ? 'pointer' : 'default',
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i, 0)}
              onBlur={() => setHover(null, 0)}
              onClick={() => onPick?.(w)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick?.(w)}
              tabIndex={onPick ? 0 : -1}
              role={onPick ? 'button' : undefined}
              aria-label={`${w.name}${w.sub ? `, ${w.sub}` : ''}, ${rankText(i)}`}
            >
              <g clipPath={`url(#${uid}-w${i})`}>
                <rect x={0} y={0} width={size} height={size} fill={rgb(color, 0.35)} />
                {w.image && (
                  <image
                    href={w.image}
                    x={cx - s / 2}
                    y={cy - s / 2}
                    width={s}
                    height={s}
                    preserveAspectRatio="xMidYMid slice"
                    style={{
                      transform: `scale(${active ? 1.1 : 1})`,
                      transformOrigin: `${cx}px ${cy}px`,
                      transition: 'transform 0.6s cubic-bezier(0.16,1,0.3,1)',
                    }}
                  />
                )}
                <rect
                  x={0}
                  y={0}
                  width={size}
                  height={size}
                  fill="black"
                  opacity={hover == null ? 0 : active ? 0 : 0.55}
                  style={{ transition: 'opacity 0.5s ease' }}
                />
              </g>
              <path
                d={wedge(c, c, r0, r1, w.a0, w.a1)}
                fill="none"
                stroke={raised ? rgb(color) : 'transparent'}
                strokeWidth={3}
                style={{ transition: 'stroke 0.3s' }}
              />
            </g>
          )
        })}
        {/* the place's color as a ring around the hole: nothing pulls out across it */}
        <circle cx={c} cy={c} r={r0 - 5} fill="none" stroke={rgb(color)} strokeWidth={3} opacity={0.85} />
      </svg>
      <figcaption className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="max-w-[44%] text-center">
          {shown ? (
            <div key={shown.id} className="rise">
              <div className="t-h3 leading-tight">{shown.name}</div>
              <div className="mt-1 text-xs text-mute">
                {shown.sub ? `${shown.sub} · ` : ''}
                {rankText(hover!)}
              </div>
            </div>
          ) : center?.title ? (
            <>
              <div className="font-display text-title leading-[0.95]">{center.title}</div>
              {center.sub && <div className="mt-1 text-xs text-mute">{center.sub}</div>}
            </>
          ) : wedges[0] ? (
            // No hover yet: name the slice that is pulled out.
            <>
              <div className="kicker">Strongest</div>
              <div className="t-h3 mt-1 leading-tight">{wedges[0].name}</div>
              <div className="mt-1 text-xs text-mute">{center?.sub ?? 'Hover a slice'}</div>
            </>
          ) : null}
        </div>
      </figcaption>
    </figure>
  )
}
