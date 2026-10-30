import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { LEGAL_COMPLETE, LEGAL_UPDATED, OPERATOR } from '../lib/legal'
import { SiteFooter, SiteHeader } from '../components/Site'
import { Button } from '../components/ui'
import { useTitle } from '../lib/title'

/* Draft legal texts. They describe what the code does today; review them before going live. */

export function LegalPage({
  kicker,
  title,
  intro,
  children,
  legal = true,
}: {
  kicker: string
  title: string
  intro?: ReactNode
  children: ReactNode
  legal?: boolean
}) {
  useTitle(title)
  return (
    <div className="min-h-full bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 md:px-8 md:pt-16">
        <div className="kicker">{kicker}</div>
        <h1 className="mt-3 font-display text-statement leading-[1]">{title}</h1>
        {intro && <p className="measure mt-5 text-lg text-ink-2">{intro}</p>}
        {legal && <p className="t-caption mt-4">Last updated {LEGAL_UPDATED}</p>}
        {legal && !LEGAL_COMPLETE && (
          <div className="mt-6 flex gap-3 rounded-xl bg-amber-soft p-4 text-sm text-ink">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber" aria-hidden />
            Draft: the operator details are not filled in yet (frontend/src/lib/legal.ts).
          </div>
        )}
        <div className="legal mt-12">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}

export function H({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="t-h2 mt-12 scroll-mt-20 first:mt-0">
      {children}
    </h2>
  )
}

const Address = () => (
  <address className="not-italic">
    {OPERATOR.name}
    <br />
    {OPERATOR.street}
    <br />
    {OPERATOR.city}
    <br />
    {OPERATOR.country}
  </address>
)

export function Imprint() {
  return (
    <LegalPage kicker="Impressum" title="Imprint">
      <H>Provider (§ 5 DDG)</H>
      <Address />
      <H>Contact</H>
      <p>
        Email: {OPERATOR.email}
        {OPERATOR.phone && (
          <>
            <br />
            Phone: {OPERATOR.phone}
          </>
        )}
        <br />
        Web:{' '}
        <a href={`https://${OPERATOR.website}`} className="text-link" rel="noopener">
          {OPERATOR.website}
        </a>
      </p>
      {OPERATOR.vatId && (
        <>
          <H>VAT ID</H>
          <p>VAT identification number under § 27a UStG: {OPERATOR.vatId}</p>
        </>
      )}
      <H>Data sources</H>
      <p>
        Taste data by Qloo. Maps © OpenStreetMap contributors © CARTO. Music previews by Deezer. Titles and images belong to their owners and are shown as
        references.
      </p>
    </LegalPage>
  )
}

export function Privacy() {
  return (
    <LegalPage
      kicker="Datenschutzerklärung"
      title="Privacy"
      intro="Tastegeist works without accounts, tracking or ads. This page lists exactly what is processed, where and why."
    >
      <H>Who is responsible</H>
      <p>The controller under the GDPR is:</p>
      <Address />
      <p>Email: {OPERATOR.email}</p>

      <H>In short</H>
      <ul>
        <li>No account, no advertising, no tracking pixels, no analytics cookies. We count page views per page and day, without any identifier.</li>
        <li>One essential cookie keeps your campaigns in your browser.</li>
        <li>What you type into a brief is sent to an AI provider to write the campaign. Don't put personal data into a brief.</li>
        <li>Nothing personal is sent to Qloo: only places, products and cultural references.</li>
      </ul>

      <H>1. Visiting the site</H>
      <p>
        When you open Tastegeist, our server receives your IP address and the usual request data (time, page, browser). We use the IP address in memory only, to
        limit how many campaigns one connection can start per hour, which protects the service and its costs (Art. 6 (1) (f) GDPR, legitimate interest in a
        secure, affordable service). It is not stored in a database. The server's access logs are kept for up to 14 days.
      </p>
      <p>
        Tastegeist runs on a virtual server rented from <b>netcup GmbH</b> (Karlsruhe, Germany), which hosts it on our behalf under a data processing agreement
        (Art. 28 GDPR). Campaigns, settings and logs are stored on that server.
      </p>
      <p>
        To know which pages are used and to fix what breaks, your browser reports two things: that a page was opened (only its path, with campaign ids removed,
        added to a count per day) and, if a page crashes, the error message, the page path and the technical stack trace. Neither contains a cookie, an ID, your
        IP address or anything you typed, and neither can be linked to you. Nothing is sent if your browser has Do Not Track switched on. Error reports are kept
        for the most recent 2,000 and page counts for up to 12 months (Art. 6 (1) (f) GDPR, legitimate interest in a working service).
      </p>

      <H>2. Your workspace</H>
      <p>
        Campaigns are tied to an anonymous workspace: a random ID in an essential cookie (<code>tg_ws</code>, 90 days). The campaigns you create (the brief and
        its results) are stored on our server under that ID. There is no name or email attached. Legal basis: Art. 6 (1) (b) GDPR, providing the service you
        asked for. Workspace settings you choose to enter (a brand or agency name and logo, a client name, defaults, a Slack webhook) are stored the same way.
        You can delete everything at any time (see section 8). Our server data, including campaigns, is backed up daily; backups are kept for 14 days and then
        overwritten, so a deletion reaches the backups within 14 days.
      </p>

      <H>3. Writing the campaign: AI providers</H>
      <p>
        To name audiences, write concepts and run the synthetic panel, the text of your brief and the cultural data for your places are sent to <b>Anthropic</b>{' '}
        (Claude, USA). If generated images are switched on, concept descriptions go to <b>OpenAI</b> (USA). Both process the data on our behalf under their API
        terms, which exclude using it to train models; transfers to the USA rely on the EU-US Data Privacy Framework or standard contractual clauses. If you
        paste a product URL, our server fetches that public page once to read the product description.
      </p>

      <H>4. Taste data: Qloo</H>
      <p>
        Our server asks <b>Qloo</b> for the cultural taste of places (cities, neighborhoods) and references (brands, artists, shows). These requests contain no
        personal data. Results describe what groups tend to like, never what one person does.
      </p>

      <H>5. Content your browser loads from others</H>
      <p>Some content is loaded directly by your browser, which means those providers see your IP address:</p>
      <ul>
        <li>
          <b>Map tiles</b> from CARTO (basemaps.cartocdn.com), for the maps.
        </li>
        <li>
          <b>Images</b> of titles, artists and places from Qloo (images.qloo.com).
        </li>
        <li>
          <b>Music previews</b> and album covers from Deezer (only when a Culture page is open; audio only when you press play).
        </li>
      </ul>
      <p>Fonts are hosted by us; no requests go to Google.</p>

      <H>6. Storage in your browser</H>
      <p>
        See <Link to="/cookies">Cookies and storage</Link>: the workspace cookie, plus your theme, your unsent draft and whether you've seen the storage notice.
        All essential or chosen by you; none is used for tracking.
      </p>

      <H>7. How long we keep data</H>
      <p>
        Campaigns stay until you delete them or the workspace has been unused for 12 months. Cached responses from Qloo and the AI provider contain no personal
        data.
      </p>

      <H>8. Your rights</H>
      <p>
        You have the right to access, rectification, erasure, restriction, data portability and to object (Art. 15 to 21 GDPR). Because the workspace is
        anonymous, the quickest way to delete your data is the button below; for anything else, write to {OPERATOR.email} and include your campaign link. You
        can also complain to a data protection authority, for example the one in your federal state.
      </p>
      <DeleteWorkspace />
    </LegalPage>
  )
}

/** Erase this browser's workspace: its campaigns, their results, and the cookie. */
function DeleteWorkspace() {
  const [armed, setArmed] = useState(false)
  const del = useMutation({ mutationFn: api.deleteWorkspace })
  if (del.isSuccess)
    return <p className="rounded-xl bg-mint-soft p-4 text-sm text-ink">Done. {del.data.deleted} campaigns and this browser's workspace were deleted.</p>
  return (
    <div className="not-prose mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">Delete my data</div>
        <p className="mt-1 text-sm text-ink-2">Every campaign in this browser's workspace, its settings and the workspace cookie. This can't be undone.</p>
      </div>
      {armed ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" disabled={del.isPending} onClick={() => del.mutate()}>
            <Trash2 size={14} /> Yes, delete everything
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="danger" onClick={() => setArmed(true)}>
          <Trash2 size={14} /> Delete my data
        </Button>
      )}
      {del.isError && <p className="w-full text-sm text-coral">That didn't work. Try again, or email {OPERATOR.email}.</p>}
    </div>
  )
}

export function Terms() {
  return (
    <LegalPage
      kicker="Nutzungsbedingungen"
      title="Terms of use"
      intro="The short version: use Tastegeist for real campaigns, check its work, and don't misuse it."
    >
      <H>1. The service</H>
      <p>
        Tastegeist turns a campaign brief into taste zones, creative concepts, a synthetic audience test and a media plan, using taste data from Qloo and AI
        models. It is provided as is, currently free of charge, and may change or be unavailable at times.
      </p>
      <H>2. What the results are</H>
      <ul>
        <li>Taste data describes what groups tend to like. It is never a statement about an individual.</li>
        <li>Concepts, persona quotes, mood descriptions and the synthetic panel are AI-generated. They are directional, not research or a survey.</li>
        <li>The benefit forecast is a scenario model, not a promise of results. Validate with real tests, like the A/B tests in the plan.</li>
        <li>Images of titles, artists and places are references that belong to their owners. They are not licensed for use in your ads.</li>
      </ul>
      <H>3. Your content</H>
      <p>
        You keep the rights to your briefs. You may use the concepts and plans Tastegeist generates for you as you like, and you are responsible for checking
        them before you publish: rights, claims, brand safety and advertising rules (for example age limits for alcohol).
      </p>
      <H>4. Fair use</H>
      <p>
        Don't put personal data or confidential third-party information into a brief, don't try to break or overload the service, and don't use it to target
        people by sensitive traits such as ethnicity, religion, health or politics. We may limit or block use that does.
      </p>
      <p>
        Tastegeist doesn't plan campaigns for weapons and ammunition, illegal drugs, adult content, tobacco and vaping, gambling, or hate, and refuses briefs
        that try to instruct the AI instead of describing a product. Briefs are checked automatically for both.
      </p>
      <H>5. Liability</H>
      <p>
        We are liable without limitation for intent and gross negligence and for injury to life, body or health. For slight negligence we are liable only for
        breach of essential obligations, limited to the foreseeable damage typical for this kind of service. Liability under the Product Liability Act is
        unaffected.
      </p>
      <H>6. Law</H>
      <p>
        German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory consumer protection in your country is
        unaffected.
      </p>
    </LegalPage>
  )
}

const STORAGE: [string, string, string, string][] = [
  ['tg_ws', 'Cookie', 'Keeps your campaigns in this browser (anonymous workspace ID)', '90 days'],
  ['tg-theme', 'Local storage', 'Your light or dark theme', 'Until you clear it'],
  ['tg-draft', 'Local storage', 'Your unsent campaign brief, so a reload loses nothing', 'Until you create the campaign or clear it'],
  ['tg-storage-notice', 'Local storage', 'Remembers that you closed the storage notice', 'Until you clear it'],
]

export function Cookies() {
  return (
    <LegalPage
      kicker="Cookies und Speicher"
      title="Cookies and storage"
      intro="Tastegeist stores only what it needs to work. Nothing here tracks you, so there is nothing to consent to."
    >
      <H>What is stored</H>
      <div className="not-prose mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-mute">
            <tr className="border-b border-line">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Purpose</th>
              <th className="py-2 font-medium">Kept for</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE.map(([n, t, p, k]) => (
              <tr key={n} className="border-b border-line align-top">
                <td className="py-3 pr-4 font-medium">
                  <code>{n}</code>
                </td>
                <td className="py-3 pr-4 text-ink-2">{t}</td>
                <td className="py-3 pr-4 text-ink-2">{p}</td>
                <td className="py-3 text-ink-2">{k}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <H>Why there is no consent banner</H>
      <p>
        Storage that is strictly necessary for a service you asked for, or that only remembers a choice you made, doesn't need consent (§ 25 Abs. 2 TDDDG).
        Everything above falls into that group. No analytics, advertising or social media cookies are used. If that ever changes, we will ask first.
      </p>
      <H>Third-party content</H>
      <p>
        Maps, images and music previews load from CARTO, Qloo and Deezer, which see your IP address when your browser fetches them. They set no cookies through
        Tastegeist. Details are in the <Link to="/privacy">privacy policy</Link>.
      </p>
      <H>Clear it yourself</H>
      <p>You can delete all of it in your browser settings, or delete your campaigns and the workspace cookie from the privacy page.</p>
    </LegalPage>
  )
}
