export type Domain = 'artist' | 'tv_show' | 'movie' | 'podcast' | 'brand'

export interface LedgerEntity {
  id: string
  name: string
  domain: Domain
  affinity: number
  popularity: number | null
  image: string | null
  explain: Record<string, number> | null
  lift: number
  lift_outside?: number
}

export interface MarketMap {
  name: string
  center: [number, number]
  parent: string | null
  zone: string
  top: LedgerEntity[]
  tags: { id: string; name: string; subtype: string }[]
}

export interface Cited {
  text: string
  because: string[]
  /** Rewritten by the user; the citations are the original's */
  edited?: boolean
}

export interface PanelPersona {
  id: string
  market: string
  age: string
  gender: string
  affinities: { id: string; name: string; domain: Domain }[]
  attention: number
  resonance: number
  interest: number
  stop_scrolling: boolean
  would_consider: boolean
  quote: string
  feels_off: string
  /** The words were withheld for leaning on a stereotype (backend/app/responsible.py); the scores still count. */
  withheld?: boolean
  compare_to: string
}

export interface Panel {
  size: number
  stop_scrolling: number
  would_consider: number
  avg: { attention: number; resonance: number; interest: number }
  top_objection: string
  fix: string
  personas: PanelPersona[]
}

export interface Concept {
  id: string
  direction: string
  big_idea: Cited | null
  headline: Cited | null
  body: Cited | null
  moodboard: Cited[]
  music: Cited | null
  partners: Cited[]
  channels: Cited[]
  template?: boolean
  panel?: Panel | null
  image?: string | null
  /** Séance result before "apply fix and re-test", if the fix was applied. */
  before?: {
    stop_scrolling: number
    would_consider: number
    size: number
    headline: string | null
  } | null
}

export interface Place {
  id: string
  name: string
  image: string | null
  affinity: number
}

/** A taste zone or a neighborhood: the unit everything is planned around. */
export interface Geist {
  key: string
  kind: 'zone' | 'neighborhood'
  label: string
  markets: string[]
  center?: [number, number]
  parent?: string | null
  ledger: LedgerEntity[]
  geist: string
  tags?: string[]
  persona?: { name: string; tagline: string }
  places?: Place[]
  concepts?: Concept[]
  chosen?: number
  baseline_panel?: Panel | null
}

export type Zone = Geist
export type Neighborhood = Geist

export interface Overlap {
  a: string
  b: string
  shared: number
  size: number
  pct: number
}

export interface PlanZone {
  key: string
  name: string
  label: string
  markets: string[]
  share: number
  budget: number
  channels: { channel: string; label: string; budget: number }[]
  audience: {
    age: string[]
    gender: string
    interests: Record<string, string[]>
  }
  geo: { name: string; lat: number; lon: number; radius_km: number }[]
  creative: { id: string; headline: string | null; direction: string } | null
  ab_test: {
    a: { id: string; headline: string | null }
    b: { id: string; headline: string | null }
    split: string
    metric: string
    impressions_per_arm: number
    assumption: string
  } | null
}

export interface MediaPlan {
  start: string
  end: string
  currency: string
  budget: number
  channels: { channel: string; label: string }[]
  zones: PlanZone[]
  flighting: {
    phase: string
    channel: string
    label: string
    start: string
    end: string
  }[]
  method: string
  edited?: boolean
}

export interface LlmOnlyConcept {
  big_idea: string
  headline: string
  body: string
  moodboard: string[]
  music: string
  partners: string[]
  channels: string[]
}

export interface RunResult {
  brief: {
    id: string
    title: string
    product: string
    product_name: string
    objective: string
    headline: string
    age: string[]
    budget: number | null
    currency: string
    gender?: string | null
    scope?: string
    channels?: string[]
  }
  anchors: { id: string; name: string; type: string; image?: string | null }[]
  markets: MarketMap[]
  zones: Zone[]
  splits: { city: string; neighborhoods: Neighborhood[] }[]
  groups: Geist[]
  plan: MediaPlan
  headline?: string
  overlap?: { markets: Overlap[]; neighborhoods: Overlap[] }
  country_heat?: { lat: number; lon: number; rank: number; lift: number }[]
  demographics: {
    entity_id: string
    query: { age: Record<string, number>; gender: Record<string, number> }
  }[]
  llm_only: LlmOnlyConcept | null
  trace?: Trace
}

