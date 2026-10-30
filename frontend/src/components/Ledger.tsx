import { DOMAIN_LABEL, type LedgerEntity } from '../lib/api'

/** A ledger chip: one Qloo entity and its lift. Hover shows the evidence. */
export function LedgerChip({ e, anchors }: { e: LedgerEntity; anchors?: Record<string, string> }) {
  const why = e.explain
    ? Object.entries(e.explain)
        .sort((a, b) => b[1] - a[1])
        .map(([id, s]) => `${anchors?.[id] ?? id.slice(0, 6)} ${Math.round(s * 100)}%`)
        .join(' · ')
    : ''
  return (
    <span
      title={`${e.name} (${DOMAIN_LABEL[e.domain]})\nLift ${e.lift.toFixed(2)}×${e.lift_outside != null ? ` here vs ${e.lift_outside.toFixed(2)}× elsewhere` : ''}\nQloo entity ${e.id}${why ? `\nDriven by: ${why}` : ''}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 py-0.5 pl-0.5 pr-2.5 text-xs"
    >
      {e.image ? <img src={e.image} alt="" className="h-5 w-5 rounded-full object-cover" loading="lazy" /> : <span className="h-5 w-5 rounded-full bg-line" />}
      <span>{e.name}</span>
      <span className="tabular text-xs text-amber">{e.lift.toFixed(1)}×</span>
    </span>
  )
}

export function LedgerList({ items, anchors, max = 10 }: { items: LedgerEntity[]; anchors?: Record<string, string>; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, max).map((e) => (
        <LedgerChip key={e.id} e={e} anchors={anchors} />
      ))}
    </div>
  )
}

/** A strip of Qloo photos: the zone's cultural references at a glance. */
export function PhotoStrip({ items, max = 5, size = 'h-14' }: { items: LedgerEntity[]; max?: number; size?: string }) {
  return (
    <div className="flex gap-1">
      {items
        .filter((e) => e.image)
        .slice(0, max)
        .map((e) => (
          <img key={e.id} src={e.image!} alt={e.name} title={e.name} className={`${size} flex-1 rounded-md object-cover`} loading="lazy" />
        ))}
    </div>
  )
}
