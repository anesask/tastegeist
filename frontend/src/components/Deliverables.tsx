import { ArrowRight } from 'lucide-react'
import { Wash } from './Wash'

/** What one run hands over: three cards, each over a soft wash of the demo's own covers. */
export function Deliverables({ images }: { images: (string | null)[] }) {
  const items = [
    {
      href: '/report/us',
      file: false,

      title: 'Client report',
      text: 'The finding, a chapter per audience, the control and the plan. Share a link or print to PDF.',
    },
    {
      href: '/api/campaigns/us/export.xlsx',
      file: true,

      title: 'Media plan',
      text: 'Budget, audiences with Qloo interest keywords, geo targets, flighting and A/B tests, in Excel.',
    },
    {
      href: '/api/campaigns/us/export.pdf',
      file: true,

      title: 'One-page brief',
      text: 'The plan at a glance, for the people who sign it off.',
    },
  ]
  return (
    <div className="mt-12 grid gap-5 md:grid-cols-3">
      {items.map((x, i) => (
        <a
          key={x.title}
          href={x.href}
          {...(x.file ? { download: true } : {})}
          className="card card-interactive group relative isolate flex flex-col overflow-hidden p-7"
        >
          <Wash images={[images[i * 2], images[i * 2 + 1]]} />
          <div className="kicker">{x.file ? 'Download' : 'Share by link'}</div>
          <h3 className="t-h2 mt-3">{x.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{x.text}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-8 text-sm font-medium">
            {x.file ? 'Download the example' : 'Open the example'}
            <ArrowRight size={14} className="transition duration-500 group-hover:translate-x-0.5" />
          </span>
        </a>
      ))}
    </div>
  )
}
