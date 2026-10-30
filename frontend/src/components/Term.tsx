import { useId, type ReactNode } from 'react'
import { GLOSSARY, type GlossaryKey } from '../lib/glossary'

/** A product term with its definition on hover or keyboard focus. Use on the first mention per screen. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const id = useId()
  const g = GLOSSARY[k]
  return (
    <span className="group/term relative inline-block">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="cursor-help underline decoration-current/40 decoration-dotted underline-offset-[3px] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ink"
      >
        {children ?? g.term.toLowerCase()}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none hidden absolute top-full left-1/2 z-50 mt-2 w-64 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-bg shadow-xl group-focus-within/term:block group-hover/term:block"
      >
        <b className="font-semibold">{g.term}.</b> {g.def}
      </span>
    </span>
  )
}
