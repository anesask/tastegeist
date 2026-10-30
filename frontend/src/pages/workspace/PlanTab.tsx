import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, FileJson, FileSpreadsheet, FileText, MapPin, RotateCcw, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { api, DOMAIN_LABEL, fmtDate, rgb, type Domain, type Geist, type MediaPlan, type RunResult } from '../../lib/api'
import { colorOf, placeName } from '../../lib/geists'
import type { CustomSeriesRenderItem } from 'echarts'
import { Chart, axisStyle, tokens } from '../../components/Chart'
import { Button, Card, SectionTitle, Source, useToast, buttonClass } from '../../components/ui'
import { useTheme } from '../../theme'
import { BudgetTreemap } from '../../components/Charts'
import { MediaNumbers } from '../../components/MediaNumbers'
import { Measurement } from '../../components/Measurement'
import { CultureCalendar } from '../../components/CultureCalendar'
import { ShareOut } from '../../components/ShareOut'
import { Playbook } from '../../components/Playbook'
import { useWorkspace } from './Workspace'

const money = (n: number, cur: string) =>
  new Intl.NumberFormat('en', {
    style: 'currency',
    currency: cur,
    maximumFractionDigits: 0,
  }).format(n)

function Flighting({ plan }: { plan: MediaPlan }) {
  const { theme } = useTheme()
  const option = useMemo(() => {
    const t = tokens()
    const channels = [...new Set(plan.flighting.map((f) => f.label))]
    const phaseColor: Record<string, string> = {
      Tease: t.lilac,
      Launch: t.coral,
      Sustain: t.mint,
    }
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const d = (
            p as {
              data: {
                value: [number, number, number]
                phase: string
                label: string
              }
            }
          ).data
          return `<b>${d.label}</b> · ${d.phase}<br/>${fmtDate(d.value[1])} to ${fmtDate(d.value[2])}`
        },
      },
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'time' as const,
        min: plan.start,
        max: plan.end,
        ...axisStyle(),
      },
      yAxis: {
        type: 'category' as const,
        data: channels,
        inverse: true,
        ...axisStyle(),
        axisLabel: { color: t.ink2, fontSize: 12 },
      },
      series: [
        {
          type: 'custom' as const,
          renderItem: ((_params, api) => {
            const y = Number(api.value(0))
            const start = api.coord([Number(api.value(1)), y])
            const end = api.coord([Number(api.value(2)), y])
            const h = ((api.size?.([0, 1]) as number[] | undefined)?.[1] ?? 20) * 0.5
            return {
              type: 'rect',
              shape: {
                x: start[0],
                y: start[1] - h / 2,
                width: Math.max(4, end[0] - start[0]),
                height: h,
                r: 6,
              },
              style: { fill: api.visual('color') as string },
            }
          }) as CustomSeriesRenderItem,
          encode: { x: [1, 2], y: 0 },
          data: plan.flighting.map((f) => ({
            value: [channels.indexOf(f.label), +new Date(f.start), +new Date(f.end)],
            phase: f.phase,
            label: f.label,
            itemStyle: { color: phaseColor[f.phase] },
          })),
        },
      ],
    }
  }, [plan, theme])
  return (
    <Chart
      option={option}
      height={60 + new Set(plan.flighting.map((f) => f.label)).size * 44}
      theme={theme}
      label="Flighting: when each channel runs, by phase"
    />
  )
}

/**
 * The budget split, worked out: the same rule as backend/app/plan.py default_shares, with this
 * campaign's numbers. Zones get budget in proportion to ledger strength (mean lift); a city with
 * neighborhood geists hands its slice of the zone to them, split by their own strength.
 */
