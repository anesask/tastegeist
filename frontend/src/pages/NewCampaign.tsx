import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Building2, Check, Globe2, Loader2, MapPin, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, api } from '../lib/api'
import { askToNotify } from '../lib/notify'
import { BriefPreview } from '../components/BriefPreview'
import { Button, Card, Chip as UiChip } from '../components/ui'
import { useTitle } from '../lib/title'
import { useSettings } from '../lib/settings'
import { typicalRun, useRunStats } from '../lib/runtime'

type Scope = 'country' | 'cities' | 'city'
type Place = {
  id: string
  name: string
  disambiguation: string
  center: [number, number]
}
type Anchor = {
  id: string
  name: string
  type: string
  image: string | null
  why?: string
}

interface Draft {
  name: string
  description: string
  url: string
  objective: string
  age: string[]
  gender: string
  audience: string
  scope: Scope
  places: Place[]
  budget: string
  currency: string
  start: string
  end: string
  channels: string[]
  constraints: string
  anchors: Anchor[]
  card: {
    category: string
    price_tier: string
    claims: string[]
    tone: string
  } | null
}

const EMPTY: Draft = {
  name: '',
  description: '',
  url: '',
  objective: 'launch',
  age: ['25_to_29', '30_to_34'],
  gender: '',
  audience: '',
  scope: 'cities',
  places: [],
  budget: '25000',
  currency: 'EUR',
  start: '',
  end: '',
  channels: ['social', 'online_video', 'audio', 'ooh', 'influencers'],
  constraints: '',
  anchors: [],
  card: null,
}

const AGES: [string, string][] = [
  ['24_and_younger', '24 and under'],
  ['25_to_29', '25-29'],
  ['30_to_34', '30-34'],
  ['35_to_44', '35-44'],
  ['45_to_54', '45-54'],
  ['55_and_older', '55+'],
]
const GOALS: [string, string][] = [
  ['launch', 'Launch'],
  ['awareness', 'Awareness'],
  ['consideration', 'Consideration'],
  ['sales', 'Sales'],
]
const CHANNELS: [string, string][] = [
  ['social', 'Social'],
  ['online_video', 'Online video'],
  ['audio', 'Audio'],
  ['ooh', 'OOH'],
  ['influencers', 'Influencers'],
  ['press', 'Press'],
]
const STEPS = [
  ['Campaign brief', 'Tell us about your product'],
  ['Where', 'Country, cities or one city'],
  ['Budget and channels', 'How you will buy it'],
  ['Review and generate', 'Confirm the anchors'],
]
const DRAFT_KEY = 'tg-draft'

function loadDraft(): Draft {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }
  } catch {
    return EMPTY
  }
}

function Field({ label, hint, error, group = false, children }: { label: string; hint?: string; error?: string; group?: boolean; children: ReactNode }) {
  const id = useId()
  const body = (
    <>
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      {hint && <span className="ml-2 text-xs text-mute">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <span className="mt-1 block text-xs text-coral">{error}</span>}
    </>
  )
  // Chip groups are buttons: a <label> around them would give the first button the whole group's text as its name.
  return group ? (
    <div role="group" aria-labelledby={id}>
      {body}
    </div>
  ) : (
    <label className="block">{body}</label>
  )
}

const input = 'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-ink/10'

