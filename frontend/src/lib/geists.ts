import { heroFirst, ZONE_COLORS, type Concept, type Geist, type LedgerEntity, type RunResult } from './api'
import type { MapGeist } from '../components/MapView'

export type RGB = [number, number, number]

export const colorOf = (result: RunResult, key: string): RGB => {
  const i = result.groups.findIndex((g) => g.key === key)
  return ZONE_COLORS[(i < 0 ? 0 : i) % ZONE_COLORS.length]
}

export const personaName = (g: Geist) => g.persona?.name || g.label

/** Short place name for a geist: "De Pijp", or "Amsterdam + Berlin". */
export const placeName = (g: Geist) => (g.kind === 'neighborhood' ? g.label : g.markets.join(' + '))

export function mapGeists(result: RunResult): MapGeist[] {
  const centers = Object.fromEntries(result.markets.map((m) => [m.name, m.center]))
  return result.groups.map((g, i) => ({
    key: g.key,
    label: personaName(g),
    color: ZONE_COLORS[i % ZONE_COLORS.length],
    kind: g.kind,
    parent: g.parent,
    area: result.brief.scope === 'city',
    points:
      g.kind === 'neighborhood' && g.center
        ? [{ name: g.label, center: g.center }]
        : g.markets.filter((m) => centers[m]).map((m) => ({ name: m, center: centers[m] })),
  }))
}

export const chosenConcept = (g: Geist): Concept | undefined => g.concepts?.[g.chosen ?? 0]

/** Ledger entities a concept element cites. */
export function cited(g: Geist, ids: string[] | undefined): LedgerEntity[] {
  const by = Object.fromEntries(g.ledger.map((e) => [e.id, e]))
  return (ids ?? []).map((id) => by[id]).filter(Boolean)
}

/** Imagery for a concept poster: its moodboard references first, people and film before logos. */
export function posterImages(g: Geist, c: Concept, n = 3): LedgerEntity[] {
  const pick = (x: Concept, taken: Set<string>) => {
    const refs = x.moodboard.flatMap((m) => cited(g, m.because))
    const uniq = new Map([...refs, ...g.ledger].filter((e) => e.image).map((e) => [e.id, e]))
    const list = heroFirst([...uniq.values()])
    // Each concept leads with an image no earlier concept of the zone already leads with.
    return [...list.filter((e) => !taken.has(e.id)), ...list.filter((e) => taken.has(e.id))]
  }
  const taken = new Set<string>()
  for (const x of g.concepts ?? []) {
    if (x.id === c.id) break
    const lead = pick(x, taken)[0]
    if (lead) taken.add(lead.id)
  }
  return pick(c, taken).slice(0, n)
}

export const geistByKey = (result: RunResult, key: string | null | undefined) => result.groups.find((g) => g.key === key)