/** What the agent did during a run, in order (backend/app/trace.py). */
export interface Trace {
  finished: number
  seconds: number
  steps: { t: number; step: string; text: string; market?: string | null }[]
  calls: {
    t: number
    kind: 'qloo' | 'llm'
    label: string
    path?: string | null
    cached: boolean
    ms: number
    usd: number
    model?: string | null
    note?: string | null
  }[]
  warnings: { t: number; text: string }[]
  totals: {
    qloo_calls: number
    qloo_cached: number
    llm_calls: number
    llm_cached: number
    usd: number
    rejected_elements: number
  }
}

export interface Demo {
  id: string
  title: string
  product: string
  objective: string
  headline: string
  markets: string[]
  anchors: string[]
  budget: number | null
  currency: string
  age: string[]
}

/** Workspace settings (backend/app/main.py _clean_settings). The Slack webhook never comes back, only whether one is set. */
export interface WorkspaceSettings {
  brand?: { name: string; logo: string | null; color: string | null; font: 'serif' | 'sans' }
  agency?: { name: string; logo: string | null }
  client?: string
  defaults?: { currency: string; budget: number; channels: string[] }
  ai?: { provider: 'tastegeist'; tone: 'balanced' | 'bold' | 'understated' | 'playful'; house_rules: string; banned: string[]; language: 'en' }
  slack?: boolean
}

/** Local moments in the flight window (backend/app/calendar.py). */
export interface CampaignCalendar {
  start: string
  end: string
  countries: Record<string, string[]>
  moments: {
    date: string
    kind: 'holiday' | 'anniversary'
    title: string
    why: string
    markets?: string[]
    country?: string
    zone?: string
    zone_label?: string
    lift?: number
    image?: string | null
    round?: boolean
  }[]
}

/** One run of a campaign, summarised for comparison. */
export interface RunVersion {
  n: number
  created: number
  current: boolean
  headline: string | null
  groups: {
    key: string
    label: string
    kind: 'zone' | 'neighborhood'
    name: string | null
    headline: string | null
    stops: number | null
    size: number | null
    base_stops: number | null
    ledger: string[]
  }[]
  budget: Record<string, number>
}

/** A piece of the result, streamed as soon as it exists (backend/app/pipeline.py). */
export interface PartialGroup {
  key: string
  kind?: 'zone' | 'neighborhood'
  label?: string
  parent?: string
  points?: { name: string; center: [number, number] }[]
  top?: { id: string; name: string; image: string | null; lift: number }[]
  name?: string
  tagline?: string
}

/** Measured run time from real runs (backend/app/runstats.py). */
export interface RunStats {
  runs: number
  p50: number | null
  p95: number | null
  /** How far into a run each step starts, as a share of the total. */
  steps: Record<string, number>
}

export interface LogEvent {
  /** Seconds since the run started (stamped by the server). */
  t?: number
  type: 'qloo' | 'llm' | 'step' | 'warn' | 'error' | 'partial'
  stage?: 'zones' | 'geists' | 'concepts' | 'seance'
  groups?: PartialGroup[]
  key?: string
  headlines?: (string | null)[]
  headline?: string | null
  stops?: number | null
  size?: number | null
  base_stops?: number | null
  model?: string
  usd?: number
  text?: string
  label?: string
  path?: string
  cached?: boolean
  ms?: number
  status?: number
}

/** One title in a place's culture profile, with its lift here and in the campaign's other places. */
export interface ProfileEntity {
  id: string
  name: string
  domain: string
  image: string | null
  popularity: number | null
  lift: number
  elsewhere: Record<string, number>
  /** Rank in each place's Qloo list for the domain, and the list length; rank null when absent. */
  ranks?: Record<string, [number | null, number]>
  preview?: { track: string; preview: string; cover: string; link: string }
}

