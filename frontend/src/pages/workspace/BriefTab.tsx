import { CalendarDays, Coins, Globe2, Megaphone, RefreshCw, Target } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, fmtDate, rgb, type Geist, type RunResult } from '../../lib/api'
import { colorOf, placeName } from '../../lib/geists'
import { Chart, axisStyle, tokens } from '../../components/Chart'
import { LedgerChip } from '../../components/Ledger'
import { Button, Card, SectionTitle, Source, useToast } from '../../components/ui'
import { useTheme } from '../../theme'
import { useWorkspace } from './Workspace'

const AGE_LABEL: Record<string, string> = {
  '24_and_younger': '24 and under',
  '25_to_29': '25-29',
  '30_to_34': '30-34',
  '35_to_44': '35-44',
  '45_to_54': '45-54',
  '55_and_older': '55+',
}
const CHANNEL_LABEL: Record<string, string> = {
  social: 'Social',
  online_video: 'Online video',
  audio: 'Audio',
  ooh: 'OOH',
  influencers: 'Influencers',
  press: 'Press',
}
const SCOPE_LABEL: Record<string, string> = {
  country: 'Whole country',
  cities: 'Several cities',
  city: 'One city in depth',
}

/**
 * Each anchor's share of the evidence behind each zone's ledger, from Qloo explainability.
 * Shows that the anchors steer the read without dictating it: the shares stay close to even.
 */
