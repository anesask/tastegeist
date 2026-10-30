import { ClipboardCopy, Send } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type CampaignDetail, type RunResult } from '../lib/api'
import { chosenConcept, personaName, placeName } from '../lib/geists'
import { useSettings } from '../lib/settings'
import { useToast } from './ui'

/** The campaign as Markdown: pastes cleanly into Notion, Google Docs, Confluence or an email. */
export function toMarkdown(c: CampaignDetail, r: RunResult, reportUrl: string) {
  const money = (v: number) => `${r.plan.currency} ${Math.round(v).toLocaleString('en-GB')}`
  const lines = [`# ${c.headline || c.title}`, '', `${c.title}. ${r.groups.length} taste zones across ${r.markets.map((m) => m.name).join(', ')}.`, '']
  for (const g of r.groups) {
    const ch = chosenConcept(g)
    const z = r.plan.zones.find((x) => x.key === g.key)
    lines.push(`## ${personaName(g)}, ${placeName(g)}`)
    if (ch?.headline) lines.push(`**"${ch.headline.text}"**`, '')
    if (ch?.big_idea) lines.push(ch.big_idea.text, '')
    lines.push(
      `- Over-indexes on: ${g.ledger
        .slice(0, 5)
        .map((e) => `${e.name} (${e.lift.toFixed(1)}x)`)
        .join(', ')}`,
    )
    if (ch?.panel)
      lines.push(
        `- Séance: ${ch.panel.stop_scrolling} of ${ch.panel.size} would stop scrolling${g.baseline_panel ? `, ${g.baseline_panel.stop_scrolling} for the generic concept` : ''} (synthetic, directional)`,
      )
    if (z) lines.push(`- Budget: ${money(z.budget)} (${z.channels.map((x) => x.label).join(', ')})`)
    lines.push('')
  }
  lines.push(
    `Total ${money(r.plan.budget)}, ${r.plan.start} to ${r.plan.end}.`,
    '',
    `Client report: ${reportUrl}`,
    '',
    '_Taste data from Qloo; concepts and personas written by AI._',
  )
  return lines.join('\n')
}

/** Send the campaign out: Slack (webhook from Settings) and Markdown for docs tools. */
export function ShareOut({ campaign, result }: { campaign: CampaignDetail; result: RunResult }) {
  const toast = useToast()
  const settings = useSettings()
  const [sending, setSending] = useState(false)
  const reportUrl = `${window.location.origin}/report/${campaign.id}`
  const btn = 'flex items-start gap-3 rounded-xl border border-line p-4 text-left transition hover:border-brand hover:bg-brand-soft disabled:opacity-50'
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        className={btn}
        onClick={() => {
          navigator.clipboard?.writeText(toMarkdown(campaign, result, reportUrl))
          toast('Copied as Markdown. Paste it into Notion, Google Docs or an email.')
        }}
      >
        <ClipboardCopy size={20} className="text-brand-ink" />
        <span>
          <span className="block font-medium">Copy as Markdown</span>
          <span className="block text-xs text-mute">Zones, concepts, séance and budget, for Notion or Google Docs</span>
        </span>
      </button>
      {settings.data?.slack && !campaign.demo ? (
        <button
          type="button"
          className={btn}
          disabled={sending}
          onClick={async () => {
            setSending(true)
            try {
              await api.slack(campaign.id)
              toast('Sent to Slack')
            } catch (e) {
              toast((e as Error).message || 'Slack did not accept it')
            } finally {
              setSending(false)
            }
          }}
        >
          <Send size={20} className="text-brand-ink" />
          <span>
            <span className="block font-medium">{sending ? 'Sending…' : 'Send to Slack'}</span>
            <span className="block text-xs text-mute">Summary and report link to your connected channel</span>
          </span>
        </button>
      ) : (
        <Link to="/app/settings" className={btn}>
          <Send size={20} className="text-brand-ink" />
          <span>
            <span className="block font-medium">Connect Slack</span>
            <span className="block text-xs text-mute">{campaign.demo ? 'Available in your own campaigns' : 'Add an incoming webhook in Settings'}</span>
          </span>
        </Link>
      )}
    </div>
  )
}
