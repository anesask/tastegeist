import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { DOMAIN_LABEL, rgb, type Geist, type LedgerEntity, type MediaPlan, type Overlap, type RunResult } from '../lib/api'
import type { RGB } from '../lib/geists'
import { useTheme } from '../theme'
import { Chart, axisStyle, tokens } from './Chart'

/** What over-indexes in a zone: the ledger's strongest entities, as lift bars in the zone color. */
export function LiftBars({ g, color, result, n = 8 }: { g: Geist; color: RGB; result: RunResult; n?: number }) {
  const { theme } = useTheme()
  // The market-level lift of the geist's own places (the ledger's lift is a capped contrast score,
  // near-identical across entries); fall back to the ledger when a place has no culture map.
  const rows = useMemo(() => {
    const best = new Map<string, LedgerEntity>()
    for (const m of result.markets.filter((m) => g.markets.includes(m.name)))
      for (const e of m.top) if (!best.has(e.id) || best.get(e.id)!.lift < e.lift) best.set(e.id, e)
    const list = best.size ? [...best.values()] : g.ledger
    return list.sort((a, b) => b.lift - a.lift).slice(0, n)
  }, [g, result, n])
  const option = useMemo(() => {
    const t = tokens()
    return {
      grid: { left: 150, right: 44, top: 4, bottom: 4, containLabel: false },
      tooltip: {
        formatter: (p: unknown) => {
          const e = rows[(p as { dataIndex: number }).dataIndex]
          return `<b>${e.name}</b><br/>${DOMAIN_LABEL[e.domain]} · lift ${e.lift.toFixed(2)}×`
        },
      },
      xAxis: {
        type: 'value' as const,
        show: false,
        max: (v: { max: number }) => v.max * 1.05,
      },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rows.map((e) => e.name),
        ...axisStyle(),
        axisLine: { show: false },
        axisLabel: {
          color: t.ink2,
          fontSize: 12,
          width: 140,
          overflow: 'truncate' as const,
          align: 'right' as const,
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: rows.map((e, i) => ({
            value: e.lift,
            itemStyle: {
              color: rgb(color, i === 0 ? 1 : 0.55 + 0.4 * (1 - i / n)),
            },
          })),
          barWidth: 12,
          itemStyle: { borderRadius: [0, 6, 6, 0] },
          label: {
            show: true,
            position: 'right' as const,
            color: t.mute,
            fontSize: 11,
            formatter: (p: { value: number }) => `${p.value.toFixed(1)}×`,
          },
          showBackground: true,
          backgroundStyle: {
            color: t.line,
            opacity: 0.35,
            borderRadius: [0, 6, 6, 0],
          },
        },
      ],
    } as unknown as EChartsOption
  }, [rows, color, theme])
  const flat = rows.length > 1 && rows[rows.length - 1].lift / rows[0].lift > 0.92
  if (flat)
    // Every entry is equally distinctive here (the ledger's contrast score is capped), so bars would
    // say nothing: show the entities themselves, in rank order. The shared lift goes in one caption.
    return (
      <div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:gap-x-4">
          {rows.map((e, i) => (
            <div key={e.id} className="min-w-0" title={`${e.name} · ${DOMAIN_LABEL[e.domain]}`}>
              {e.image ? (
                <img
                  src={e.image}
                  alt=""
                  loading="lazy"
                  className={`aspect-square w-full rounded-lg ${e.domain === 'brand' ? 'bg-[#f3efe7] object-contain p-2' : 'object-cover object-top'}`}
                />
              ) : (
                <div className="aspect-square w-full rounded-lg" style={{ background: rgb(color, 0.2) }} />
              )}
              <div className="mt-1.5 truncate text-xs font-medium sm:text-sm">{e.name}</div>
              <div className="tabular text-xs text-mute">
                {i + 1}. {DOMAIN_LABEL[e.domain]}
              </div>
            </div>
          ))}
        </div>
        <p className="t-caption mt-3">
          Each is about {rows[0].lift.toFixed(1)}× more distinctive here than in the brief's other places
          {rows[0].lift_outside != null ? ` (${rows[0].lift_outside.toFixed(1)}× there)` : ''}, ranked by how widely known it is.
        </p>
      </div>
    )
  return <Chart option={option} height={rows.length * 30 + 12} theme={theme} label={`Lift of the strongest Qloo entities for ${g.label}`} />
}

/**
 * The core insight as a chart: how much of their top Qloo taste every pair of places shares.
 * Neighborhood pairs are drawn in coral, so "less in common than two capitals" is visible at a glance.
 */
