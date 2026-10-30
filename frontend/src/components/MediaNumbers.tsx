import { useEffect, useMemo, useState } from 'react'
import { rgb, type MediaPlan, type RunResult } from '../lib/api'
import { colorOf } from '../lib/geists'
import { Source } from './ui'

/**
 * Starting CPMs per channel, in the plan's currency. Planning placeholders, not quotes: every cell is
 * editable, and edits are kept in this browser per campaign.
 */
export const START_CPM: Record<string, number> = { social: 7, online_video: 12, ooh: 6, audio: 14, influencers: 20, press: 25 }

type Grid = Record<string, Record<string, number>>

/** The CPM grid for a plan (this browser's edits over the starting values). */
export function useCpmGrid(campaignId: string, plan: MediaPlan) {
  const key = `tg-cpm-${campaignId}`
  const [grid, setGrid] = useState<Grid>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(grid))
    } catch {
      // storage unavailable: edits last for this visit
    }
  }, [key, grid])
  const cpm = (zone: string, ch: string) => grid[zone]?.[ch] ?? START_CPM[ch] ?? 10
  const impressions = (zone: string) =>
    (plan.zones.find((z) => z.key === zone)?.channels ?? []).reduce((a, c) => a + (c.budget / Math.max(cpm(zone, c.channel), 0.01)) * 1000, 0)
  const total = plan.zones.reduce((a, z) => a + impressions(z.key), 0)
  const spend = plan.zones.reduce((a, z) => a + z.budget, 0)
  return {
    grid,
    cpm,
    impressions,
    blended: total > 0 ? (spend / total) * 1000 : 0,
    edited: Object.keys(grid).length > 0,
    set: (zone: string, ch: string, v: number) => setGrid((g) => ({ ...g, [zone]: { ...g[zone], [ch]: v } })),
    reset: () => setGrid({}),
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB')

/** Impressions and reach per zone from editable CPMs and a frequency assumption. */
export function MediaNumbers({ campaignId, result }: { campaignId: string; result: RunResult }) {
  const plan = result.plan
  const g = useCpmGrid(campaignId, plan)
  const [freq, setFreq] = useState(4)
  const [cap, setCap] = useState(3)
  const zones = plan.zones.filter((z) => z.budget > 0)
  const channels = plan.channels.map((c) => c.channel)
  const label = (ch: string) => plan.channels.find((c) => c.channel === ch)?.label ?? ch
  const weeks = useMemo(() => Math.max(1, Math.round((new Date(plan.end).getTime() - new Date(plan.start).getTime()) / (7 * 86_400_000))), [plan])
  const effFreq = Math.min(freq, cap * weeks)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-6">
        <label className="text-sm">
          <span className="block text-xs text-mute">Average frequency per person</span>
          <input
            type="number"
            min={1}
            max={20}
            value={freq}
            onChange={(e) => setFreq(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-9 w-24 rounded-lg border border-line bg-surface px-2 tabular"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-mute">Frequency cap per week</span>
          <input
            type="number"
            min={1}
            max={20}
            value={cap}
            onChange={(e) => setCap(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 h-9 w-24 rounded-lg border border-line bg-surface px-2 tabular"
          />
        </label>
        <p className="text-sm text-ink-2">
          Blended CPM {plan.currency} {g.blended.toFixed(2)} over {weeks} weeks
          {effFreq < freq ? `; the cap limits frequency to ${effFreq}` : ''}.
        </p>
        {g.edited && (
          <button type="button" onClick={g.reset} className="text-link text-sm">
            Reset CPMs
          </button>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-mute">
            <tr>
              <th className="py-2 pr-3 font-normal">Taste zone</th>
              {channels.map((ch) => (
                <th key={ch} className="py-2 pr-3 font-normal">
                  CPM {label(ch)}
                </th>
              ))}
              <th className="py-2 pr-3 text-right font-normal">Impressions</th>
              <th className="py-2 text-right font-normal">Reach</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {zones.map((z) => (
              <tr key={z.key} className="border-t border-line">
                <td className="py-2 pr-3">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: rgb(colorOf(result, z.key)) }} />
                  {z.name}
                </td>
                {channels.map((ch) =>
                  z.channels.some((c) => c.channel === ch) ? (
                    <td key={ch} className="py-1.5 pr-3">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={g.cpm(z.key, ch)}
                        onChange={(e) => g.set(z.key, ch, Math.max(0.5, Number(e.target.value) || 0.5))}
                        aria-label={`CPM for ${label(ch)} in ${z.name}`}
                        className="h-8 w-20 rounded-lg border border-line bg-surface px-2"
                      />
                    </td>
                  ) : (
                    <td key={ch} className="py-1.5 pr-3 text-mute">
                      -
                    </td>
                  ),
                )}
                <td className="py-2 pr-3 text-right">{fmt(g.impressions(z.key))}</td>
                <td className="py-2 text-right">{fmt(g.impressions(z.key) / effFreq)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Source>
        Starting CPMs are planning placeholders ({plan.currency}): social {START_CPM.social}, online video {START_CPM.online_video}, out of home {START_CPM.ooh}
        , audio {START_CPM.audio}, creators {START_CPM.influencers}, press {START_CPM.press}. Replace them with your buyer's rates; edits stay in this browser.
        Reach = impressions ÷ average frequency, capped by the weekly cap. The Results forecast uses the blended CPM.
      </Source>
    </div>
  )
}