function SplitFormula({ result }: { result: RunResult }) {
  const plan = result.plan
  const strength = (g: Geist) => (g.ledger.length ? g.ledger.reduce((a, e) => a + e.lift, 0) / g.ledger.length : 1)
  const zones = result.groups.filter((g) => g.kind === 'zone')
  const total = zones.reduce((a, z) => a + strength(z), 0) || 1
  const hoods = result.groups.filter((g) => g.kind === 'neighborhood')
  const amount = (key: string) => plan.zones.find((z) => z.key === key)?.budget ?? 0
  const share = (key: string) => plan.zones.find((z) => z.key === key)?.share ?? 0
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="t-h3">How the split is worked out</div>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Each zone's strength is the average lift of its ledger: how much more its places love their defining titles than the other places do. Budget follows
        strength. A city split into neighborhoods hands its part of the zone to them, again by strength.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-mute">
            <tr>
              <th className="py-1.5 pr-4 font-normal">Taste zone</th>
              <th className="py-1.5 pr-4 text-right font-normal">Strength</th>
              <th className="py-1.5 pr-4 font-normal">Rule</th>
              <th className="py-1.5 pr-4 text-right font-normal">Share</th>
              <th className="py-1.5 text-right font-normal">Budget</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {zones.map((z) => {
              const zs = strength(z) / total
              const per = zs / Math.max(1, z.markets.length)
              const mine = hoods.filter((h) => z.markets.includes(h.parent ?? h.markets[0]))
              return [
                <tr key={z.key} className="border-t border-line">
                  <td className="py-2 pr-4">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, z.key)) }} />
                    {placeName(z)}
                  </td>
                  <td className="py-2 pr-4 text-right">{strength(z).toFixed(2)}×</td>
                  <td className="py-2 pr-4 text-ink-2">
                    {strength(z).toFixed(2)} / {total.toFixed(2)} = {pct(zs)}
                    {mine.length > 0 && `, minus ${pct(per)} for ${[...new Set(mine.map((h) => h.parent ?? h.markets[0]))].join(', ')}`}
                  </td>
                  <td className="py-2 pr-4 text-right">{pct(share(z.key))}</td>
                  <td className="py-2 text-right">
                    {plan.currency} {Math.round(amount(z.key)).toLocaleString('en-GB')}
                  </td>
                </tr>,
                ...mine.map((h) => {
                  const hs = mine.filter((x) => (x.parent ?? x.markets[0]) === (h.parent ?? h.markets[0])).reduce((a, x) => a + strength(x), 0) || 1
                  return (
                    <tr key={h.key} className="border-t border-line">
                      <td className="py-2 pr-4 pl-4">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, h.key)) }} />
                        {placeName(h)}
                      </td>
                      <td className="py-2 pr-4 text-right">{strength(h).toFixed(2)}×</td>
                      <td className="py-2 pr-4 text-ink-2">
                        {pct(per)} × {strength(h).toFixed(2)} / {hs.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-right">{pct(share(h.key))}</td>
                      <td className="py-2 text-right">
                        {plan.currency} {Math.round(amount(h.key)).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>
      <Source>
        {plan.edited ? 'You edited the shares, so the Share column shows your split, not the rule. ' : ''}Inside a zone, channels split by fixed weights (social
        32, online video 24, out of home 16, audio 12, creators 12, press 4), renormalised over the channels you picked.
      </Source>
    </div>
  )
}

