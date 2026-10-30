import { ArrowUp, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ThemeToggle, Wordmark } from './Brand'
import { LinkButton } from './ui'

/** How far the page has scrolled: px from the top and progress 0 to 1. */
function useScroll() {
  const [y, setY] = useState(0)
  const [p, setP] = useState(0)
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setY(window.scrollY)
      setP(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
    }
  }, [])
  return { y, p }
}

/**
 * The marketing and static pages' header. At the top it spans the page, transparent; once you scroll
 * it contracts into a floating glass pill (narrower, shorter, rounded), on a spring, with the reading
 * progress along its edge. Reduced motion gets the same states without the animation.
 */
export function SiteHeader({ sections = false }: { sections?: boolean }) {
  const { y, p } = useScroll()
  const reduce = useReducedMotion()
  const scrolled = y > 24
  // Slow and eased, so the bar visibly settles into a pill; reduced motion gets a short version.
  const spring = reduce ? { duration: 0.3, ease: 'easeOut' as const } : { duration: 0.75, ease: [0.22, 1, 0.36, 1] as const }
  const link = 'rounded-full px-3 py-1.5 transition-colors hover:bg-surface-2 hover:text-ink'
  return (
    <>
      <motion.div className="fixed inset-x-0 top-0 z-40 px-3" initial={false} animate={{ paddingTop: scrolled ? 10 : 0 }} transition={spring}>
        {/* At the top: a full-width frosted strip with a hairline, so the bar never melts into the page. */}
        <motion.div
          className="absolute inset-x-0 top-0 -z-10 h-[76px] border-b border-line bg-bg/80 backdrop-blur-xl"
          initial={false}
          animate={{ opacity: scrolled ? 0 : 1 }}
          transition={spring}
          aria-hidden
        />
        <motion.header
          className="relative isolate mx-auto flex items-center justify-between overflow-hidden"
          initial={false}
          animate={{
            maxWidth: scrolled ? 1000 : 1280,
            paddingTop: scrolled ? 7 : 20,
            paddingBottom: scrolled ? 7 : 20,
            paddingLeft: scrolled ? 18 : 20,
            paddingRight: scrolled ? 8 : 20,
            borderRadius: scrolled ? 28 : 0,
          }}
          transition={spring}
        >
          {/* The pill's glass: fades in as the strip fades out. */}
          <motion.div
            className="absolute inset-0 -z-10 border border-line bg-bg/75 shadow-[0_14px_40px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150"
            style={{ borderRadius: 'inherit' }}
            initial={false}
            animate={{ opacity: scrolled ? 1 : 0 }}
            transition={spring}
            aria-hidden
          />
          <motion.div initial={false} animate={{ scale: scrolled ? 0.9 : 1 }} transition={spring} style={{ transformOrigin: 'left center' }}>
            <Wordmark />
          </motion.div>
          <nav className="hidden items-center gap-1 text-sm text-ink-2 md:flex" aria-label="Site">
            {sections ? (
              <>
                <a href="#how" className={link}>
                  How it works
                </a>
                <a href="#why-qloo" className={link}>
                  Why Qloo
                </a>
              </>
            ) : (
              <Link to="/" className={link}>
                Product
              </Link>
            )}
            <Link to="/methodology" className={link}>
              Methodology
            </Link>
            <Link to="/report/eu" className={link}>
              Example report
            </Link>
            <Link to="/pricing" className={link}>
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/app/c/us/zones"
              className="hidden rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:inline-block"
            >
              See a sample
            </Link>
            <LinkButton to="/app/new" variant="primary" size="sm" className="h-9">
              Start your own
            </LinkButton>
          </div>
          <motion.div
            className="absolute bottom-0 left-0 h-[2px] origin-left bg-ink"
            style={{ width: '100%', scaleX: p }}
            initial={false}
            animate={{ opacity: scrolled ? 0.5 : 0 }}
            aria-hidden
          />
        </motion.header>
      </motion.div>
      {/* The header is fixed: keep its height in the flow. */}
      <div className="h-[76px]" aria-hidden />
      <BackToTop show={y > 700} />
    </>
  )
}