export interface PlaceProfile {
  /** Rank of each ledger title in every place's Qloo list for its domain: [rank or null, list length]. */
  ledger_ranks?: Record<string, Record<string, [number | null, number]>>
  key: string
  label: string
  kind: 'zone' | 'neighborhood'
  markets: string[]
  compared_with: string[]
  sections: {
    id: 'sound' | 'screen' | 'style' | 'listens' | 'reads' | 'travels'
    title: string
    domains: string[]
    entities: ProfileEntity[]
  }[]
  tags: {
    id: string
    name: string
    kind: 'music' | 'media'
    affinity: number
  }[]
  demographics: {
    entity_id: string
    query: { age: Record<string, number>; gender: Record<string, number> }
  }[]
  venues: { id: string; name: string; image: string | null }[]
  palette: string[]
  mood: {
    axes: {
      energy: number
      warmth: number
      time: number
      intimacy: number
      tone: number
    }
    sounds_like: string
    looks_like: string
    feels_like: string
  } | null
  day?: { time: 'Morning' | 'Afternoon' | 'Evening' | 'Late'; text: string; refs: string[] }[] | null
  sources: Record<string, string>
}

export interface HeatCell {
  geohash: string
  lat: number
  lon: number
  affinity: number
  rank: number
  popularity: number
  lift: number
}

export interface CampaignSummary {
  id: string
  title: string
  product_name: string
  headline: string
  objective: string
  scope: 'country' | 'cities' | 'city'
  markets: string[]
  status: 'draft' | 'running' | 'ready' | 'failed'
  demo: boolean
  created: number
  updated: number
  thumbs: string[]
  zones: number
}

export interface CampaignDetail extends CampaignSummary {
  /** White label for the client report: the owner's brand kit and agency details (never on demos). */
  branding?: Pick<WorkspaceSettings, 'brand' | 'agency' | 'client'>
  brief: Record<string, unknown> & {
    product: string
    budget: number | null
    currency: string
    channels?: string[]
    start?: string
    end?: string
    age?: string[]
  }
  result: RunResult | null
  running: boolean
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init })
  if (!r.ok) {
    let msg = r.statusText
    try {
      msg = (await r.json()).detail ?? msg
    } catch {
      // non-JSON error body
    }
    throw new ApiError(r.status, msg)
  }
  return r.json()
}

export const api = {
  campaigns: () => json<CampaignSummary[]>('/api/campaigns'),
  campaign: (id: string) => json<CampaignDetail>(`/api/campaigns/${id}`),
  /** Read-only, for anyone with the link */
  report: (id: string) => json<CampaignDetail>(`/api/report/${id}`),
  run: (id: string) =>
    json<{ campaign_id: string }>(`/api/campaigns/${id}/run`, {
      method: 'POST',
    }),
  choose: (id: string, group: string, concept: string) =>
    json<{ ok: boolean }>(`/api/campaigns/${id}/choose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, concept }),
    }),
  localities: (q: string) =>
    json<
      {
        id: string
        name: string
        disambiguation: string
        center: [number, number]
      }[]
    >(`/api/localities/search?q=${encodeURIComponent(q)}`),
  searchEntities: (q: string) => json<{ id: string; name: string; type: string; image: string | null }[]>(`/api/qloo/search?q=${encodeURIComponent(q)}`),
  productCard: (body: { name: string; description: string; url?: string; audience?: string; website?: string; elapsed_ms?: number }) =>
    json<{
      name: string
      category: string
      price_tier: string
      claims: string[]
      tone: string
      anchors: {
        id: string
        name: string
        type: string
        image: string | null
        why?: string
      }[]
    }>('/api/brief/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  createCampaign: (body: Record<string, unknown>) =>
    json<{ id: string }>('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  profile: (id: string, key: string) => json<PlaceProfile>(`/api/campaigns/${id}/profile/${encodeURIComponent(key)}`),
  applyFix: (id: string, group: string, concept: string) =>
    json<{ concept: Concept }>(`/api/campaigns/${id}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, concept }),
    }),
  setBudget: (id: string, shares: Record<string, number>) =>
    json<MediaPlan>(`/api/campaigns/${id}/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shares }),
    }),
  renameCampaign: (id: string, title: string) =>
    json<{ ok: boolean }>(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
  duplicateCampaign: (id: string) => json<{ id: string }>(`/api/campaigns/${id}/duplicate`, { method: 'POST' }),
  deleteCampaign: (id: string) => json<{ ok: boolean }>(`/api/campaigns/${id}`, { method: 'DELETE' }),
  editConcept: (id: string, group: string, concept: string, field: 'headline' | 'big_idea' | 'body', text: string) =>
    json<{ concept: Concept }>(`/api/campaigns/${id}/concept`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, concept, field, text }),
    }),
  settings: () => json<WorkspaceSettings>('/api/workspace/settings'),
  saveSettings: (body: Partial<WorkspaceSettings> & { slack_webhook?: string }) =>
    json<WorkspaceSettings>('/api/workspace/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  calendar: (id: string) => json<CampaignCalendar>(`/api/campaigns/${id}/calendar`),
  versions: (id: string) => json<RunVersion[]>(`/api/campaigns/${id}/versions`),
  slack: (id: string) => json<{ ok: boolean }>(`/api/campaigns/${id}/slack`, { method: 'POST' }),
  entity: (id: string, domain: string) =>
    json<{ demographics: { age: Record<string, number>; gender: Record<string, number> }; related: { id: string; name: string; image: string | null }[] }>(
      `/api/entity/${encodeURIComponent(id)}?domain=${encodeURIComponent(domain)}`,
    ),
  preview: (body: { anchors: string[]; places: { name: string; center: [number, number] }[]; scope: string }) =>
    json<{
      places: {
        name: string
        center: [number, number]
        top: { id: string; name: string; domain: string; image: string | null }[]
        distinct: number
        coverage?: 'none' | 'thin' | 'ok'
        read: number
      }[]
      overlap: { a: string; b: string; pct: number }[]
      heat: HeatCell[]
    }>('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteWorkspace: () => json<{ deleted: number }>('/api/workspace', { method: 'DELETE' }),
  runStats: () => json<RunStats>('/api/run-stats'),
  status: () => json<{ app: 'ok'; qloo: 'ok' | 'slow' | 'degraded' | 'down' | 'unknown' | 'off'; model: 'ok' | 'near' | 'cap' | 'off' }>('/api/status'),
  health: () =>
    json<{
      ok: boolean
      llm: boolean
      llm_spent_today: number
      llm_daily_cap: number
    }>('/api/health'),
}

/** Follow a campaign run. Resolves when the run ends; reattaches to a run already in progress. */
export function followRun(id: string, onEvent: (e: LogEvent) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/campaigns/${id}/events`)
    for (const t of ['qloo', 'llm', 'step', 'warn', 'partial']) {
      es.addEventListener(t, (m) => onEvent(JSON.parse((m as MessageEvent).data)))
    }
    es.addEventListener('error', (m) => {
      const data = (m as MessageEvent).data
      if (data) {
        es.close()
        reject(new Error(JSON.parse(data).text))
      }
    })
    es.addEventListener('end', () => {
      es.close()
      resolve()
    })
  })
}

