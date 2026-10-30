import { Link } from 'react-router'
import { GLOSSARY } from '../lib/glossary'
import { OPERATOR } from '../lib/legal'
import { H, LegalPage } from './Legal'

/* Trust and support pages. Every claim describes what the code does today. */

export function Methodology() {
  return (
    <LegalPage
      legal={false}
      kicker="Methodology"
      title="How Tastegeist works"
      intro="What is data, what is computed and what is AI, step by step. Read this before you trust a number."
    >
      <H>1. The brief becomes a set of tastes</H>
      <p>
        A new product has no history in any taste graph, so Tastegeist anchors it to two to five <b>anchors</b>: real brands, artists or shows its audience
        already loves. Claude proposes them from your description; you confirm or swap them; Qloo resolves each to an entity.
      </p>
      <H>2. Each place gets a culture map (Qloo data)</H>
      <p>
        For every city, hotspot or neighborhood, Tastegeist asks Qloo's Insights API for the top 50 titles in five domains: music, TV, film, podcasts and
        brands, plus genre tags. The anchors are weighted low (0.2), so the place shapes the answer rather than the product; without that, every place returns
        nearly the same list.
      </p>
      <H>3. Lift: what over-indexes where (computed)</H>
      <p>
        Qloo's raw affinity scores sit in a narrow band, so Tastegeist ranks instead: a title's rank score in one place divided by its average across all places
        in the brief. <b>Lift</b> 1.8× means the title ranks far higher here than elsewhere. It is a comparison inside your brief, not an absolute score.
      </p>
      <H>4. Taste zones (computed)</H>
      <p>
        Places are clustered by the similarity of their lift profiles (cosine similarity, average linkage, the number of zones chosen by silhouette). Places
        that share a taste become one <b>taste zone</b>; a city can split into neighborhoods. Each zone's <b>ledger</b> keeps the titles with lift above 1.5
        inside it and below 1.0 elsewhere.
      </p>
      <H>5. The geist and the concepts (AI, cited)</H>
      <p>
        Claude names each audience (its <b>geist</b>) and writes three concepts from that ledger only. A validator then removes any line that doesn't cite a
        ledger entity, so every headline, partner and moodboard reference points back to Qloo data.
      </p>
      <H>6. The séance (AI, directional)</H>
      <p>
        Eight synthetic personas per zone are built from Qloo demographics and the ledger and voiced by Claude Haiku. They rate each concept on attention,
        resonance and intent from 1 to 5. The same personas judge a generic concept written without Qloo, which gives a measured uplift. It is a simulation:
        directional, never a survey. Validate with the A/B tests in the plan.
      </p>
      <H>7. The plan (computed)</H>
      <p>
        The budget splits by ledger strength; a city with neighborhood audiences hands its share to them, so nothing is counted twice. Flighting runs in three
        phases; A/B samples come from a two-proportion z-test. The same inputs always give the same plan.
      </p>
      <H>8. The culture profile</H>
      <p>
        Per place: titles in seven domains with lift against the brief's other places (Qloo), genres (Qloo), age and sex skew (Qloo demographics, group-level),
        nearby places (Qloo), a color palette computed from the place's imagery, 30-second previews from Deezer, and a mood reading and three descriptive lines
        written by Claude Haiku, labeled as interpretation.
      </p>
      <H>Glossary</H>
      <ul id="glossary">
        {Object.values(GLOSSARY).map((g) => (
          <li key={g.term}>
            <b>{g.term}:</b> {g.def}
          </li>
        ))}
      </ul>
      <H id="responsible-use">Responsible use</H>
      <ul>
        <li>
          <b>Groups, never people.</b> Every number is an aggregate taste signal from Qloo for a place. Séance personas are composites built from that data and
          labelled as such; none is a real person.
        </li>
        <li>
          <b>No sensitive traits.</b> No zone is named, described or targeted by ethnicity, religion, politics, health or sexuality, even where taste could act
          as a proxy. Generated names and lines that do are replaced or dropped before you see them, and a brief that asks to target or exclude people by such a
          trait is refused.
        </li>
        <li>
          <b>No stereotypes.</b> A séance quote that speaks from a demographic cliché ("as a woman", "boomers") instead of from taste is withheld; the persona's
          scores still count. Words inside real titles, like the podcast "Office Ladies", don't trigger it.
        </li>
        <li>
          <b>Checked, not promised.</b> The checks run on every generation and are listed in the campaign's "How it was made" tab when they act. The stored
          demos pass them with no changes.
        </li>
      </ul>
      <H>What the results don't prove</H>
      <ul>
        <li>Taste data describes groups, never individuals.</li>
        <li>Coverage varies by place; thin data gives weaker zones.</li>
        <li>The forecast applies a share of the synthetic uplift to your numbers. It is a scenario, not a prediction.</li>
      </ul>
      <p>
        Every run is recorded step by step: open any campaign's <b>How it was made</b> tab to see each Qloo and model call.
      </p>
    </LegalPage>
  )
}

