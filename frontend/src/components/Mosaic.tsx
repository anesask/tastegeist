/**
 * A consistent image block for cards: one lead image and two supporting ones, always the same
 * frame, so Qloo posters and portraits of different shapes read as one set. Logos stay out:
 * a cropped wordmark looks broken (callers pass non-brand imagery).
 */
export function Mosaic({ images, className = '' }: { images: string[]; className?: string }) {
  const [a, b, c] = images
  if (!a) return <div className={`bg-gradient-to-br from-coral-soft to-amber-soft ${className}`} />
  return (
    <div className={`grid grid-cols-3 grid-rows-2 gap-0.5 overflow-hidden bg-surface-2 ${className}`}>
      <img src={a} alt="" loading="lazy" className={`h-full w-full object-cover object-top ${b ? 'col-span-2 row-span-2' : 'col-span-3 row-span-2'}`} />
      {b && <img src={b} alt="" loading="lazy" className={`h-full w-full object-cover object-top ${c ? '' : 'row-span-2'}`} />}
      {c && <img src={c} alt="" loading="lazy" className="h-full w-full object-cover object-top" />}
    </div>
  )
}
