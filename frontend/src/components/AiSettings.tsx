import { Check } from 'lucide-react'
import type { WorkspaceSettings } from '../lib/api'
import { Chip } from './ui'

type Ai = NonNullable<WorkspaceSettings['ai']>

export const DEFAULT_AI: Ai = { provider: 'tastegeist', tone: 'balanced', house_rules: '', banned: [], language: 'en' }

// Bring-your-own providers: announced, not yet accepted by the server.
const BYO = [
  { name: 'Your Anthropic key', sub: 'Claude on your own account and limits' },
  { name: 'OpenAI', sub: 'GPT models with your API key' },
  { name: 'Google Gemini', sub: 'Gemini with your API key' },
  { name: 'Azure OpenAI', sub: 'Your Azure deployment and region' },
  { name: 'AWS Bedrock', sub: 'Claude and others in your AWS account' },
  { name: 'Mistral', sub: 'EU-hosted models with your API key' },
]

const TONES: { id: Ai['tone']; label: string; sub: string }[] = [
  { id: 'balanced', label: 'Balanced', sub: 'Follows each zone’s own mood' },
  { id: 'bold', label: 'Bold', sub: 'Big claims, short punchy lines' },
  { id: 'understated', label: 'Understated', sub: 'Quiet confidence, no hype words' },
  { id: 'playful', label: 'Playful', sub: 'Witty and light, never silly' },
]

const input = 'w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-ink/10'

/** Settings > AI: who writes the campaigns, and the house style every concept follows. */
export function AiSettings({ ai, onChange }: { ai: Ai; onChange: (ai: Ai) => void }) {
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="AI provider">
        <span className="text-sm font-medium">Provider</span>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div role="radio" aria-checked="true" className="relative rounded-xl border-2 border-ink p-4">
            <Check size={16} className="absolute right-3 top-3" aria-hidden />
            <div className="flex items-center gap-2 font-medium">Tastegeist AI</div>
            <p className="mt-1 text-xs text-ink-2">Included. Claude Opus 5.5 writes the concepts; Claude Haiku 5.5 runs the séance and the culture profiles.</p>
            <p className="t-caption mt-2">Spend is capped per day; your briefs are not used for training.</p>
          </div>
          {BYO.map((p) => (
            <div key={p.name} role="radio" aria-checked="false" aria-disabled="true" className="rounded-xl border border-dashed border-line p-4 opacity-70">
              <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">Coming soon</span>
              <div className="mt-2 flex items-center gap-2 font-medium"> {p.name}</div>
              <p className="mt-1 text-xs text-ink-2">{p.sub}</p>
            </div>
          ))}
        </div>
        <p className="t-caption mt-2">Bring your own AI: use your own key and account, billed by your provider. Keys will be stored encrypted on the server.</p>
      </div>

      <div role="group" aria-labelledby="ai-tone">
        <span id="ai-tone" className="text-sm font-medium">
          Tone of voice
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {TONES.map((t) => (
            <Chip key={t.id} selected={ai.tone === t.id} onClick={() => onChange({ ...ai, tone: t.id })} title={t.sub}>
              {t.label}
            </Chip>
          ))}
        </div>
        <p className="t-caption mt-1.5">{TONES.find((t) => t.id === ai.tone)?.sub}</p>
      </div>

      <label className="block">
        <span className="text-sm font-medium">House rules</span>
        <span className="ml-2 text-xs text-mute">optional, up to 300 characters</span>
        <textarea
          rows={3}
          maxLength={300}
          value={ai.house_rules}
          onChange={(e) => onChange({ ...ai, house_rules: e.target.value })}
          placeholder="e.g. No exclamation marks. Say 'e-bike', never 'electric bicycle'. Avoid puns about speed."
          className={`${input} py-2.5`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Never reference</span>
        <span className="ml-2 text-xs text-mute">brands, artists or titles, comma-separated</span>
        <input
          value={ai.banned.join(', ')}
          onChange={(e) => onChange({ ...ai, banned: e.target.value.split(',').map((x) => x.trimStart()) })}
          onBlur={() => onChange({ ...ai, banned: ai.banned.map((x) => x.trim()).filter(Boolean) })}
          placeholder="e.g. Red Bull, a competitor, a controversial artist"
          className={`${input} h-11`}
        />
        <span className="t-caption mt-1 block">Removed from what the concepts may cite, and any line that still names one is dropped.</span>
      </label>

      <div role="group" aria-labelledby="ai-lang">
        <span id="ai-lang" className="text-sm font-medium">
          Language of the copy
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip selected>English</Chip>
          <Chip disabled aria-disabled="true" className="opacity-60">
            Each market's language <span className="rounded-full bg-surface-2 px-1.5 text-[11px]">Coming soon</span>
          </Chip>
        </div>
      </div>
      <p className="t-caption">Applies to every new generation in this workspace, including "Generate again". Existing concepts don't change.</p>
    </div>
  )
}