export function OverlapBars({ overlap }: { overlap: { markets: Overlap[]; neighborhoods: Overlap[] } }) {
  const { theme } = useTheme()
  const rows = useMemo(
    () => [...overlap.neighborhoods.map((o) => ({ ...o, hood: true })), ...overlap.markets.map((o) => ({ ...o, hood: false }))].sort((a, b) => a.pct - b.pct),
    [overlap],
  )
  const option = useMemo(() => {
    const t = tokens()
    return {
      grid: { left: 186, right: 48, top: 4, bottom: 4, containLabel: false },
      tooltip: {
        formatter: (p: unknown) => {
          const o = rows[(p as { dataIndex: number }).dataIndex]
          return `<b>${o.a} and ${o.b}</b><br/>${o.shared} of their top ${o.size} Qloo entities in common`
        },
      },
      xAxis: { type: 'value' as const, min: 0, max: 1, show: false },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: rows.map((o) => `${o.a} · ${o.b}`),
        ...axisStyle(),
        axisLine: { show: false },
        axisLabel: {
          color: t.ink2,
          fontSize: 12,
          width: 176,
          overflow: 'truncate' as const,
          align: 'right' as const,
        },
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: 14,
          data: rows.map((o) => ({
            value: o.pct,
            itemStyle: {
              color: o.hood ? t.coral : t.mute,
              opacity: o.hood ? 1 : 0.6,
            },
          })),
          itemStyle: { borderRadius: [0, 7, 7, 0] },
          label: {
            show: true,
            position: 'right' as const,
            color: t.ink2,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: { value: number }) => `${Math.round(p.value * 100)}%`,
          },
          showBackground: true,
          backgroundStyle: {
            color: t.line,
            opacity: 0.35,
            borderRadius: [0, 7, 7, 0],
          },
        },
      ],
    } as unknown as EChartsOption
  }, [rows, theme])
  return <Chart option={option} height={rows.length * 32 + 12} theme={theme} label="Share of top Qloo entities each pair of places has in common" />
}

/** Séance results as a dot plot: each concept's three ratings on one line, the LLM-only concept in grey below. */
export function SeanceDots({ g }: { g: Geist }) {
  const { theme } = useTheme()
  const option = useMemo(() => {
    const t = tokens()
    const rows = (g.concepts ?? [])
      .filter((c) => c.panel)
      .map((c) => ({
        name: c.headline?.text ?? c.direction,
        p: c.panel!,
        base: false,
      }))
    if (g.baseline_panel) rows.push({ name: 'LLM only, no Qloo', p: g.baseline_panel, base: true })
    const dims = [
      ['Attention', 'attention', t.amber],
      ['Resonance', 'resonance', t.coral],
      ['Intent', 'interest', t.mint],
    ] as const
    return {
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: t.mute, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
      },
      grid: { left: 196, right: 16, top: 34, bottom: 24, containLabel: false },
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: {
          type: 'line' as const,
          axis: 'y' as const,
          lineStyle: { color: t.line },
        },
      },
      xAxis: {
        type: 'value' as const,
        min: 1,
        max: 5,
        interval: 1,
        ...axisStyle(),
      },
      yAxis: {
        type: 'category' as const,
        data: rows.map((r) => r.name),
        inverse: true,
        ...axisStyle(),
        splitLine: { show: false },
        axisLabel: {
          fontSize: 12,
          width: 184,
          overflow: 'truncate' as const,
          align: 'right' as const,
          color: (_v?: string | number, i?: number) => (rows[i ?? 0]?.base ? t.mute : t.ink2),
        },
      },
      series: [
        // The range line behind each row's three dots
        {
          type: 'custom' as const,
          silent: true,
          renderItem: (
            _p: unknown,
            api: {
              value: (i: number) => number
              coord: (v: [number, number]) => number[]
            },
          ) => {
            const [lo, hi, y] = [api.value(0), api.value(1), api.value(2)]
            const a = api.coord([lo, y])
            const b = api.coord([hi, y])
            return {
              type: 'line',
              shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] },
              style: { stroke: t.line, lineWidth: 3 },
            }
          },
          data: rows.map((r, i) => {
            const v = [r.p.avg.attention, r.p.avg.resonance, r.p.avg.interest]
            return [Math.min(...v), Math.max(...v), i]
          }),
          encode: { x: [0, 1], y: 2 },
          z: 1,
          tooltip: { show: false },
        },
        ...dims.map(([name, key, color]) => ({
          name,
          type: 'scatter' as const,
          symbolSize: 14,
          z: 2,
          data: rows.map((r) => ({
            value: [r.p.avg[key], r.name],
            itemStyle: {
              color: r.base ? t.mute : color,
              opacity: r.base ? 0.7 : 1,
            },
          })),
          itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
        })),
      ],
    } as unknown as EChartsOption
  }, [g, theme])
  const n = (g.concepts?.length ?? 0) + (g.baseline_panel ? 1 : 0)
  return <Chart option={option} height={60 + n * 44} theme={theme} label="Séance ratings per concept from 1 to 5, the generic LLM-only concept in grey" />
}