/** A quiet way back up, once you've scrolled a screen or so. */
function BackToTop({ show }: { show: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
      aria-label="Back to top"
      tabIndex={show ? 0 : -1}
      className={`fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full border border-line bg-bg/85 text-ink shadow-lg backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-surface-2 ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp size={18} />
    </button>
  )
}

const COLUMNS: {
  title: string
  links: { label: string; to: string; external?: boolean }[]
}[] = [
  {
    title: 'Product',
    links: [
      { label: 'Example report', to: '/report/eu' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'See a sample', to: '/app/c/us/zones' },
      { label: 'Start your own', to: '/app/new' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'How it works', to: '/methodology' },
      { label: 'Help', to: '/faq' },
      { label: 'Security', to: '/security' },
      { label: 'Accessibility', to: '/accessibility' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Imprint', to: '/imprint' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Cookies and storage', to: '/cookies' },
    ],
  },
]

/** The one footer: marketing pages, legal pages, the report and the 404. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line print:hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)] md:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm text-ink-2">Every neighborhood has a geist. Campaign strategy from cultural taste data, place by place.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <div className="kicker">{c.title}</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.to} target="_blank" rel="noreferrer" className="text-ink-2 transition hover:text-ink">
                      {l.label}
                    </a>
                  ) : (
                    <Link to={l.to} className="text-ink-2 transition hover:text-ink">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-mute md:px-8">
          <span>© 2026 Tastegeist. Built for the Qloo Agentic Hackathon.</span>
          <span>No tracking. No ads. Essential storage only.</span>
        </div>
      </div>
    </footer>
  )
}

/** The legal links in one quiet line, for the app shell where a full footer would be noise. */
export function LegalLine({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap gap-x-3 gap-y-1 text-xs text-mute ${className}`}>
      <Link to="/imprint" className="hover:text-ink">
        Imprint
      </Link>
      <Link to="/privacy" className="hover:text-ink">
        Privacy
      </Link>
      <Link to="/terms" className="hover:text-ink">
        Terms
      </Link>
      <Link to="/cookies" className="hover:text-ink">
        Cookies
      </Link>
    </nav>
  )
}

const NOTICE_KEY = 'tg-storage-notice'

/**
 * Tastegeist uses essential storage only, so no consent is needed (§ 25 Abs. 2 TDDDG); this notice
 * just says so once. Add a real consent banner here the day anything non-essential is added.
 */
export function StorageNotice() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      setOpen(!localStorage.getItem(NOTICE_KEY))
    } catch {
      setOpen(false)
    }
  }, [])
  // It is information, not a consent prompt: scrolling on counts as read, so it never sits on top of
  // a form on a small screen.
  useEffect(() => {
    if (!open) return
    const seen = () => close()
    const t = window.setTimeout(() => window.addEventListener('scroll', seen, { once: true, capture: true }), 1500)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('scroll', seen, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null
  function close() {
    try {
      localStorage.setItem(NOTICE_KEY, '1')
    } catch {
      // storage blocked: the notice simply shows again next time
    }
    setOpen(false)
  }
  return (
    <div role="region" aria-label="Storage notice" className="rise fixed bottom-4 left-4 right-4 z-50 sm:right-auto sm:max-w-sm print:hidden">
      <div className="card flex items-center gap-3 px-4 py-2.5 shadow-2xl sm:items-start sm:py-4">
        <p className="text-sm text-ink-2">
          <b className="text-ink">No tracking, no ads.</b>
          <span className="hidden sm:inline">
            {' '}
            Tastegeist only stores what it needs to work: one cookie that keeps your campaigns in this browser, and your theme and draft.
          </span>{' '}
          <Link to="/cookies" className="text-link" onClick={close}>
            Details
          </Link>
        </p>
        <button type="button" onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-surface-2" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