const FAQ: [string, string][] = [
  [
    'What do I get from one campaign?',
    'Taste zones on a map, a culture profile per place, three cited concepts per zone, a synthetic test of each against a generic control, a media plan with audiences, geo targets and A/B tests, a client report you can share, and exports to Excel, PDF and JSON.',
  ],
  [
    'How long does a run take?',
    'Usually two to five minutes for a new campaign, depending on the number of places. Re-opening a finished campaign is instant; everything is cached.',
  ],
  [
    'Which places work?',
    'Any city Qloo knows, a whole country (Tastegeist finds the hotspots) or one city in depth (it finds the neighborhoods). Big cities have the richest data; small towns can come back thin.',
  ],
  [
    'Is the séance real research?',
    'No. It is a simulation built from real taste data and voiced by AI. Use it to pick directions, then validate with the A/B tests in the plan.',
  ],
  [
    'Can I use the images in my ads?',
    'No. Cover art, posters and photos come from Qloo as references and belong to their owners. Use them as a moodboard, then shoot or license your own.',
  ],
  [
    'Who sees my campaigns?',
    'Only this browser, unless you share a client report link: anyone with that link can read the report. Nothing is public or indexed.',
  ],
  ['How do I delete everything?', 'On the privacy page, "Delete my data" removes every campaign in this browser and the workspace cookie.'],
  ['What does it cost?', 'It is free while Tastegeist is in the Qloo Agentic Hackathon. The pricing page shows the intended plans.'],
]

export function Faq() {
  return (
    <LegalPage legal={false} kicker="Help" title="Questions, answered" intro="The things people ask first.">
      <div className="not-prose mt-2 divide-y divide-line border-y border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 t-h3">
              {q}
              <span className="text-mute transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-[65ch] text-ink-2">{a}</p>
          </details>
        ))}
      </div>
      <p>
        Something else? Write to {OPERATOR.email}. More on the method in <Link to="/methodology">How Tastegeist works</Link>.
      </p>
    </LegalPage>
  )
}

export function About() {
  return (
    <LegalPage
      legal={false}
      kicker="About"
      title="Why Tastegeist exists"
      intro="A culture deck from an agency costs $20k to $80k and takes weeks. Most brands get none, so they run one campaign everywhere. But taste is local."
    >
      <p>
        In our Amsterdam demo, De Pijp and Noord, ten minutes apart by bike, share only 60% of their top tastes; Amsterdam and Berlin share 79%. A city-wide
        campaign talks past most of what makes each place itself. Tastegeist reads that difference from Qloo's taste data and turns it into a plan, with every
        line traceable to the data behind it.
      </p>
      <H>Built for the Qloo Agentic Hackathon</H>
      <p>
        Tastegeist is an agent built on Qloo's Taste AI and Anthropic's Claude. It is open source under the MIT license; the code is on{' '}
        <a href="https://github.com/anesask/tastegeist">GitHub</a>.
      </p>
      <H>Principles</H>
      <ul>
        <li>Show the data behind every claim, and label what is AI.</li>
        <li>Describe groups, never individuals.</li>
        <li>No tracking, no ads, nothing personal sent to Qloo.</li>
      </ul>
      <H>Contact</H>
      <p>
        {OPERATOR.email}. Legal details are in the <Link to="/imprint">imprint</Link>.
      </p>
    </LegalPage>
  )
}

