import { Copy } from 'lucide-react'
import { useState } from 'react'
import { rgb, type RunResult } from '../lib/api'
import { colorOf } from '../lib/geists'
import { pText, twoProportion } from '../lib/stats'
import { Source, useToast } from './ui'

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// What a launch is judged on, by objective: one primary KPI, the supporting ones.
const KPIS: Record<string, { primary: string; support: string[] }> = {
  launch: { primary: 'Reach in the zone', support: ['Click-through rate per arm', 'Ad recall lift (brand-lift study)', 'Branded search in the zone'] },
  awareness: { primary: 'Reach in the zone', support: ['Ad recall lift (brand-lift study)', 'Video completion rate', 'Branded search in the zone'] },
  sales: { primary: 'Conversions', support: ['Cost per conversion', 'Click-through rate per arm', 'Revenue per zone'] },
  consideration: { primary: 'Click-through rate', support: ['Landing-page engagement', 'Sign-ups or saves', 'Cost per visit'] },
}

/** How to tell whether it worked: KPIs per zone, a UTM convention, and the A/B readout. */
export function Measurement({ result }: { result: RunResult }) {
  const toast = useToast()
  const plan = result.plan
  const campaign = slug(result.brief.product_name || result.brief.title)
  const kpi = KPIS[result.brief.objective] ?? KPIS.launch
  const zones = plan.zones.filter((z) => z.budget > 0)
  const [key, setKey] = useState(zones.find((z) => z.ab_test)?.key ?? zones[0]?.key)
  const z = zones.find((x) => x.key === key)
  const [ab, setAb] = useState({ ai: '', ac: '', bi: '', bc: '' })
  const n = (v: string) => Number(v.replace(/\D/g, '')) || 0
  const need = z?.ab_test?.impressions_per_arm ?? 0
  const test = twoProportion(n(ab.ac), n(ab.ai), n(ab.bc), n(ab.bi))
  const enough = n(ab.ai) >= need && n(ab.bi) >= need
  const utm = (zone: string, ch: string, arm: string) => `utm_source=${ch}&utm_medium=paid&utm_campaign=${campaign}&utm_content=${slug(zone)}-${arm}`

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h4 className="t-h3">What counts as working</h4>
        <p className="mt-1 text-sm text-ink-2">
          Primary KPI for a {result.brief.objective || 'launch'}: <b className="text-ink">{kpi.primary}</b>, per zone. Also track{' '}
          {kpi.support.join(', ').toLowerCase()}.
        </p>
        <h4 className="t-h3 mt-6">Tag every link the same way</h4>
        <p className="mt-1 text-sm text-ink-2">
          One campaign name, the zone and the test arm in the content tag, so analytics splits results the way the plan does.
        </p>
        <ul className="mt-3 space-y-2">
          {zones.map((zz) => {
            const ch = zz.channels[0]?.channel ?? 'social'
            const text = utm(zz.name, ch, 'a')
            return (
              <li key={zz.key} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: rgb(colorOf(result, zz.key)) }} />
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1 text-xs">{text}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(text)
                    toast('UTM copied')
                  }}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mute hover:bg-surface-2 hover:text-ink"
                  aria-label={`Copy the UTM for ${zz.name}`}
                >
                  <Copy size={13} />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="t-caption mt-2">Swap utm_source per channel and the last part to "-b" for the B arm.</p>
      </div>

      <div className="card p-5">
        <h4 className="t-h3">A/B readout</h4>
        <p className="mt-1 text-sm text-ink-2">
          Enter the live numbers when the test has run. The séance predicted the winner; this checks it with real traffic.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {zones
            .filter((x) => x.ab_test)
            .map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setKey(x.key)}
                className={`rounded-full border px-3 py-1 text-xs ${x.key === key ? 'border-ink bg-ink text-bg' : 'border-line text-ink-2'}`}
              >
                {x.name}
              </button>
            ))}
        </div>
        {z?.ab_test && (
          <>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs text-mute">
                <tr>
                  <th className="pb-1 font-normal">Arm</th>
                  <th className="pb-1 font-normal">Impressions</th>
                  <th className="pb-1 font-normal">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['A', z.ab_test.a.headline, 'ai', 'ac'],
                    ['B', z.ab_test.b.headline, 'bi', 'bc'],
                  ] as const
                ).map(([arm, h, i, c]) => (
                  <tr key={arm} className="border-t border-line">
                    <td className="py-2 pr-2">
                      <b>{arm}</b> <span className="text-xs text-mute">{h}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        inputMode="numeric"
                        value={ab[i]}
                        onChange={(e) => setAb({ ...ab, [i]: e.target.value })}
                        aria-label={`Impressions, arm ${arm}`}
                        className="h-8 w-24 rounded-lg border border-line bg-surface px-2 tabular"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        inputMode="numeric"
                        value={ab[c]}
                        onChange={(e) => setAb({ ...ab, [c]: e.target.value })}
                        aria-label={`Clicks, arm ${arm}`}
                        className="h-8 w-20 rounded-lg border border-line bg-surface px-2 tabular"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm" role="status">
              {!n(ab.ai) || !n(ab.bi) ? (
                <span className="text-mute">Needs about {need.toLocaleString('en-GB')} impressions per arm before reading it.</span>
              ) : (
                <>
                  A is {test.lift >= 0 ? '+' : ''}
                  {Math.round(test.lift * 100)}% against B, {pText(test.p)}.{' '}
                  {!enough ? (
                    <span className="text-amber">Too early: keep running to {need.toLocaleString('en-GB')} impressions per arm.</span>
                  ) : test.p < 0.05 ? (
                    <b>{test.lift > 0 ? 'A wins: move the budget to A.' : 'B wins: move the budget to B.'}</b>
                  ) : (
                    <span>No clear winner: keep the split or test a sharper variant.</span>
                  )}
                </>
              )}
            </p>
            <Source>Two-sided two-proportion z test on click-through. {z.ab_test.assumption}.</Source>
          </>
        )}
      </div>
    </div>
  )
}
