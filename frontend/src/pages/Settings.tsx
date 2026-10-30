import { useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { api, type WorkspaceSettings } from '../lib/api'
import { readLogo, useSettings } from '../lib/settings'
import { AiSettings, DEFAULT_AI } from '../components/AiSettings'
import { useTitle } from '../lib/title'
import { Button, Card, Chip, Skeleton, useToast } from '../components/ui'

const input = 'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-ink/10'
const CHANNELS: [string, string][] = [
  ['social', 'Social'],
  ['online_video', 'Online video'],
  ['audio', 'Audio'],
  ['ooh', 'OOH'],
  ['influencers', 'Influencers'],
  ['press', 'Press'],
]
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF']

function Field({ label, hint, group = false, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const id = useId()
  const head = (
    <>
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      {hint && <span className="ml-2 text-xs text-mute">{hint}</span>}
    </>
  )
  // Chip groups are buttons, not form controls: a <label> around them would rename the first button.
  return group ? (
    <div role="group" aria-labelledby={id}>
      {head}
      <div className="mt-1.5">{children}</div>
    </div>
  ) : (
    <label className="block">
      {head}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="t-h2">{title}</h2>
        <p className="mt-1 text-sm text-mute">{sub}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  )
}

function LogoPicker({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const toast = useToast()
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="grid h-16 w-32 place-items-center rounded-xl border border-dashed border-line bg-surface-2 p-2">
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-mute">No logo</span>}
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 text-sm hover:bg-surface-2">
          <ImagePlus size={14} /> Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            aria-label={`Upload ${label.toLowerCase()}`}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                onChange(await readLogo(f))
              } catch (err) {
                toast((err as Error).message)
              }
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-surface-2"
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Workspace settings: the brand kit for posters, white-label details for the report, brief defaults, Slack. */
export function Settings() {
  useTitle('Settings')
  const q = useSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const [s, setS] = useState<WorkspaceSettings | null>(null)
  const [hook, setHook] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (q.data && !s) setS(q.data)
  }, [q.data, s])
  if (!s)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  const brand = s.brand ?? { name: '', logo: null, color: null, font: 'serif' as const }
  const agency = s.agency ?? { name: '', logo: null }
  const defaults = s.defaults ?? { currency: 'EUR', budget: 25000, channels: CHANNELS.slice(0, 5).map(([k]) => k) }
  const ai = s.ai ?? DEFAULT_AI
  const set = (patch: Partial<WorkspaceSettings>) => setS({ ...s, ...patch })

  async function save(extra: { slack_webhook?: string } = {}) {
    setSaving(true)
    try {
      const out = await api.saveSettings({ brand, agency, client: s!.client ?? '', defaults, ai, ...extra })
      setS(out)
      qc.setQueryData(['settings'], out)
      toast('Settings saved')
      return true
    } catch (e) {
      toast((e as Error).message || 'Could not save')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div>
        <h1 className="font-display text-title leading-[1]">Settings</h1>
        <p className="mt-2 text-sm text-ink-2">For this workspace. Saved on the server against this browser's workspace, and deleted with it.</p>
      </div>

      <Section title="Brand kit" sub="Used on the posters, the client report and the PDF export.">
        <Field label="Brand name">
          <input className={input} value={brand.name} onChange={(e) => set({ brand: { ...brand, name: e.target.value } })} placeholder="e.g. Lumen" />
        </Field>
        <LogoPicker label="Brand logo" value={brand.logo} onChange={(logo) => set({ brand: { ...brand, logo } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand color" hint="optional; posters can use it" group>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.color ?? '#d9663f'}
                onChange={(e) => set({ brand: { ...brand, color: e.target.value } })}
                className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-surface p-1"
                aria-label="Brand color"
              />
              <span className="tabular text-sm text-ink-2">{brand.color ?? 'Not set'}</span>
              {brand.color && (
                <button type="button" className="text-link text-xs" onClick={() => set({ brand: { ...brand, color: null } })}>
                  Clear
                </button>
              )}
            </div>
          </Field>
          <Field label="Headline type" group>
            <div className="flex gap-2">
              {(['serif', 'sans'] as const).map((f) => (
                <Chip key={f} selected={brand.font === f} onClick={() => set({ brand: { ...brand, font: f } })}>
                  <span className={f === 'serif' ? 'font-display text-base' : ''}>{f === 'serif' ? 'Serif' : 'Sans'}</span>
                </Chip>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <Section title="Client report" sub="White label: your agency's name and logo on the report, Tastegeist only in the footer.">
        <Field label="Agency name">
          <input className={input} value={agency.name} onChange={(e) => set({ agency: { ...agency, name: e.target.value } })} placeholder="e.g. North Studio" />
        </Field>
        <LogoPicker label="Agency logo" value={agency.logo} onChange={(logo) => set({ agency: { ...agency, logo } })} />
        <Field label="Client name" hint="shown as 'Prepared for'">
          <input className={input} value={s.client ?? ''} onChange={(e) => set({ client: e.target.value })} placeholder="e.g. Lumen Bikes B.V." />
        </Field>
      </Section>

      <Section title="AI" sub="Who writes your campaigns, and the house style every concept follows.">
        <AiSettings ai={ai} onChange={(next) => set({ ai: next })} />
      </Section>

      <Section title="Brief defaults" sub="Pre-filled in every new campaign; you can still change them per brief.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" group>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => (
                <Chip key={c} selected={defaults.currency === c} onClick={() => set({ defaults: { ...defaults, currency: c } })}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Budget">
            <input
              className={input}
              inputMode="numeric"
              value={defaults.budget || ''}
              onChange={(e) => set({ defaults: { ...defaults, budget: Number(e.target.value.replace(/\D/g, '')) || 0 } })}
            />
          </Field>
        </div>
        <Field label="Channels" group>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map(([k, l]) => (
              <Chip
                key={k}
                selected={defaults.channels.includes(k)}
                onClick={() =>
                  set({
                    defaults: { ...defaults, channels: defaults.channels.includes(k) ? defaults.channels.filter((x) => x !== k) : [...defaults.channels, k] },
                  })
                }
              >
                {l}
              </Chip>
            ))}
          </div>
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button variant="primary" disabled={saving} onClick={() => save()}>
          <Check size={16} /> Save settings
        </Button>
      </div>

      <Section title="Slack" sub="Send a campaign's summary and report link to a channel. Uses a Slack incoming webhook; it stays on the server.">
        <p className="text-sm text-ink-2">{s.slack ? 'A webhook is connected.' : 'No webhook connected.'}</p>
        <Field label="Incoming webhook URL" hint="from your Slack app's settings">
          <input
            className={input}
            value={hook}
            onChange={(e) => setHook(e.target.value.trim())}
            placeholder="https://hooks.slack.com/services/…"
            autoComplete="off"
          />
        </Field>
        <div className="flex gap-2">
          <Button size="sm" disabled={saving || !hook} onClick={async () => (await save({ slack_webhook: hook })) && setHook('')}>
            Connect
          </Button>
          {s.slack && (
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => save({ slack_webhook: '' })}>
              Disconnect
            </Button>
          )}
        </div>
      </Section>
    </div>
  )
}
