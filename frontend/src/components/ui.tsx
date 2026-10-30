import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, Info } from 'lucide-react'

/*
 * Controls system (BRAND.md). One button, one chip, one text link, one interactive card.
 * Every control shares the same states: hover shifts surface or opacity, press scales to 0.98,
 * focus-visible draws the ink ring (global rule in index.css), disabled fades to 50%.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-2/40 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-coral text-on-brand hover:opacity-90',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}
const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-full font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className = '') => `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}) {
  return <button className={buttonClass(variant, size, className)} {...props} />
}

export function LinkButton({
  to,
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}

/** A selectable option: filters, toggles, segment choices. */
export function Chip({ selected = false, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition active:scale-[0.98] ${
        selected ? 'border-brand bg-brand font-medium text-on-brand' : 'border-line bg-surface text-ink-2 hover:border-ink-2/40 hover:text-ink'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** The one inline link style: ink text, quiet underline that strengthens on hover. */
export function TextLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line decoration-1 underline-offset-4 transition hover:decoration-ink ${className}`}
    >
      {children}
    </Link>
  )
}

const PILL: Record<string, string> = {
  draft: 'bg-brand-soft text-brand-ink',
  running: 'bg-amber-soft text-amber',
  ready: 'bg-mint-soft text-mint',
  failed: 'bg-coral-soft text-coral',
  demo: 'bg-lilac-soft text-lilac',
  neutral: 'bg-surface-2 text-ink-2',
}

export function Pill({ tone = 'neutral', children, dot = false }: { tone?: keyof typeof PILL | string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[tone] ?? PILL.neutral}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  running: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function Kpi({ value, label, sub, accent }: { value: ReactNode; label: string; sub?: ReactNode; accent?: string }) {
  return (
    <div>
      <div className="t-metric" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-mute">{label}</div>
      {sub && <div className="t-caption mt-1">{sub}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-mute">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** Hand-written annotation, as in the mockup ("Different tastes. Same city."). */
/** Small source label so every number says where it comes from. */
export function Source({ children }: { children: ReactNode }) {
  return (
    <span className="t-caption inline-flex items-center gap-1">
      <Info size={12} aria-hidden />
      {children}
    </span>
  )
}

type Toast = { id: number; text: string }
const ToastCtx = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="rise flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm text-bg shadow-lg">
            <CheckCircle2 size={16} aria-hidden />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
