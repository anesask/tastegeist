import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { SiteFooter, SiteHeader } from '../components/Site'
import { Wash } from '../components/Wash'
import { api } from '../lib/api'
import { Button, useToast } from '../components/ui'
import { useTitle } from '../lib/title'

const TIERS = [
  {
    name: 'Solo',
    price: '$49',
    per: 'per market',
    who: 'Creators, small brands, freelancers',
    features: ['One brief at a time', 'Up to 3 markets, neighborhood detail', 'Three concepts per zone plus the séance', 'PDF and Excel export'],
    cta: { to: '/app/new', label: 'Create a campaign' },
  },
  {
    name: 'Team',
    price: '$199',
    per: 'for ten markets',
    who: 'Marketing teams and agencies',
    features: ['10 brands, 40 markets per brief', 'Shared workspaces and comments', 'Per-market JSON for media buying', 'Reviewer approval'],
    cta: { to: '/app/new', label: 'Start with a campaign' },
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    per: 'annual',
    who: 'Large brands and holding companies',
    features: [
      'Unlimited markets, portfolio view',
      'Brand library: approved and banned references',
      'SSO, roles, audit log',
      'API: push audiences, webhooks when a market shifts',
    ],
    cta: { to: '/app/c/eu/zones', label: 'See the demo' },
  },
]

export function PricingTiers() {
  const toast = useToast()
  // The demo's own covers as a soft wash behind each plan (cached, shared with the landing page).
  const us = useQuery({ queryKey: ['campaign', 'us'], queryFn: () => api.campaign('us'), staleTime: Infinity })
  const imgs = (us.data?.result?.groups ?? []).flatMap((g) =>
    g.ledger
      .filter((e) => e.image)
      .slice(0, 2)
      .map((e) => e.image),
  )
  return (
    <div className="grid items-stretch gap-5 md:grid-cols-3">
      {TIERS.map((t, i) => (
        <div
          key={t.name}
          className={`card group relative isolate flex flex-col overflow-hidden p-7 transition duration-700 hover:-translate-y-0.5 ${t.featured ? 'shadow-2xl ring-2 ring-ink md:-my-3 md:py-10' : ''}`}
        >
          <Wash images={[imgs[i * 2], imgs[i * 2 + 1]]} strength={t.featured ? 'strong' : 'soft'} />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t.name}</h3>
            {t.featured && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-bg">Most popular</span>}
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-display text-6xl leading-none tracking-tight">{t.price}</span>
            <span className="text-sm text-mute">{t.per}</span>
          </div>
          <p className="mt-2 text-sm text-mute">{t.who}</p>
          <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-6 text-sm">
            {t.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-mint" /> {f}
              </li>
            ))}
          </ul>
          <Button
            variant={t.featured ? 'primary' : 'secondary'}
            className="mt-8"
            onClick={() => toast(`${t.name} plans are coming soon. Free during the hackathon.`)}
          >
            Coming soon
          </Button>
        </div>
      ))}
    </div>
  )
}

export function Pricing() {
  useTitle('Pricing')
  return (
    <div className="min-h-full bg-bg">
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-12 md:px-8">
        <div className="kicker">Pricing</div>
        <h1 className="mt-3 max-w-3xl font-display text-hero leading-[0.95] tracking-tight">
          Agency-grade culture strategy,
          <span className="block italic text-mute">without the agency invoice.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-2">
          A culture deck from a strategist costs $20k to $80k and takes two to four weeks. Tastegeist does it in minutes and re-runs on every edit.
        </p>
        <div className="mt-14">
          <PricingTiers />
        </div>
        <p className="mt-8 text-sm text-mute">Hackathon build: every plan is free while we're in the Qloo Agentic Hackathon. Prices show the intended model.</p>
      </section>
      <SiteFooter />
    </div>
  )
}