function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <UiChip selected={on} onClick={onClick}>
      {children}
    </UiChip>
  )
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function PlaceSearch({ onPick, placeholder }: { onPick: (p: Place) => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const res = useQuery({
    queryKey: ['loc', dq],
    queryFn: () => api.localities(dq),
    enabled: dq.trim().length >= 2,
  })
  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input className={`${input} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        {res.isFetching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-mute" />}
      </div>
      {q.trim().length >= 2 && res.data && (
        <ul className="card absolute z-20 mt-1 max-h-72 w-full overflow-y-auto p-1" role="listbox">
          {res.data.length === 0 && <li className="px-3 py-2 text-sm text-mute">No place found on Qloo. Try the English name.</li>}
          {res.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  onPick(p)
                  setQ('')
                }}
              >
                <MapPin size={15} className="mt-0.5 shrink-0 text-mute" />
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.disambiguation && <span className="block text-xs text-mute">{p.disambiguation}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AnchorSearch({ onPick }: { onPick: (a: Anchor) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const res = useQuery({
    queryKey: ['ent', dq],
    queryFn: () => api.searchEntities(dq),
    enabled: dq.trim().length >= 2,
  })
  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <input
          className={`${input} pl-9`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Add a brand, artist, film or show"
          aria-label="Search Qloo for an anchor"
        />
      </div>
      {q.trim().length >= 2 && res.data && (
        <ul className="card absolute z-20 mt-1 max-h-72 w-full overflow-y-auto p-1">
          {res.data.length === 0 && <li className="px-3 py-2 text-sm text-mute">Nothing on Qloo for that name.</li>}
          {res.data.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  onPick(a)
                  setQ('')
                }}
              >
                {a.image ? <img src={a.image} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="h-8 w-8 rounded-lg bg-surface-2" />}
                <span>
                  <span className="font-medium">{a.name}</span>
                  <span className="block text-xs capitalize text-mute">{a.type.split(':').pop()?.replace('_', ' ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function NewCampaign() {
  useTitle('New campaign')
  const [d, setD] = useState<Draft>(loadDraft)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const navigate = useNavigate()
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  // A fresh brief starts from the workspace defaults (Settings); a saved draft keeps its own values.
  const settings = useSettings()
  const runStats = useRunStats()
  const [fresh] = useState(() => {
    try {
      return !localStorage.getItem(DRAFT_KEY)
    } catch {
      return true
    }
  })
  useEffect(() => {
    const def = settings.data?.defaults
    if (!fresh || !def) return
    setD((x) => ({
      ...x,
      currency: def.currency || x.currency,
      budget: def.budget ? String(def.budget) : x.budget,
      channels: def.channels.length ? def.channels : x.channels,
    }))
  }, [fresh, settings.data])

  // A complete, real brief in one click, so the whole flow can be seen without typing.
  const [exampleLoading, setExampleLoading] = useState(false)
  async function tryExample() {
    setExampleLoading(true)
    try {
      const city = (await api.localities('Lisbon'))[0]
      const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
      setD({
        ...EMPTY,
        name: 'Saudade',
        description: 'A cold brew coffee with a melancholic, late-night character: slow-steeped, small batch, sold in cafés and record shops. Premium price.',
        audience: 'Night owls, music lovers, people who linger',
        scope: 'city',
        places: city ? [city] : [],
        budget: '30000',
        start: day(21),
        end: day(63),
      })
      setStep(0)
    } finally {
      setExampleLoading(false)
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      // draft autosave is best effort
    }
  }, [d])

  // Abuse protection (backend/app/guard.py): time on the form and a honeypot only bots fill in.
  const openedAt = useRef(Date.now())
  const [honey, setHoney] = useState('')
  const guard = () => ({ website: honey, elapsed_ms: Date.now() - openedAt.current })

  const card = useMutation({
    mutationFn: () =>
      api.productCard({
        name: d.name,
        description: d.description,
        url: d.url || undefined,
        audience: d.audience,
        ...guard(),
      }),
    onSuccess: (c) => {
      setD((x) => ({
        ...x,
        card: {
          category: c.category,
          price_tier: c.price_tier,
          claims: c.claims,
          tone: c.tone,
        },
        anchors: x.anchors.length ? x.anchors : c.anchors,
      }))
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { id } = await api.createCampaign({
        ...guard(),
        name: d.name.trim(),
        description: d.description.trim(),
        objective: d.objective,
        age: d.age,
        gender: d.gender || null,
        scope: d.scope,
        places: d.places.map((p) => ({ name: p.name, center: p.center })),
        budget: Number(d.budget) || null,
        currency: d.currency,
        start: d.start || null,
        end: d.end || null,
        channels: d.channels,
        constraints: d.constraints,
        anchors: d.anchors,
      })
      await api.run(id)
      return id
    },
    onSuccess: (id) => {
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      navigate(`/app/c/${id}`)
    },
  })

  function validate(s: number): boolean {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!d.name.trim()) e.name = 'Give the product a name'
      if (!d.description.trim() && !d.url.trim()) e.description = 'Describe the product or paste its URL'
    }
    if (s === 1) {
      if (d.scope === 'cities' && (d.places.length < 2 || d.places.length > 6)) e.places = 'Pick between 2 and 6 cities'
      if (d.scope !== 'cities' && d.places.length !== 1) e.places = d.scope === 'country' ? 'Pick a country' : 'Pick a city'
    }
    if (s === 2) {
      if (d.budget && Number(d.budget) < 0) e.budget = 'Budget must be positive'
      if (d.start && d.end && d.end <= d.start) e.end = 'The end date must be after the start'
      if (!d.channels.length) e.channels = 'Pick at least one channel'
    }
    if (s === 3 && !d.anchors.length) e.anchors = 'Add at least one anchor'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    const n = Math.min(3, step + 1)
    setStep(n)
    // Read the product as soon as it's described, so the studio can show its references from step 2 on.
    if (n >= 1 && !d.card && !card.isPending && d.name.trim() && d.description.trim()) card.mutate()
  }

  const toggle = (k: 'age' | 'channels', v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v])
  const createError =
    create.error instanceof ApiError ? create.error.message : create.error ? "That didn't go through. Your draft is saved; try again in a moment." : null

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8">
      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_360px]">
        {/* Stepper */}
        <aside>
          <h1 className="whitespace-nowrap font-display text-[2rem] leading-[1] xl:text-title">Brief a campaign.</h1>
          <p className="mt-2 text-sm text-ink-2">Four steps. Tastegeist does the culture research, the concepts and the plan.</p>
          <Button size="sm" className="mt-4" onClick={tryExample} disabled={exampleLoading}>
            {exampleLoading && <Loader2 size={14} className="animate-spin" />} Fill in a sample
          </Button>
          <ol className="mt-6 flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {STEPS.map(([t, s], i) => (
              <li key={t} className="shrink-0">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === step ? 'bg-brand-soft' : 'hover:bg-surface-2 disabled:hover:bg-transparent'}`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      i < step ? 'bg-mint text-on-brand' : i === step ? 'bg-brand text-on-brand' : 'border border-line text-mute'
                    }`}
                  >
                    {i < step ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="hidden sm:block">
                    <span className={`block text-sm font-medium ${i === step ? 'text-brand-ink' : ''}`}>{t}</span>
                    <span className="block text-xs text-mute">{s}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="t-caption mt-8 hidden lg:block">Drafts save automatically in this browser.</p>
        </aside>

        <Card className="p-6 md:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">What are you promoting?</h2>
              <Field label="Product name" error={errors.name}>
                <input className={input} value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lumen" />
                <input
                  type="text"
                  name="website"
                  value={honey}
                  onChange={(e) => setHoney(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] h-px w-px opacity-0"
                />
              </Field>
              <Field label="Description" hint="what it is, who it's for, what makes it different" error={errors.description}>
                <textarea
                  className={`${input} h-28 py-2.5`}
                  value={d.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="A lightweight commuter e-bike with a minimalist frame and app unlock. Mid-premium price."
                />
              </Field>
              <Field label="Product page URL" hint="optional, we'll read it">
                <input className={input} value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" inputMode="url" />
              </Field>
              <Field label="Goal" group>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map(([v, l]) => (
                    <Chip key={v} on={d.objective === v} onClick={() => set('objective', v)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </Field>
              <div className="grid gap-5 md:grid-cols-[1fr_200px]">
                <Field label="Target ages" group>
                  <div className="flex flex-wrap gap-2">
                    {AGES.map(([v, l]) => (
                      <Chip key={v} on={d.age.includes(v)} onClick={() => toggle('age', v)}>
                        {l}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Gender">
                  <select className={input} value={d.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">Everyone</option>
                    <option value="female">Mostly women</option>
                    <option value="male">Mostly men</option>
                  </select>
                </Field>
              </div>
              <Field label="Anything else about the audience" hint="optional">
                <input
                  className={input}
                  value={d.audience}
                  onChange={(e) => set('audience', e.target.value)}
                  placeholder="Urban commuters who care about design"
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Where should it run?</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['country', 'A whole country', 'We find where in it your taste lives', <Globe2 key="g" size={20} />],
                    ['cities', 'Several cities', 'Compare 2 to 6 markets', <MapPin key="m" size={20} />],
                    ['city', 'One city in depth', 'Neighborhood by neighborhood', <Building2 key="b" size={20} />],
                  ] as [Scope, string, string, ReactNode][]
                ).map(([v, t, s, icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setD((x) => ({
                        ...x,
                        scope: v,
                        places: v === 'cities' ? x.places : x.places.slice(0, 1),
                      }))
                    }
                    className={`rounded-xl border p-4 text-left transition ${d.scope === v ? 'border-brand bg-brand-soft' : 'border-line hover:border-mute'}`}
                    aria-pressed={d.scope === v}
                  >
                    <span className={d.scope === v ? 'text-brand-ink' : 'text-mute'}>{icon}</span>
                    <span className="mt-2 block font-medium">{t}</span>
                    <span className="block text-xs text-mute">{s}</span>
                  </button>
                ))}
              </div>
              <Field label={d.scope === 'country' ? 'Country' : d.scope === 'city' ? 'City' : 'Cities'} error={errors.places}>
                <PlaceSearch
                  placeholder={d.scope === 'country' ? 'Search a country, e.g. Germany' : 'Search a city, e.g. Berlin'}
                  onPick={(p) => set('places', d.scope === 'cities' ? (d.places.some((x) => x.id === p.id) ? d.places : [...d.places, p].slice(0, 6)) : [p])}
                />
              </Field>
              {d.places.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.places.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 py-1.5 pl-3 pr-1.5 text-sm">
                      {p.name}
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() =>
                          set(
                            'places',
                            d.places.filter((x) => x.id !== p.id),
                          )
                        }
                        className="grid h-6 w-6 place-items-center rounded-lg hover:bg-line"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-mute">
                {d.scope === 'country' && "Tastegeist reads Qloo's national heatmap for your anchors and picks the hottest cities to plan."}
                {d.scope === 'cities' && 'Each city gets its own culture map; cities with shared taste become one zone.'}
                {d.scope === 'city' && "Tastegeist finds the city's neighborhoods and groups them into taste zones."}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold">Budget and channels</h2>
              <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
                <Field label="Media budget" hint="optional" error={errors.budget}>
                  <input className={input} type="number" min={0} step={1000} value={d.budget} onChange={(e) => set('budget', e.target.value)} />
                </Field>
                <Field label="Currency">
                  <select className={input} value={d.currency} onChange={(e) => set('currency', e.target.value)}>
                    {['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'DKK', 'CAD', 'AUD'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Start" hint="default: in two weeks">
                  <input className={input} type="date" value={d.start} onChange={(e) => set('start', e.target.value)} />
                </Field>
                <Field label="End" hint="default: eight weeks later" error={errors.end}>
                  <input className={input} type="date" value={d.end} onChange={(e) => set('end', e.target.value)} />
                </Field>
              </div>
              <Field label="Channels" error={errors.channels} group>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map(([v, l]) => (
                    <Chip key={v} on={d.channels.includes(v)} onClick={() => toggle('channels', v)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Constraints" hint="optional: tone rules, banned references">
                <input
                  className={input}
                  value={d.constraints}
                  onChange={(e) => set('constraints', e.target.value)}
                  placeholder="No alcohol references; keep it warm, never snarky"
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-line p-4">
                <div className="t-h3">What you'll get, in {typicalRun(runStats.data)}</div>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-ink-2 sm:grid-cols-2">
                  <li>Taste zones on a map, from Qloo</li>
                  <li>A culture profile of every place</li>
                  <li>Three cited concepts per zone</li>
                  <li>A synthetic test against a generic control</li>
                  <li>A media plan with audiences and A/B tests</li>
                  <li>A client report and Excel, PDF, JSON exports</li>
                </ul>
                <p className="t-caption mt-2">You can leave the page; the run continues and your browser can tell you when it's done.</p>
              </div>
              <h2 className="text-xl font-semibold">Your product card</h2>
              {card.isPending && (
                <div className="flex items-center gap-3 rounded-xl bg-brand-soft p-4 text-sm text-brand-ink">
                  <Loader2 size={16} className="animate-spin" /> Reading your product and finding what its audience already loves on Qloo…
                </div>
              )}
              {card.isError && (
                <div className="rounded-xl bg-coral-soft p-4 text-sm text-coral">
                  We couldn't build the product card. {card.error instanceof ApiError ? card.error.message : ''} You can still add anchors by hand below.{' '}
                  <button className="font-medium underline" onClick={() => card.mutate()}>
                    Retry
                  </button>
                </div>
              )}
              {d.card && (
                <div className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-mute">Category · price tier</div>
                    <div className="text-sm">
                      {d.card.category} · {d.card.price_tier}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-mute">Tone</div>
                    <div className="text-sm">{d.card.tone}</div>
                  </div>
                  {d.card.claims.length > 0 && (
                    <div className="sm:col-span-2">
                      <div className="text-xs text-mute">Key claims</div>
                      <div className="text-sm">{d.card.claims.join(' · ')}</div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">Anchors</h3>
                  <span className="text-xs text-mute">{d.anchors.length}/6</span>
                </div>
                <p className="mt-1 text-sm text-mute">
                  What your product is "like". A new product has no Qloo history, so it inherits real affinities from these. Swap any that don't fit.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {d.anchors.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                      {a.image ? (
                        <img src={a.image} alt="" className="h-11 w-11 rounded-lg object-cover" />
                      ) : (
                        <span className="h-11 w-11 rounded-lg bg-surface-2" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{a.name}</div>
                        <div className="truncate text-xs text-mute">{a.why ?? a.type.split(':').pop()?.replace('_', ' ')}</div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() =>
                          set(
                            'anchors',
                            d.anchors.filter((x) => x.id !== a.id),
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {d.anchors.length < 6 && (
                  <div className="mt-3">
                    <AnchorSearch onPick={(a) => !d.anchors.some((x) => x.id === a.id) && set('anchors', [...d.anchors, a])} />
                  </div>
                )}
                {errors.anchors && <p className="mt-2 text-xs text-coral">{errors.anchors}</p>}
              </div>

              <div className="rounded-xl bg-surface-2 p-4 text-sm">
                <div className="font-medium">Summary</div>
                <p className="mt-1 text-ink-2">
                  {d.name} ·{' '}
                  {d.scope === 'country'
                    ? `all of ${d.places[0]?.name}`
                    : d.scope === 'city'
                      ? `${d.places[0]?.name}, neighborhood by neighborhood`
                      : d.places.map((p) => p.name).join(', ')}
                  {d.budget && ` · ${d.currency} ${Number(d.budget).toLocaleString()}`} · {d.channels.length} channels
                </p>
                <p className="mt-2 text-xs text-mute">
                  Takes {typicalRun(runStats.data)}: Qloo culture maps, three Claude-written concepts per zone, and a synthetic séance for each.
                </p>
              </div>
              {createError && <p className="text-sm text-coral">{createError}</p>}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
            {step === 0 ? (
              <Link to="/app" className="text-sm text-mute hover:text-ink">
                Cancel
              </Link>
            ) : (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} /> Back
              </Button>
            )}
            {step < 3 ? (
              <Button variant="primary" onClick={next}>
                Continue <ArrowRight size={16} />
              </Button>
            ) : (
              <Button variant="primary" size="lg" disabled={create.isPending || card.isPending} onClick={() => validate(3) && (askToNotify(), create.mutate())}>
                {create.isPending && <Loader2 size={16} className="animate-spin" />} Generate campaign
              </Button>
            )}
          </div>
        </Card>
        {/* The studio's other half: what Qloo sees while the brief is written */}
        <div className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-6 xl:self-start">
          <BriefPreview anchors={d.anchors} cardPending={card.isPending} places={d.places} scope={d.scope} />
        </div>
      </div>
      {d.name && step === 0 && (
        <p className="mt-4 text-center text-xs text-mute">
          <Plus size={11} className="inline" /> Draft saved in this browser.
        </p>
      )}
    </div>
  )
}