function AnchorPull({ result }: { result: RunResult }) {
  const zones = result.groups.filter((g) => g.ledger.some((e) => e.explain))
  if (!zones.length || !result.anchors.length) return null
  const share = (g: Geist, id: string) => {
    const xs = g.ledger.filter((e) => e.explain).map((e) => e.explain![id] ?? 0)
    return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  }
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="t-h3">How hard each anchor pulls</div>
      <p className="mt-1 text-sm text-ink-2">
        Anchors enter every Qloo call at weight 0.2; the place is the main signal. Below: each anchor's share of the evidence behind a zone's titles.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-mute">
              <th className="py-1 pr-3 font-normal">Anchor</th>
              {zones.map((g) => (
                <th key={g.key} className="py-1 pr-3 font-normal">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, g.key)) }} />
                  {placeName(g)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {result.anchors.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="py-2 pr-3">{a.name}</td>
                {zones.map((g) => {
                  const v = share(g, a.id)
                  return (
                    <td key={g.key} className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                          <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.round(v * 100)}%` }} />
                        </span>
                        <span className="text-xs text-ink-2">{Math.round(v * 100)}%</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Source>Qloo explainability per ledger title, averaged per zone. An even split means no single anchor is steering the result.</Source>
    </div>
  )
}

/** Generate the campaign again with fresh Qloo data; the current run is kept as a version to compare. */
function RunAgain({ id }: { id: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4">
      <p className="text-sm text-ink-2">
        Generate again to pick up newer Qloo data or a changed brief. This run is kept, and you can compare the two from the header.
      </p>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await api.run(id)
            await qc.invalidateQueries({ queryKey: ['campaign', id] })
          } catch (e) {
            toast((e as Error).message || 'Could not start the run')
          } finally {
            setBusy(false)
          }
        }}
      >
        <RefreshCw size={14} /> Generate again
      </Button>
    </div>
  )
}

export function BriefTab() {
  const { campaign, result } = useWorkspace()
  const { theme } = useTheme()
  const b = campaign.brief
  const plan = result.plan

  const skew = useMemo(() => {
    const t = tokens()
    const ages = Object.keys(AGE_LABEL)
    const avg = (k: string, field: 'age' | 'gender') =>
      result.demographics.reduce((a, d) => a + (d.query[field]?.[k] ?? 0), 0) / Math.max(1, result.demographics.length)
    const rows = [
      ...ages.map((a) => ({ name: AGE_LABEL[a], v: avg(a, 'age') })),
      { name: 'Female', v: avg('female', 'gender') },
      { name: 'Male', v: avg('male', 'gender') },
    ]
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (v: unknown) => (Number(v) > 0 ? '+' : '') + Number(v).toFixed(2),
      },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value' as const, ...axisStyle(), min: -1, max: 1 },
      yAxis: {
        type: 'category' as const,
        data: rows.map((r) => r.name),
        inverse: true,
        ...axisStyle(),
        axisLabel: { color: t.ink2, fontSize: 12 },
      },
      series: [
        {
          type: 'bar' as const,
          data: rows.map((r) => ({
            value: Number(r.v.toFixed(2)),
            itemStyle: {
              color: r.v >= 0 ? t.amber : t.slate,
              borderRadius: r.v >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6],
            },
          })),
          barMaxWidth: 14,
        },
      ],
    }
  }, [result, theme])

  return (
    <div className="flex flex-col gap-8">
      {!campaign.demo && <RunAgain id={campaign.id} />}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-6">
          <div className="kicker">Product</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{campaign.product_name}</h2>
          <p className="mt-3 leading-relaxed text-ink-2">{b.product}</p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: <Target size={16} />,
                k: 'Goal',
                v: String(campaign.objective).replace(/^\w/, (c) => c.toUpperCase()),
              },
              {
                icon: <Globe2 size={16} />,
                k: 'Scope',
                v: `${SCOPE_LABEL[campaign.scope] ?? 'Cities'}: ${campaign.markets.join(', ')}`,
              },
              {
                icon: <Coins size={16} />,
                k: 'Budget',
                v: plan.budget ? `${plan.currency} ${plan.budget.toLocaleString()}` : 'Not set',
              },
              {
                icon: <CalendarDays size={16} />,
                k: 'Flight',
                v: `${fmtDate(plan.start)} to ${fmtDate(plan.end)}`,
              },
              {
                icon: <Megaphone size={16} />,
                k: 'Channels',
                v: plan.channels.map((c) => CHANNEL_LABEL[c.channel] ?? c.label).join(', '),
              },
              {
                icon: <Target size={16} />,
                k: 'Audience',
                v: `${(b.age ?? []).map((a) => AGE_LABEL[a] ?? a).join(', ') || 'All ages'}${b.gender ? `, ${b.gender}` : ''}`,
              },
            ].map((x) => (
              <div key={x.k} className="flex gap-3">
                <span className="mt-0.5 text-mute">{x.icon}</span>
                <div>
                  <dt className="text-xs text-mute">{x.k}</dt>
                  <dd className="text-sm">{x.v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-6">
          <div className="kicker">Anchors</div>
          <p className="mt-2 text-sm text-ink-2">
            What the product is "like". A new product has no Qloo entity of its own, so it inherits real affinities from these.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {result.anchors.map((a) => (
              <figure key={a.id}>
                {a.image ? (
                  <img src={a.image} alt={a.name} className="aspect-square w-full rounded-xl object-cover" />
                ) : (
                  <div className="aspect-square w-full rounded-xl bg-surface-2" />
                )}
                <figcaption className="mt-2 text-sm font-medium">{a.name}</figcaption>
                <div className="text-xs text-mute">{a.type.split(':').pop()?.replace('_', ' ')}</div>
              </figure>
            ))}
          </div>
          <AnchorPull result={result} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-6">
          <SectionTitle title="Who the taste skews to" sub="Affinity by age and gender for the strongest ledger entities, relative to average." />
          <div className="mt-4">
            <Chart option={skew} height={300} theme={theme} label="Audience affinity by age band and gender, from Qloo demographics" />
          </div>
          <Source>Qloo demographics. Positive means this group over-indexes; a group-level signal, not individuals.</Source>
        </Card>
        <Card className="p-6">
          <SectionTitle title="Culture snapshot per market" sub="Each market's highest-lift entities against the others in the brief." />
          <div className="mt-5 space-y-5">
            {result.markets.map((m) => (
              <div key={m.name}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(colorOf(result, m.zone)) }} />
                  {m.name}
                  {m.tags.length > 0 && (
                    <span className="truncate font-normal text-mute">
                      ·{' '}
                      {m.tags
                        .slice(0, 3)
                        .map((t) => t.name)
                        .join(', ')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.top.slice(0, 6).map((e) => (
                    <LedgerChip key={e.id} e={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
