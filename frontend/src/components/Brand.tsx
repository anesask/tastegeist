import { Moon, Sun } from 'lucide-react'
import { Link } from 'react-router'
import { useTheme } from '../theme'

export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  const { theme } = useTheme()
  return <img src={theme === 'dark' ? '/logo-white.png' : '/logo-black.png'} alt="" className={className} />
}

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand" aria-label="Tastegeist home">
      <Logo />
      <span className="text-xl font-bold tracking-tight">Tastegeist</span>
    </Link>
  )
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-mute transition hover:text-ink ${className}`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
