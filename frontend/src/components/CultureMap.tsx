import { useMemo } from 'react'
import { DOMAIN_LABEL, type Domain, type Geist } from '../lib/api'
import { personaName, type RGB } from '../lib/geists'
import { useTheme } from '../theme'
import { Chart, tokens } from './Chart'

const DOMAINS: Domain[] = ['artist', 'tv_show', 'movie', 'podcast', 'brand']

/**
 * The Culture Map (spec decision 6): the geist at the center, its Qloo entities orbiting it,
 * grouped by domain and sized by lift. Includes the market's wider top entities, not only the ledger.
 */
export function CultureMap({ g, color, extra = [] }: { g: Geist; color: RGB; extra?: Geist['ledger'] }) {
  const { theme } = useTheme()
  const option = useMemo(() => {
    const t = tokens()
    const palette: Record<Domain, string> = {
      artist: t.coral,
      tv_show: t.lilac,
      movie: t.amber,
      podcast: t.slate,
      brand: t.mint,
    }
    const seen = new Set<string>()
    const ents = [...g.ledger, ...extra].filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, 26)
    const maxLift = Math.max(...ents.map((e) => e.lift), 1)
    // Only the strongest entities carry a label; the rest show theirs on hover, so labels never pile up.
    const labelled = new Set(
      [...ents]
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 8)
        .map((e) => e.id),
    )
    const center = {
      id: 'center',
      name: personaName(g),
      symbolSize: 54,
      category: DOMAINS.length,
      fixed: false,
      itemStyle: { color: `rgb(${color.join(',')})` },
      label: {
        show: true,
        fontWeight: 600 as const,
        fontSize: 13,
        color: t.ink,
        position: 'bottom' as const,
      },
    }
    return {
      tooltip: {
        formatter: (p: unknown) => {
          const d = (p as { data: { name: string; lift?: number; domain?: Domain } }).data
          return d.lift ? `<b>${d.name}</b><br/>${DOMAIN_LABEL[d.domain!]} · lift ${d.lift.toFixed(2)}×` : `<b>${d.name}</b>`
        },
      },
      legend: {
        bottom: 0,
        data: DOMAINS.map((d) => DOMAIN_LABEL[d]),
        textStyle: { color: t.mute, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
      },
      series: [
        {
          type: 'graph' as const,
          layout: 'force' as const,
          roam: false,
          draggable: true,
          force: { repulsion: 360, edgeLength: [90, 170], gravity: 0.08 },
          categories: [
            ...DOMAINS.map((d) => ({
              name: DOMAIN_LABEL[d],
              itemStyle: { color: palette[d] },
            })),
            { name: 'Geist' },
          ],
          data: [
            center,
            ...ents.map((e) => ({
              id: e.id,
              name: e.name,
              lift: e.lift,
              domain: e.domain,
              category: DOMAINS.indexOf(e.domain),
              symbolSize: 12 + 26 * (e.lift / maxLift),
              label: {
                show: labelled.has(e.id),
                position: 'right' as const,
                fontSize: 12,
                color: t.ink2,
              },
            })),
          ],
          links: ents.map((e) => ({
            source: 'center',
            target: e.id,
            lineStyle: { color: t.line, width: 1, opacity: 0.9 },
          })),
          emphasis: { focus: 'adjacency' as const, label: { show: true } },
          animationDuration: 1200,
          animationEasingUpdate: 'quinticInOut' as const,
        },
      ],
    }
  }, [g, color, extra, theme])
  return <Chart option={option} height={420} theme={theme} label={`Culture map of ${personaName(g)}: Qloo entities by domain, sized by lift`} />
}
