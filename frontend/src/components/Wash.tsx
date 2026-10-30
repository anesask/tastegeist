/**
 * A soft wash of cover art behind a card: two covers, heavily blurred, in opposite corners.
 * The parent needs `relative isolate overflow-hidden` and `group` to brighten it on hover.
 */
export function Wash({ images, strength = 'soft' }: { images: (string | null | undefined)[]; strength?: 'soft' | 'strong' }) {
  const [a, b] = images.filter(Boolean) as string[]
  const base = strength === 'strong' ? 'opacity-35 group-hover:opacity-45' : 'opacity-20 group-hover:opacity-28'
  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 transition-opacity duration-1000 ${base}`} aria-hidden>
      {a && <img src={a} alt="" className="absolute -left-1/4 -top-1/4 h-[90%] w-[90%] object-cover blur-xl saturate-150" />}
      {b && <img src={b} alt="" className="absolute -bottom-1/4 -right-1/4 h-[90%] w-[90%] object-cover blur-xl saturate-150" />}
    </div>
  )
}
