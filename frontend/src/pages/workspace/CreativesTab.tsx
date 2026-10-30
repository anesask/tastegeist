import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Pencil, Quote, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, DOMAIN_LABEL, rgb, type Cited, type Concept, type Geist } from '../../lib/api'
import { cited, colorOf, personaName, placeName } from '../../lib/geists'
import { SeanceDots } from '../../components/Charts'
import { DataToLine } from '../../components/DataToLine'
import { MakersBrief, hexToRgb, posterColor, type PosterTint } from '../../components/MakersBrief'
import { AdFormats } from '../../components/AdFormats'
import { useSettings } from '../../lib/settings'
import { LedgerChip } from '../../components/Ledger'
import { Poster } from '../../components/Poster'
import { Button, Card, Pill, Source, useToast } from '../../components/ui'
import { useWorkspace } from './Workspace'

function Element({ title, items, g }: { title: string; items: (Cited | null | undefined)[]; g: Geist }) {
  const list = items.filter(Boolean) as Cited[]
  if (!list.length) return null
  return (
    <div>
      <div className="kicker">{title}</div>
      {list.map((el, i) => (
        <div key={i} className="border-t border-line py-3 text-sm leading-relaxed first:mt-2">
          {el.text}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cited(g, el.because).map((e) => (
              <LedgerChip key={e.id} e={e} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** One line of a concept, rewritable in your own campaigns; its Qloo citations stay with it. */
function EditableLine({
  label,
  el,
  g,
  editable,
  big = false,
  onSave,
}: {
  label: string
  el: Cited | null | undefined
  g: Geist
  editable: boolean
  big?: boolean
  onSave: (text: string) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (!el) return null
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="kicker">{label}</div>
        {el.edited && <Pill tone="neutral">Edited by you</Pill>}
        {editable && draft == null && (
          <button
            type="button"
            onClick={() => setDraft(el.text)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-mute hover:bg-surface-2 hover:text-ink"
            aria-label={`Edit the ${label.toLowerCase()}`}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      {draft == null ? (
        <p className={`mt-2 ${big ? 'text-xl leading-snug text-ink' : 'text-sm leading-relaxed text-ink-2'}`}>{el.text}</p>
      ) : (
        <form
          className="mt-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            try {
              await onSave(draft)
              setDraft(null)
            } finally {
              setSaving(false)
            }
          }}
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={big ? 3 : 4}
            className="w-full rounded-xl border border-line bg-surface p-3 text-sm outline-none focus:border-brand"
            aria-label={label}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" type="submit" disabled={saving || !draft.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <span className="t-caption">The Qloo citations below stay with the line.</span>
          </div>
        </form>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {cited(g, el.because).map((e) => (
          <LedgerChip key={e.id} e={e} />
        ))}
      </div>
    </div>
  )
}

export function CreativesTab() {
  const { campaign, result } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const qc = useQueryClient()
  const [allQuotes, setAllQuotes] = useState(false)
  const g = result.groups.find((x) => x.key === params.get('g')) ?? result.groups[0]
  const concepts = g.concepts ?? []
  const c: Concept | undefined = concepts.find((x) => x.id === params.get('c')) ?? concepts[g.chosen ?? 0]
  const prof = useQuery({ queryKey: ['profile', campaign.id, g.key], queryFn: () => api.profile(campaign.id, g.key), staleTime: Infinity, retry: false })
  const [tint, setTint] = useState<PosterTint>('zone')
  const settings = useSettings()
  // Demos are shared, so they show no one's brand kit.
  const brand = campaign.demo ? null : settings.data?.brand
  const placeColor = prof.data ? posterColor(prof.data.palette) : null
  const zoneColor = colorOf(result, g.key)
  // The big poster can carry the place's own palette; thumbnails and the rest keep the zone colour.
  const color = zoneColor
  const posterTint = tint === 'place' && placeColor ? placeColor : tint === 'brand' && brand?.color ? hexToRgb(brand.color) : zoneColor
  const chosen = concepts[g.chosen ?? 0]?.id === c?.id

  useEffect(() => {
    document.getElementById(`zone-chip-${g.key}`)?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [g.key])

  useEffect(() => {
    if (window.location.hash === '#seance') document.getElementById('seance')?.scrollIntoView({ behavior: 'smooth' })
    if (window.location.hash === '#data-to-line') document.getElementById('data-to-line-section')?.scrollIntoView({ behavior: 'smooth' })
  }, [c?.id])

  const fix = useMutation({
    mutationFn: () => api.applyFix(campaign.id, g.key, c!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      toast('Fix applied and re-tested on the same personas')
    },
    onError: (e) => toast(e instanceof Error && e.message ? e.message : 'Could not apply the fix'),
  })

  const saveLine = (field: 'headline' | 'big_idea' | 'body', text: string) =>
    api
      .editConcept(campaign.id, g.key, c!.id, field, text)
      .then(() => qc.invalidateQueries({ queryKey: ['campaign', campaign.id] }))
      .then(() => toast('Saved'))
      .catch(() => toast('Could not save that line'))
  const choose = useMutation({
    mutationFn: () => api.choose(campaign.id, g.key, c!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      toast('Chosen for the media plan')
    },
    onError: () => toast('Could not save the choice'),
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Zone switcher */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-2">
          {result.groups.map((x) => (
            <button
              key={x.key}
              id={`zone-chip-${x.key}`}
              onClick={() => setParams({ g: x.key })}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition active:scale-[0.98] ${x.key === g.key ? 'border-brand bg-brand font-medium text-on-brand' : 'border-line bg-surface text-ink-2 hover:border-ink-2/40 hover:text-ink'}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(colorOf(result, x.key)) }} />
              {placeName(x)} <span className="text-mute">· {personaName(x)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-display text-title leading-tight">Creative concepts</h2>
        <p className="mt-1 text-sm text-mute">
          {concepts.length} concepts tailored to {personaName(g)}, each built from this zone's Qloo ledger.
        </p>
      </div>

      {/* Three concepts */}
      <div className="grid gap-5 md:grid-cols-3">
        {concepts.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setParams({ g: g.key, c: x.id })}
            className={`card card-interactive overflow-hidden text-left ${x.id === c?.id ? 'ring-2 ring-ink' : ''}`}
          >
            <Poster g={g} c={x} color={color} productName={campaign.product_name} size="thumb" className="rounded-none" />
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 text-xs text-mute">
                <span>
                  Concept {i + 1} · {x.direction}
                </span>
                {i === (g.chosen ?? 0) && <Pill tone="ready">Chosen</Pill>}
              </div>
              <div className="mt-1 font-semibold">{x.headline?.text}</div>
              <p className="mt-1 line-clamp-2 text-sm text-mute">{x.big_idea?.text}</p>
              {x.panel && (
                <div className="mt-3 text-xs text-ink-2">
                  <b>
                    {x.panel.stop_scrolling} of {x.panel.size}
                  </b>{' '}
                  would stop scrolling
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {c && (
        <>
          {/* Concept detail: creative first, response beside it */}
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Poster g={g} c={c} color={posterTint} productName={campaign.product_name} brand={brand} />
            <div className="flex flex-col gap-6">
              <EditableLine label="Headline" el={c.headline} g={g} editable={!campaign.demo} big onSave={(t) => saveLine('headline', t)} />
              <EditableLine label="The big idea" el={c.big_idea} g={g} editable={!campaign.demo} big onSave={(t) => saveLine('big_idea', t)} />
              {c.panel && (
                <Card className="p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">The séance</h3>
                    <Pill tone="running">Directional</Pill>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-3xl font-bold">
                        {c.panel.stop_scrolling}
                        <span className="text-lg text-mute"> of {c.panel.size}</span>
                      </div>
                      <div className="text-xs text-mute">would stop scrolling</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">
                        {c.panel.would_consider}
                        <span className="text-lg text-mute"> of {c.panel.size}</span>
                      </div>
                      <div className="text-xs text-mute">would look it up</div>
                    </div>
                  </div>
                  <p className="t-caption mt-3">
                    Spread across the {c.panel.size} personas, 1 to 5:{' '}
                    {(
                      [
                        ['attention', 'Attention'],
                        ['resonance', 'Resonance'],
                        ['interest', 'Intent'],
                      ] as const
                    )
                      .map(([k, l]) => {
                        const xs = c.panel!.personas.map((p) => p[k])
                        return `${l} ${Math.min(...xs)} to ${Math.max(...xs)}`
                      })
                      .join(', ')}
                    . {c.panel.size} voices is a small panel; read it as direction, not a score.
                  </p>
                  {c.panel.top_objection && (
                    <div className="mt-4 border-t border-line pt-4 text-sm">
                      <div className="font-medium">Top objection</div>
                      <p className="mt-1 leading-relaxed text-ink-2">{c.panel.top_objection}</p>
                      <div className="mt-3 font-medium">Suggested fix</div>
                      <p className="mt-1 border-l-2 border-mint pl-3 leading-relaxed text-ink">{c.panel.fix}</p>
                      {!campaign.demo && (
                        <Button size="sm" className="mt-4" disabled={fix.isPending} onClick={() => fix.mutate()}>
                          {fix.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                          {fix.isPending ? 'Rewriting and re-testing…' : 'Apply fix and re-test'}
                        </Button>
                      )}
                    </div>
                  )}
                  {c.before && (
                    <div className="mt-4 rounded-xl bg-mint-soft p-3 text-sm text-ink-2">
                      <b className="text-mint">After the fix:</b> {c.panel.stop_scrolling} of {c.panel.size} stop, was {c.before.stop_scrolling} of{' '}
                      {c.before.size}
                      {c.before.headline && c.before.headline !== c.headline?.text && (
                        <span className="block text-xs text-mute">Previous headline: "{c.before.headline}"</span>
                      )}
                    </div>
                  )}
                </Card>
              )}
              <Button variant={chosen ? 'secondary' : 'primary'} disabled={chosen || choose.isPending || campaign.demo} onClick={() => choose.mutate()}>
                <Check size={16} /> {chosen ? 'Chosen for the media plan' : 'Choose for the media plan'}
              </Button>
              {campaign.demo && !chosen && (
                <p className="t-caption -mt-3">Samples are read-only. Use this brief to choose, edit and re-budget your own copy.</p>
              )}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <EditableLine label="Body copy" el={c.body} g={g} editable={!campaign.demo} onSave={(t) => saveLine('body', t)} />
            <Element title="Sound" items={[c.music]} g={g} />
          </div>
          <div>
            <div className="kicker">Moodboard</div>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {c.moodboard.map((m, i) => {
                const refs = cited(g, m.because)
                const img = refs.find((e) => e.image)
                return (
                  <figure key={i} className="card overflow-hidden">
                    {img && <img src={img.image!} alt={img.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />}
                    <figcaption className="p-4 text-sm leading-relaxed">
                      {m.text}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {refs.map((e) => (
                          <LedgerChip key={e.id} e={e} />
                        ))}
                      </div>
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <Element title="Partners" items={c.partners} g={g} />
            <Element title="Channels" items={c.channels} g={g} />
          </div>

          {prof.data && <MakersBrief p={prof.data} tint={tint} onTint={setTint} brandColor={brand?.color} />}

          <AdFormats g={g} c={c} color={posterTint} productName={campaign.product_name} brand={brand} />

          <DataToLine g={g} c={c} highlight={params.get('hl')} />

          {/* Audience simulation */}
          <section id="seance" className="scroll-mt-20">
            <h2 className="font-display text-title leading-tight">The séance</h2>
            <p className="mt-1 text-sm text-mute">
              How each concept performs with {g.concepts?.[0]?.panel?.size ?? 8} synthetic locals built from {placeName(g)}'s Qloo data, compared with the
              generic LLM-only concept.
            </p>
            <Card className="mt-4 p-5">
              <SeanceDots g={g} />
              <Source>Average persona ratings, 1 to 5. Synthetic personas from Qloo demographics and affinities; directional, not a survey.</Source>
            </Card>
            {c.panel && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[...c.panel.personas]
                  .sort((a, b) => b.attention + b.interest - (a.attention + a.interest))
                  .slice(0, allQuotes ? undefined : 2)
                  .map((p) => (
                    <Card key={p.id} className="p-5">
                      <div className="flex items-center justify-between text-xs text-mute">
                        <span className="font-medium text-ink-2" title="A composite built from group-level Qloo data, not a real person">
                          Composite · {p.market}, {p.age}, {p.gender}
                        </span>
                        <span>
                          Attention {p.attention}/5 · Intent {p.interest}/5
                        </span>
                      </div>
                      <p className={`mt-3 flex gap-2 leading-relaxed ${p.withheld ? 'text-sm italic text-mute' : 'text-base text-ink'}`}>
                        <Quote size={16} className="mt-1 shrink-0 text-mute" aria-hidden />
                        {p.quote}
                      </p>
                      <div className="mt-3 text-xs text-mute">Grounded in: {p.affinities.map((a) => `${a.name} (${DOMAIN_LABEL[a.domain]})`).join(' · ')}</div>
                    </Card>
                  ))}
              </div>
            )}
            {c.panel && c.panel.personas.length > 2 && (
              <button type="button" onClick={() => setAllQuotes((v) => !v)} className="text-link mt-4 text-sm">
                {allQuotes ? 'Show the two strongest' : `Show all ${c.panel.personas.length} reactions`}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  )
}