export function Security() {
  return (
    <LegalPage legal={false} kicker="Security" title="Security" intro="What we protect, how, and how to tell us when something is wrong.">
      <H>Keys and data</H>
      <ul>
        <li>API keys for Qloo and the AI providers live on the server only and never reach the browser.</li>
        <li>Nothing personal is sent to Qloo; requests contain places and cultural references.</li>
        <li>Campaigns are stored on our server under an anonymous workspace ID; there are no accounts or passwords to leak.</li>
        <li>Client reports are readable by anyone with their link, which contains an unguessable campaign ID. Don't share a link you want private.</li>
      </ul>
      <H>Abuse and cost protection</H>
      <ul>
        <li>Per-IP rate limits on new campaigns, runs, heatmaps, profiles and searches.</li>
        <li>A hard daily cap on AI spend; above it, new campaigns fall back to template concepts.</li>
      </ul>
      <H>Reporting a vulnerability</H>
      <p>
        Please report privately through <a href="https://github.com/anesask/tastegeist/security/advisories/new">GitHub security advisories</a> or by email to{' '}
        {OPERATOR.email}. Don't access other people's data while testing. We'll confirm receipt and keep you posted. The machine-readable contact is at{' '}
        <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
      </p>
    </LegalPage>
  )
}

const CHANGES: [string, string[]][] = [
  [
    '29 October 2026',
    [
      'Culture tab: a profile of every place, with a playable mixtape, image pie, mood, palette, audience and drill-down.',
      'How it was made: every run recorded step by step, with each Qloo and model call.',
      'Client report: a shareable, printable editorial report per campaign.',
      'Design system: monochrome brand, one type scale, one set of controls.',
      'Legal pages, storage notice and "Delete my data".',
    ],
  ],
  [
    '28 October 2026',
    [
      'Three demos: Amsterdam (neighborhoods), USA (cities) and all of Germany.',
      'Campaign wizard with whole-country, several-cities and one-city scopes.',
      'Séance with a generic control, media plan, exports to Excel, PDF and JSON.',
    ],
  ],
]

export function Changelog() {
  return (
    <LegalPage legal={false} kicker="Changelog" title="What's new">
      {CHANGES.map(([d, items]) => (
        <section key={d}>
          <H>{d}</H>
          <ul>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </LegalPage>
  )
}

export function Accessibility() {
  return (
    <LegalPage legal={false} kicker="Accessibility" title="Accessibility" intro="Our target is WCAG 2.2 level AA. Here is where we are, honestly.">
      <H>What works</H>
      <ul>
        <li>Text colors meet AA contrast in both themes; nothing is set below 12px.</li>
        <li>Every control is reachable by keyboard and shows a visible focus ring.</li>
        <li>Charts carry a text label, and bar, line and dot charts have their numbers as a table for screen readers.</li>
        <li>The map has a text version for screen readers: every audience and its places, and what the heatmap shows.</li>
        <li>Zone colors are checked for color blindness: every pair stays distinguishable under simulated protanopia, deuteranopia and tritanopia.</li>
        <li>Layouts work from 360px wide, and motion respects "reduce motion", including the map's camera moves.</li>
        <li>Choice groups (channels, ages, currency) are announced as named groups.</li>
      </ul>
      <H>Known gaps</H>
      <ul>
        <li>The 3D map can't be operated by keyboard; the same places and zones are listed as buttons beside it.</li>
        <li>Treemaps and the image pies have no table version yet; their values are in the text and tables nearby.</li>
      </ul>
      <H>Tell us</H>
      <p>If something blocks you, write to {OPERATOR.email} and we'll fix it or get you the content another way.</p>
    </LegalPage>
  )
}