export function PlanTab() {
  const { campaign, result } = useWorkspace()
  const { theme } = useTheme()
  const toast = useToast()
  const qc = useQueryClient()
  const plan = result.plan
  const [shares, setShares] = useState<Record<string, number>>({})
  useEffect(() => setShares(Object.fromEntries(plan.zones.map((z) => [z.key, Math.round(z.share * 100)]))), [plan])
  const total = Object.values(shares).reduce((a, b) => a + b, 0) || 1
  const dirty = plan.zones.some((z) => Math.round(z.share * 100) !== shares[z.key])

  const save = useMutation({
    mutationFn: (s: Record<string, number>) => api.setBudget(campaign.id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      toast('Budget updated')
    },
    onError: () => toast('Could not save the budget'),
  })

  useEffect(() => {
    if (window.location.hash === '#export') document.getElementById('export')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const donut = useMemo(() => {
    const t = tokens()
    return {
      tooltip: {
        trigger: 'item' as const,
        valueFormatter: (v: unknown) => money(Number(v), plan.currency),
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['58%', '82%'],
          itemStyle: {
            borderColor: t.surface,
            borderWidth: 3,
            borderRadius: 6,
          },
          label: { show: false },
          data: plan.zones.map((z) => ({
            name: z.name,
            value: Math.round((plan.budget * (shares[z.key] ?? 0)) / total),
            itemStyle: { color: rgb(colorOf(result, z.key)) },
          })),
        },
      ],
    }
  }, [plan, shares, total, result, theme])

  const channelBars = useMemo(() => {
    const t = tokens()
    const by: Record<string, number> = {}
    for (const z of plan.zones) {
      const factor = (shares[z.key] ?? 0) / total / (z.share || 1)
      for (const c of z.channels) by[c.label] = (by[c.label] ?? 0) + c.budget * factor
    }
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        valueFormatter: (v: unknown) => money(Number(v), plan.currency),
      },
      xAxis: {
        type: 'value' as const,
        ...axisStyle(),
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: rows.map((r) => r[0]),
        inverse: true,
        ...axisStyle(),
        axisLabel: { color: t.ink2, fontSize: 12 },
      },
      series: [
        {
          type: 'bar' as const,
          data: rows.map((r) => Math.round(r[1])),
          itemStyle: { color: t.amber, borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 14,
        },
      ],
    }
  }, [plan, shares, total, theme])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-title leading-tight">Media plan</h2>
          <p className="mt-1 text-sm text-mute">
            A channel plan per taste zone, {fmtDate(plan.start)} to {fmtDate(plan.end)}, {money(plan.budget, plan.currency)} total.
          </p>
        </div>
        <a href="#export" className={buttonClass('secondary', 'md')}>
          <Download size={16} /> Export
        </a>
      </div>

      <Card className="p-5">
        <SectionTitle title="Flighting" sub="Tease, launch and sustain phases across your chosen channels." />
        <div className="mt-4">
          <Flighting plan={plan} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <SectionTitle
            title="Budget by taste zone"
            sub={
              campaign.demo
                ? "Defaults follow each zone's ledger strength. Samples are read-only: use this brief to rebalance your own copy."
                : "Defaults follow each zone's ledger strength. Drag to rebalance."
            }
            action={
              dirty ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShares(Object.fromEntries(plan.zones.map((z) => [z.key, Math.round(z.share * 100)])))}>
                    <RotateCcw size={14} /> Reset
                  </Button>
                  <Button size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate(shares)}>
                    Save
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="mt-5 space-y-5">
            {plan.zones.map((z) => {
              const pct = ((shares[z.key] ?? 0) / total) * 100
              return (
                <div key={z.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: rgb(colorOf(result, z.key)) }} />
                      <span className="truncate font-medium">{z.name}</span>
                      <span className="truncate text-mute">{z.label}</span>
                    </span>
                    <span className="shrink-0 tabular text-ink-2">
                      {money((plan.budget * pct) / 100, plan.currency)} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    disabled={campaign.demo}
                    min={0}
                    max={100}
                    value={shares[z.key] ?? 0}
                    onChange={(e) =>
                      setShares((s) => ({
                        ...s,
                        [z.key]: Number(e.target.value),
                      }))
                    }
                    className="mt-2 w-full accent-[var(--brand)]"
                    aria-label={`Budget weight for ${z.name}`}
                  />
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <div className="text-sm font-semibold">By zone</div>
            <Chart option={donut} height={200} theme={theme} label="Budget share by taste zone" />
          </div>
          <div>
            <div className="text-sm font-semibold">By channel</div>
            <Chart option={channelBars} height={200} theme={theme} label="Budget by channel" />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Where the money goes" sub="Every taste zone, split into its channels. Hover a tile for the amount." />
        <div className="mt-4">
          <BudgetTreemap plan={plan} colors={Object.fromEntries(plan.zones.map((z) => [z.key, colorOf(result, z.key)]))} />
        </div>
        <SplitFormula result={result} />
      </Card>

      <Card className="p-5">
        <SectionTitle title="Impressions and reach" sub="Per zone and channel, from CPMs you can edit. Starting values are placeholders, not quotes." />
        <div className="mt-4">
          <MediaNumbers campaignId={campaign.id} result={result} />
        </div>
      </Card>

      <section>
        <SectionTitle
          title="Playbook: how to run it, zone by zone"
          sub="Where to place it, who to bring in and what to do each week. Built from each zone's own Qloo data."
        />
        <div className="mt-5">
          <Playbook campaignId={campaign.id} result={result} />
        </div>
      </section>

      <Card className="p-5">
        <SectionTitle title="Cultural calendar" sub="Local moments inside the flight, and which phase each lands in. Time the peaks around them." />
        <div className="mt-4">
          <CultureCalendar campaignId={campaign.id} result={result} />
        </div>
      </Card>

      <section id="measure" className="scroll-mt-20">
        <SectionTitle
          title="Measurement plan"
          sub="How to tell whether it worked: the KPIs, one way to tag links, and the A/B readout once the test has run."
        />
        <div className="mt-5">
          <Measurement result={result} />
        </div>
      </section>

      <div>
        <SectionTitle
          title="Audiences and geo targets"
          sub="Per zone, ready to rebuild in your ad platform. Interest keywords come straight from the Qloo ledger."
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {plan.zones.map((z) => (
            <Card key={z.key} className="p-5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(colorOf(result, z.key)) }} />
                <span className="font-semibold">{z.name}</span>
                <span className="text-sm text-mute">{z.label}</span>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex gap-3">
                  <dt className="flex w-24 shrink-0 items-center gap-1.5 text-mute">
                    <Users size={14} /> Audience
                  </dt>
                  <dd>
                    Ages {z.audience.age.join(', ')} · {z.audience.gender === 'all' ? 'all genders' : z.audience.gender}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="flex w-24 shrink-0 items-center gap-1.5 text-mute">
                    <MapPin size={14} /> Geo
                  </dt>
                  <dd>{z.geo.map((g) => `${g.name} (${g.radius_km} km radius)`).join(', ')}</dd>
                </div>
                {Object.entries(z.audience.interests).map(([d, names]) => (
                  <div key={d} className="flex gap-3">
                    <dt className="w-24 shrink-0 text-mute">{DOMAIN_LABEL[d as Domain]}</dt>
                    <dd className="text-ink-2">{names.join(', ')}</dd>
                  </div>
                ))}
                {z.creative && (
                  <div className="flex gap-3">
                    <dt className="w-24 shrink-0 text-mute">Creative</dt>
                    <dd>
                      <Link to={`../creatives?g=${encodeURIComponent(z.key)}&c=${z.creative.id}`} className="font-medium text-link">
                        {z.creative.headline}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title="A/B test plan" sub="The two strongest séance concepts per zone go head to head." />
        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-mute">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Zone</th>
                <th className="px-5 py-3 font-medium">Variant A</th>
                <th className="px-5 py-3 font-medium">Variant B</th>
                <th className="px-5 py-3 font-medium">Split</th>
                <th className="px-5 py-3 font-medium">Impressions per arm</th>
              </tr>
            </thead>
            <tbody>
              {plan.zones
                .filter((z) => z.ab_test)
                .map((z) => (
                  <tr key={z.key} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{z.name}</td>
                    <td className="px-5 py-3">{z.ab_test!.a.headline}</td>
                    <td className="px-5 py-3">{z.ab_test!.b.headline}</td>
                    <td className="px-5 py-3">{z.ab_test!.split}</td>
                    <td className="px-5 py-3 tabular">{z.ab_test!.impressions_per_arm.toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
        <div className="mt-2">
          <Source>{plan.zones.find((z) => z.ab_test)?.ab_test?.assumption}. Metric: click-through rate.</Source>
        </div>
      </div>

      <Card className="scroll-mt-20 p-6">
        <div id="export" className="scroll-mt-24" />
        <SectionTitle title="Export" sub="Hand the plan to your media team." />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              fmt: 'xlsx',
              label: 'Excel workbook',
              sub: 'Audiences, geo, budget, flighting, creatives, ledger',
              icon: <FileSpreadsheet size={20} />,
            },
            {
              fmt: 'pdf',
              label: 'One-page PDF',
              sub: 'The plan at a glance for stakeholders',
              icon: <FileText size={20} />,
            },
            {
              fmt: 'json',
              label: 'JSON per market',
              sub: 'For your own tools and scripts',
              icon: <FileJson size={20} />,
            },
          ].map((x) => (
            <a
              key={x.fmt}
              href={`/api/campaigns/${campaign.id}/export.${x.fmt}`}
              download
              onClick={() => toast(`Preparing ${x.label}`)}
              className="flex items-start gap-3 rounded-xl border border-line p-4 transition hover:border-brand hover:bg-brand-soft"
            >
              <span className="text-brand-ink">{x.icon}</span>
              <span>
                <span className="block font-medium">{x.label}</span>
                <span className="block text-xs text-mute">{x.sub}</span>
              </span>
            </a>
          ))}
        </div>
        <ShareOut campaign={campaign} result={result} />
        <p className="mt-4 text-xs text-mute">
          Direct push to ad platforms is planned; the export format is not yet verified against Meta or Google import specs.
        </p>
      </Card>
    </div>
  )
}
