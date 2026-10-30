import * as echarts from 'echarts'
import { useEffect, useMemo, useRef } from 'react'
import type { Theme } from '../theme'

/** Read the live design tokens so charts follow the theme. */
export function tokens() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    mute: v('--mute'),
    line: v('--line'),
    surface: v('--surface'),
    brand: v('--brand'),
    lilac: v('--lilac'),
    mint: v('--mint'),
    coral: v('--coral'),
    amber: v('--amber'),
    slate: v('--slate'),
  }
}

/** Shared Tastegeist chart styling: Inter, soft grid, card-like tooltip, rounded bars. */
function baseOption(): echarts.EChartsOption {
  const t = tokens()
  return {
    color: [t.coral, t.mint, t.amber, t.lilac, t.slate, t.mute],
    textStyle: {
      fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
      color: t.ink2,
    },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(26,23,20,.14);',
    },
    animationDuration: 700,
    animationEasing: 'cubicOut',
  }
}

export function axisStyle() {
  const t = tokens()
  return {
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { color: t.mute, fontSize: 11 },
    splitLine: { lineStyle: { color: t.line, type: 'dashed' as const } },
  }
}

type Axis = { type?: string; data?: unknown[] }
type Series = { name?: string; type?: string; data?: unknown[] }

/**
 * The numbers behind a category chart (bars, lines, dots), as a table for screen readers: one row per
 * category, one column per series. Charts without a category axis (treemaps, maps) return null.
 */
function toTable(option: echarts.EChartsOption): { head: string[]; rows: (string | number)[][] } | null {
  const axes = [option.yAxis, option.xAxis].flatMap((a) => (Array.isArray(a) ? a : a ? [a] : [])) as Axis[]
  const cat = axes.find((a) => a.type === 'category' && Array.isArray(a.data))
  const series = ((Array.isArray(option.series) ? option.series : option.series ? [option.series] : []) as Series[]).filter(
    (x) => Array.isArray(x.data) && x.type !== 'custom',
  )
  if (!cat || !series.length) return null
  const val = (d: unknown): string | number => {
    const v = d && typeof d === 'object' && 'value' in d ? (d as { value: unknown }).value : d
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : String(x))).join(', ')
    return typeof v === 'number' ? Math.round(v * 100) / 100 : String(v ?? '')
  }
  const name = (c: unknown) => (c && typeof c === 'object' && 'value' in c ? String((c as { value: unknown }).value) : String(c))
  return {
    head: series.map((x, i) => x.name ?? `Value ${i + 1}`),
    rows: cat.data!.map((c, i) => [name(c), ...series.map((x) => val(x.data![i]))]),
  }
}

export function Chart({
  option,
  height = 240,
  theme,
  label,
  onClick,
}: {
  option: echarts.EChartsOption
  height?: number
  theme: Theme
  label: string
  onClick?: (params: echarts.ECElementEvent) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: 'svg' })
    chart.current = c
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    // theme is a dependency so token colors are re-read when it changes
    chart.current?.setOption({ ...baseOption(), ...option }, { notMerge: true })
  }, [option, theme])

  useEffect(() => {
    const c = chart.current
    if (!c || !onClick) return
    c.on('click', onClick)
    return () => {
      c.off('click', onClick)
    }
  }, [onClick])

  const table = useMemo(() => toTable(option), [option])
  return (
    <>
      <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />
      {/* A table ignores width: 1px, so the screen-reader copy sits in a clipped box. */}
      {table && (
        <div className="sr-only">
          <table>
            <caption>{label}</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                {table.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{r[0]}</th>
                  {r.slice(1).map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
