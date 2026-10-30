import { useQuery } from '@tanstack/react-query'
import { BarChart3, FolderOpen, Layers, Map, Menu, PlusCircle, Settings2, Sparkles, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { api } from '../lib/api'
import { ThemeToggle, Wordmark } from '../components/Brand'
import { LegalLine } from '../components/Site'
import { Tour } from '../components/Tour'

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/app/new', label: 'New campaign', icon: <PlusCircle size={18} /> },
  { to: '/app', label: 'Campaigns', icon: <FolderOpen size={18} />, end: true },
  { to: '/app/zones', label: 'Taste Zones', icon: <Map size={18} /> },
  { to: '/app/creatives', label: 'Creatives', icon: <Sparkles size={18} /> },
  { to: '/app/plans', label: 'Media Plans', icon: <Layers size={18} /> },
  { to: '/app/insights', label: 'Insights', icon: <BarChart3 size={18} /> },
  { to: '/app/settings', label: 'Settings', icon: <Settings2 size={18} /> },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map((n, i) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-surface-2'
            } ${i === 0 ? 'mb-2' : ''}`
          }
        >
          {n.icon}
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** One status line when something the app depends on is down (T8). Silent when all is well. */
function StatusBanner() {
  const st = useQuery({ queryKey: ['status'], queryFn: api.status, refetchInterval: 60_000, retry: 1 })
  const line = (tone: 'coral' | 'amber', text: string, retry = false) => (
    <div className={`px-4 py-2 text-center text-sm ${tone === 'coral' ? 'bg-coral-soft text-coral' : 'bg-amber-soft text-amber'}`} role="status">
      {text}{' '}
      {retry && (
        <button className="font-medium underline" onClick={() => st.refetch()}>
          Retry
        </button>
      )}
    </div>
  )
  if (st.isError) return line('coral', 'The Tastegeist server is unreachable. Demo data may not load.', true)
  const s = st.data
  if (!s) return null
  if (s.qloo === 'down')
    return line('coral', 'Qloo, our taste data provider, is not answering right now. Demos work; new campaigns may fail until it is back.', true)
  if (s.model === 'cap')
    return line('amber', "Today's AI budget is used up. Demo campaigns work as normal; new campaigns get template concepts until tomorrow.")
  if (s.qloo === 'degraded' || s.qloo === 'slow') return line('amber', 'Qloo is responding slowly or with errors. New campaigns may take longer than usual.')
  if (s.model === 'off') return line('amber', 'AI writing is switched off on this server: new campaigns get template concepts.')
  return null
}

export function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="flex h-full flex-col">
      <StatusBanner />
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
          <div className="px-2">
            <Wordmark />
          </div>
          <div className="mt-8 flex-1">
            <Nav />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">Your workspace</div>
              <div className="text-xs text-mute">Saved in this browser</div>
            </div>
            <ThemeToggle />
          </div>
          <LegalLine className="mt-3 px-1" />
        </aside>

        {/* Mobile top bar and drawer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
            <Wordmark />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface">
                <Menu size={18} />
              </button>
            </div>
          </header>
          {open && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <button className="absolute inset-0 bg-ink/40" aria-label="Close menu" onClick={() => setOpen(false)} />
              <div className="rise absolute inset-y-0 left-0 w-72 bg-surface px-4 py-5 shadow-2xl">
                <div className="flex items-center justify-between px-2">
                  <Wordmark />
                  <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-xl">
                    <X size={18} />
                  </button>
                </div>
                <div className="mt-8">
                  <Nav onNavigate={() => setOpen(false)} />
                </div>
                <LegalLine className="mt-8 px-3" />
              </div>
            </div>
          )}
          <main className="relative min-h-0 flex-1 overflow-y-auto" id="main">
            <Outlet />
            <Tour />
          </main>
        </div>
      </div>
    </div>
  )
}
