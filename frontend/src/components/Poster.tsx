import type { Concept, Geist, WorkspaceSettings } from '../lib/api'
import { cited, posterImages, type RGB } from '../lib/geists'
import { rgb } from '../lib/api'

/**
 * A concept rendered as an editorial poster. The imagery is the zone's own Qloo references (the
 * films, artists and shows the ledger cites), toned in the zone color so they read as one campaign,
 * with a credits line that names them, like the billing block on a film poster.
 */
export function Poster({
  g,
  c,
  color,
  productName,
  size = 'full',
  className = '',
  brand,
  format = '4:5',
  sameOrigin = false,
}: {
  g: Geist
  c: Concept
  color: RGB
  productName: string
  size?: 'full' | 'thumb'
  className?: string
  /** The workspace brand kit: logo in place of the product name, and the headline type. */
  brand?: WorkspaceSettings['brand'] | null
  /** Ad format for the full poster. */
  format?: PosterFormat
  /** Load Qloo images through the backend, so the poster can be drawn to a canvas for export. */
  sameOrigin?: boolean
}) {
  const src = (u: string) => (sameOrigin ? `/api/img?u=${encodeURIComponent(u)}` : u)
  const [hero, second] = posterImages(g, c, 2)
  const thumb = size === 'thumb'
  const credits = [...new Map(c.moodboard.flatMap((m) => cited(g, m.because)).map((e) => [e.id, e.name])).values()].slice(0, 3)
  const deep = `rgb(${color.map((v) => Math.round(v * 0.18)).join(',')})`
  return (
    <div
      className={`relative isolate overflow-hidden text-white ${thumb ? 'aspect-[4/3] rounded-xl' : `${FORMAT_CLASS[format]} rounded-2xl shadow-2xl`} ${className}`}
      style={{ background: deep }}
    >
      {hero && (
        <div className={`absolute inset-x-0 top-0 ${thumb || format === '16:9' ? 'bottom-0' : format === '9:16' ? 'h-[70%]' : 'h-[64%]'}`}>
          <img
            src={src(hero.image!)}
            alt=""
            crossOrigin={sameOrigin ? 'anonymous' : undefined}
            className="h-full w-full object-cover object-top contrast-[1.15] grayscale"
          />
          {/* Duotone: the photo keeps its light, the zone color takes its hue */}
          <div className="absolute inset-0 mix-blend-color" style={{ background: rgb(color, 0.78) }} />
          <div className="absolute inset-0 mix-blend-multiply" style={{ background: rgb(color, 0.22) }} />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, ${deep} 0%, transparent ${thumb ? '75%' : '45%'})`,
            }}
          />
        </div>
      )}
      {!thumb && second && (format === '4:5' || format === '9:16') && (
        <img
          src={src(second.image!)}
          alt=""
          loading="lazy"
          className="absolute right-[7%] top-[36%] aspect-[3/4] w-[26%] rotate-[3deg] rounded-md object-cover shadow-2xl ring-1 ring-white/20 grayscale"
        />
      )}

      {!thumb && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 md:p-6">
          {brand?.logo ? (
            <img src={brand.logo} alt={brand.name || productName} className="h-7 max-w-[40%] object-contain object-left brightness-0 invert" />
          ) : (
            <span className="text-[13px] font-semibold uppercase tracking-[0.22em]">{brand?.name || productName}</span>
          )}
          <span className="text-xs font-medium uppercase tracking-[0.22em] text-white/70">{c.direction}</span>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 ${thumb ? 'p-3.5' : 'p-6 md:p-8'}`}>
        <h3
          className={
            thumb
              ? 't-h2 leading-tight'
              : brand?.font === 'sans'
                ? 'text-[clamp(2rem,1.2rem+2vw,3rem)] font-semibold leading-[1] tracking-tight'
                : 'font-display text-[clamp(2.5rem,1.4rem+2.6vw,3.6rem)] leading-[0.95]'
          }
          style={{ textWrap: 'balance' }}
        >
          {c.headline?.text ?? c.direction}
        </h3>
        {!thumb && c.body && <p className="mt-4 line-clamp-3 max-w-md text-sm leading-relaxed text-white/75">{c.body.text}</p>}
        {!thumb && credits.length > 0 && (
          <div className="mt-5 border-t border-white/15 pt-3 text-xs font-medium uppercase tracking-[0.2em] text-white/55">
            In the spirit of {credits.join(' · ')}
            <span className="mt-1 block normal-case tracking-normal text-white/45">
              Moodboard of Qloo references, not licensed imagery. Concept written by AI.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export type PosterFormat = '4:5' | '1:1' | '9:16' | '16:9'
export const POSTER_FORMATS: { id: PosterFormat; label: string; use: string; px: [number, number] }[] = [
  { id: '4:5', label: '4:5', use: 'Feed post', px: [1080, 1350] },
  { id: '1:1', label: '1:1', use: 'Square post, display', px: [1080, 1080] },
  { id: '9:16', label: '9:16', use: 'Stories, Reels, TikTok, DOOH portrait', px: [1080, 1920] },
  { id: '16:9', label: '16:9', use: 'Online video end card, DOOH landscape', px: [1920, 1080] },
]
const FORMAT_CLASS: Record<PosterFormat, string> = { '4:5': 'aspect-[4/5]', '1:1': 'aspect-square', '9:16': 'aspect-[9/16]', '16:9': 'aspect-video' }

/** The generic concept a model writes without Qloo: deliberately anonymous, type on a flat plate. */
export function GenericPoster({ headline, size = 'thumb' }: { headline: string; size?: 'full' | 'thumb' }) {
  const thumb = size === 'thumb'
  return (
    <div className={`relative overflow-hidden bg-surface-2 text-mute ring-1 ring-line ${thumb ? 'aspect-[4/3] rounded-xl' : 'aspect-[4/5] rounded-2xl'}`}>
      <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgba(128,128,128,0.08)_14px_15px)]" />
      <div className="absolute left-4 top-4 text-xs font-semibold uppercase tracking-[0.22em] opacity-60">Generic imagery</div>
      <div className={`absolute inset-x-0 bottom-0 ${thumb ? 'p-4' : 'p-8'}`}>
        <h3 className={`font-semibold tracking-tight ${thumb ? 'text-xl' : 'text-4xl'}`}>{headline}</h3>
      </div>
    </div>
  )
}
