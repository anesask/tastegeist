import { previewUrl } from '../lib/api'
import { Music2, Palette, Pause, Play, Type } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PlaceProfile } from '../lib/api'
import { Chip, Source } from './ui'

/** A palette hex as RGB, for the poster. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The palette colour a poster can carry: the most saturated one that is neither near black nor near white. */
export function posterColor(palette: string[]): [number, number, number] | null {
  const scored = palette.map((h) => {
    const [r, g, b] = hexToRgb(h)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const light = (max + min) / 510
    return { h, s: max === 0 ? 0 : (max - min) / max, light }
  })
  const pick = scored.filter((x) => x.light > 0.2 && x.light < 0.85).sort((a, b) => b.s - a.s)[0]
  return pick ? hexToRgb(pick.h) : null
}

// Each mood axis as the pair of words a copywriter can act on (0 is the left word, 100 the right).
const AXES: [string, string, string][] = [
  ['energy', 'calm', 'intense'],
  ['warmth', 'cool', 'warm'],
  ['time', 'nostalgic', 'of the moment'],
  ['intimacy', 'public', 'inward'],
  ['tone', 'earnest', 'ironic'],
]

function Block({ icon, title, source, children }: { icon: ReactNode; title: string; source: string; children: ReactNode }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center gap-2 text-ink-2">{icon}</div>
      <h4 className="t-h3 mt-2">{title}</h4>
      <div className="mt-3 flex-1">{children}</div>
      <div className="mt-4">
        <Source>{source}</Source>
      </div>
    </div>
  )
}

/**
 * The place's sound, look and mood, handed to the people who make the work: a music brief with
 * previews, the palette for the poster and the mood axes as tone of voice. All from the culture profile.
 */
export type PosterTint = 'zone' | 'place' | 'brand'

export function MakersBrief({
  p,
  tint,
  onTint,
  brandColor,
}: {
  p: PlaceProfile
  tint: PosterTint
  onTint: (t: PosterTint) => void
  brandColor?: string | null
}) {
  const artists = (p.sections.find((s) => s.id === 'sound')?.entities ?? []).filter((e) => e.preview).slice(0, 3)
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  const toggle = (id: string, url: string) => {
    audio.current?.pause()
    if (playing === id) return setPlaying(null)
    audio.current = new Audio(url)
    audio.current.volume = 0.6
    audio.current.onended = () => setPlaying(null)
    audio.current.play().catch(() => setPlaying(null))
    setPlaying(id)
  }
  const strong = p.mood ? AXES.map(([k, lo, hi]) => ({ k, lo, hi, v: p.mood!.axes[k as keyof typeof p.mood.axes] })) : []
  const tone = strong
    .filter((a) => Math.abs(a.v - 50) >= 15)
    .sort((a, b) => Math.abs(b.v - 50) - Math.abs(a.v - 50))
    .map((a) => (a.v > 50 ? a.hi : a.lo))

  return (
    <section aria-labelledby="makers-brief">
      <h2 id="makers-brief" className="font-display text-title leading-tight">
        Brief for the makers
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        The place's own sound, look and mood, for the composer, the designer and the copywriter. Taken from its culture profile.
      </p>
      <div className="mt-4 grid gap-5 lg:grid-cols-3">
        <Block icon={<Music2 size={18} />} title="Sound" source="Qloo artists; previews from Deezer; the line is AI interpretation">
          {p.mood?.sounds_like && <p className="text-sm text-ink">Sounds like {p.mood.sounds_like.replace(/\.$/, '').toLowerCase()}.</p>}
          <ul className="mt-4 space-y-2">
            {artists.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(e.id, previewUrl(e.name))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line hover:bg-surface-2"
                  aria-label={`${playing === e.id ? 'Pause' : 'Play'} ${e.preview!.track} by ${e.name}`}
                >
                  {playing === e.id ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{e.name}</div>
                  <div className="t-caption truncate">
                    {e.preview!.track} · {e.lift.toFixed(1)}× here
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Block>

        <Block icon={<Palette size={18} />} title="Look" source="Palette computed from this place's Qloo imagery; the line is AI interpretation">
          {p.mood?.looks_like && <p className="text-sm text-ink">{p.mood.looks_like}</p>}
          <div className="mt-4 flex h-12 overflow-hidden rounded-xl ring-1 ring-line">
            {p.palette.map((c) => (
              <div key={c} className="flex-1" style={{ background: c }} title={c} />
            ))}
          </div>
          <div className="mt-4">
            <div className="text-xs text-mute">Poster color</div>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Poster color">
              {([['zone', 'Zone color'], ['place', 'This palette'], ...(brandColor ? [['brand', 'Brand color']] : [])] as [PosterTint, string][]).map(
                ([k, l]) => (
                  <Chip key={k} selected={tint === k} onClick={() => onTint(k)} role="radio" aria-checked={tint === k}>
                    {k === 'brand' && <span className="h-2.5 w-2.5 rounded-full" style={{ background: brandColor! }} />}
                    {l}
                  </Chip>
                ),
              )}
            </div>
          </div>
        </Block>

        <Block icon={<Type size={18} />} title="Tone of voice" source="Mood axes are AI interpretation of the Qloo genres and titles">
          {tone.length > 0 && <p className="text-sm text-ink">Write it {tone.slice(0, 3).join(', ')}.</p>}
          <ul className="mt-4 space-y-2.5">
            {strong.map((a) => (
              <li key={a.k} className="grid grid-cols-[80px_1fr_96px] items-center gap-2 text-xs text-ink-2">
                <span className="text-right">{a.lo}</span>
                <span className="relative h-1.5 rounded-full bg-surface-2">
                  <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: `${a.v}%` }} />
                </span>
                <span>{a.hi}</span>
              </li>
            ))}
          </ul>
          {p.mood?.feels_like && <p className="mt-4 text-sm text-ink-2">{p.mood.feels_like}</p>}
        </Block>
      </div>
    </section>
  )
}