/** A fresh Deezer preview for an artist (stored preview links expire; the server looks it up at play time). */
export const previewUrl = (artist: string) => `/api/preview-audio?artist=${encodeURIComponent(artist)}`

export async function fetchHeatmap(city: string, entityIds: string[]): Promise<HeatCell[]> {
  const r = await fetch(`/api/heatmap?city=${encodeURIComponent(city)}&entities=${entityIds.join(',')}`)
  if (!r.ok) throw new Error(await r.text())
  return (await r.json()).cells
}

export const DOMAIN_LABEL: Record<Domain, string> = {
  artist: 'Music',
  tv_show: 'TV',
  movie: 'Film',
  podcast: 'Podcast',
  brand: 'Brand',
}

// Zone palette, "warm ink": terracotta, sage, ochre, dusty rose, slate, plum. Each geist takes the
// next color in order, so zones and neighborhoods never share one. Checked for color blindness:
// every pair stays at least 14 CIELAB units apart under simulated protanopia, deuteranopia and
// tritanopia (Machado 2009), and the plum keeps 3:1 contrast on the dark map.
export const ZONE_COLORS: [number, number, number][] = [
  [217, 102, 63],
  [150, 190, 150],
  [212, 164, 58],
  [196, 110, 140],
  [124, 147, 184],
  [130, 84, 160],
]

export const NEIGHBORHOOD_COLORS: [number, number, number][] = [
  [212, 164, 58],
  [196, 110, 140],
]

export const rgb = (c: [number, number, number], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** People, film and TV make better hero imagery than brand logos; keep order otherwise. */
export function heroFirst<T extends { domain: Domain }>(items: T[]): T[] {
  const logoish = (d: Domain) => d === 'brand' || d === 'podcast'
  return [...items.filter((e) => !logoish(e.domain)), ...items.filter((e) => logoish(e.domain))]
}

/** "11 Nov 2026": unambiguous in every market. */
export const fmtDate = (d: string | number | Date) =>
  new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