/** The budget as a treemap: taste zones, each split into its channels. */
export function BudgetTreemap({ plan, colors }: { plan: MediaPlan; colors: Record<string, RGB> }) {
  const { theme } = useTheme()
  const option = useMemo(() => {
    const t = tokens()
    const money = (v: number) => `${plan.currency} ${Math.round(v).toLocaleString('en-GB')}`
    return {
      tooltip: {
        formatter: (p: { name: string; value: number; treePathInfo: { name: string }[] }) =>
          `<b>${p.treePathInfo
            .map((x) => x.name)
            .filter(Boolean)
            .join(' · ')}</b><br/>${money(p.value)}`,
      },
      series: [
        {
          type: 'treemap' as const,
          roam: false,
          nodeClick: false as const,
          breadcrumb: { show: false },
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          upperLabel: {
            show: true,
            height: 26,
            color: '#fff',
            fontWeight: 600,
            fontSize: 12,
            padding: [0, 8],
            formatter: (p: { name: string; value: number }) => `${p.name}  ${money(p.value)}`,
          },
          label: {
            color: '#fff',
            fontSize: 11,
            formatter: (p: { name: string; value: number }) => `${p.name}\n${money(p.value)}`,
            lineHeight: 15,
          },
          itemStyle: {
            borderColor: t.surface,
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 6,
          },
          // levels[0] is the root (hidden), [1] the zones, [2] their channels
          levels: [
            {
              upperLabel: { show: false },
              itemStyle: { borderWidth: 0, gapWidth: 4 },
            },
            { itemStyle: { gapWidth: 2 } },
            { upperLabel: { show: false } },
          ],
          data: plan.zones
            .filter((z) => z.budget > 0)
            .map((z) => {
              const c = colors[z.key] ?? [217, 102, 63]
              return {
                name: z.name,
                value: z.budget,
                itemStyle: { color: rgb(c, 0.9) },
                children: z.channels
                  .filter((ch) => ch.budget > 0)
                  .map((ch, i) => ({
                    name: ch.label,
                    value: ch.budget,
                    itemStyle: { color: rgb(c, 0.85 - i * 0.12) },
                  })),
              }
            }),
        },
      ],
    } as unknown as EChartsOption
  }, [plan, colors, theme])
  return <Chart option={option} height={320} theme={theme} label="Budget by taste zone and channel" />
}

/**
 * Why these zones: how alike every pair of places is (share of top Qloo titles in common), ordered by
 * zone, so the blocks along the diagonal are the zones. Neighborhoods are compared with each other.
 */
export function SimilarityMatrix({ result }: { result: RunResult }) {
  const { theme } = useTheme()
  const zoneOf: Record<string, number> = {}
  result.zones.forEach((z, i) => z.markets.forEach((m) => (zoneOf[m] = i)))
  const names = result.markets.map((m) => m.name).sort((a, b) => (zoneOf[a] ?? 99) - (zoneOf[b] ?? 99))
  const pct = (a: string, b: string) => {
    if (a === b) return 1
    const o = result.overlap?.markets.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
    return o ? o.pct : null
  }
  const option = useMemo(() => {
    const t = tokens()
    // The diagonal (a place against itself) stays empty, so the colour scale is spent on real pairs.
    const data = names.flatMap((a, i) => names.map((b, j) => [j, i, i === j ? null : pct(a, b)])).filter((d) => d[2] != null)
    const vals = data.map((d) => d[2] as number).filter((v) => v < 1)
    return {
      grid: { left: 110, right: 16, top: 8, bottom: 70, containLabel: false },
      tooltip: {
        formatter: (p: unknown) => {
          const [x, y, v] = (p as { value: [number, number, number] }).value
          return x === y ? `<b>${names[x]}</b>` : `<b>${names[y]} and ${names[x]}</b><br/>${Math.round(v * 100)}% of top Qloo titles in common`
        },
      },
      xAxis: { type: 'category' as const, data: names, ...axisStyle(), axisLabel: { color: t.ink2, fontSize: 12, rotate: 30 }, splitArea: { show: false } },
      yAxis: { type: 'category' as const, data: names, ...axisStyle(), axisLabel: { color: t.ink2, fontSize: 12 }, inverse: true },
      visualMap: { show: false, min: Math.min(...vals, 0.5), max: Math.max(...vals, 0.6), inRange: { color: [t.surface, t.coral] } },
      series: [
        {
          type: 'heatmap' as const,
          data,
          label: {
            show: true,
            color: t.ink,
            fontSize: 12,
            formatter: (p: { value: [number, number, number] }) => (p.value[0] === p.value[1] ? '' : `${Math.round(p.value[2] * 100)}%`),
          },
          itemStyle: { borderColor: t.surface, borderWidth: 3, borderRadius: 6 },
        },
      ],
    } as unknown as EChartsOption
  }, [result, theme])
  return (
    <Chart
      option={option}
      height={names.length * 52 + 90}
      theme={theme}
      label="How alike each pair of places is: share of top Qloo titles in common, ordered by taste zone"
    />
  )
}
