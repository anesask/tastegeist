import { Download, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Concept, Geist, WorkspaceSettings } from '../lib/api'
import type { RGB } from '../lib/geists'
import { POSTER_FORMATS, Poster, type PosterFormat } from './Poster'
import { useToast } from './ui'

// Each format is laid out at this CSS width and exported at the format's pixel size.
const BASE: Record<PosterFormat, number> = { '4:5': 540, '1:1': 540, '9:16': 540, '16:9': 960 }

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/**
 * The chosen concept in the common ad sizes, each downloadable as a PNG at full resolution.
 * Moodboard imagery stays labeled: these are layouts to brief production, not licensed creative.
 */
export function AdFormats({
  g,
  c,
  color,
  productName,
  brand,
}: {
  g: Geist
  c: Concept
  color: RGB
  productName: string
  brand?: WorkspaceSettings['brand'] | null
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const toast = useToast()

  async function download(id: PosterFormat) {
    const node = refs.current[id]
    if (!node) return
    setBusy(id)
    try {
      const { toPng } = await import('html-to-image')
      const f = POSTER_FORMATS.find((x) => x.id === id)!
      const url = await toPng(node, { pixelRatio: f.px[0] / BASE[id], cacheBust: false })
      const a = document.createElement('a')
      a.href = url
      a.download = `${slug(productName)}-${slug(c.headline?.text ?? c.direction)}-${id.replace(':', 'x')}.png`
      a.click()
    } catch {
      toast('Could not render that format. Try again in a moment.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="ad-formats">
      <h2 id="ad-formats" className="font-display text-title leading-tight">
        Ad formats
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-mute">
        This concept laid out for feed, stories, display and video end cards. Download each as a PNG to brief production; the imagery is a moodboard of Qloo
        references, not licensed creative.
      </p>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        {POSTER_FORMATS.map((f) => {
          const w = BASE[f.id]
          const scale = f.id === '16:9' ? 0.42 : 0.38
          const h = w * (f.px[1] / f.px[0])
          return (
            <figure key={f.id} className="flex flex-col">
              <div className="overflow-hidden rounded-xl" style={{ width: w * scale, height: h * scale }}>
                <div style={{ width: w, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                  <div ref={(el) => void (refs.current[f.id] = el)} style={{ width: w }}>
                    <Poster g={g} c={c} color={color} productName={productName} brand={brand} format={f.id} sameOrigin className="!rounded-none !shadow-none" />
                  </div>
                </div>
              </div>
              <figcaption className="mt-2 flex items-center justify-between gap-3" style={{ width: w * scale }}>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {f.label} <span className="tabular font-normal text-mute">{f.px.join(' × ')}</span>
                  </span>
                  <span className="t-caption block truncate">{f.use}</span>
                </span>
                <button
                  type="button"
                  onClick={() => download(f.id)}
                  disabled={!!busy}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line hover:bg-surface-2 disabled:opacity-50"
                  aria-label={`Download ${f.label} PNG`}
                >
                  {busy === f.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                </button>
              </figcaption>
            </figure>
          )
        })}
      </div>
    </section>
  )
}
